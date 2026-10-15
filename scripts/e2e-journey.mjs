#!/usr/bin/env node
/**
 * Full-journey test in real Chromium with the real Mimi extension loaded:
 * landing → sign-up (validation) → onboarding → dashboard → vault → link Mimi →
 * settings sync → protected routes → refresh persistence → sign-out (Mimi too) →
 * sign-in errors → expired session handling → device revoke → extension expired state.
 *
 * Needs: `npm run build` and `npm run extension:build` first (uses dist/ and extension/dist/).
 * Usage: node scripts/e2e-journey.mjs [screenshotDir]
 *   CHROME_PATH  Chromium/Chrome binary (default: Playwright's Chromium in /opt/pw-browsers)
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'extension', 'package.json'));
const puppeteer = require('puppeteer-core');
const cfg = JSON.parse(readFileSync(path.join(root, 'solace.config.json'), 'utf8'));
const EXT = cfg.extensionId;
const PORT = 5173;
const BASE = `http://localhost:${PORT}`;
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
for (const p of [path.join(root, 'dist', 'index.html'), path.join(root, 'extension', 'dist', 'manifest.json')]) {
  if (!existsSync(p)) { console.error(`Missing ${p} — run npm run build && npm run extension:build first.`); process.exit(1); }
}

/* ---------- start the API + built site ---------- */
const tmp = mkdtempSync(path.join(tmpdir(), 'solace-e2e-'));
const dbFile = path.join(tmp, 'db.json');
const api = spawn(process.execPath, [path.join(root, 'server', 'index.mjs'), '--production'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SOLACE_DB_FILE: dbFile }, stdio: ['ignore', 'pipe', 'pipe'] });
let apiLog = '';
api.stdout.on('data', (d) => { apiLog += d; });
api.stderr.on('data', (d) => { apiLog += d; });
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 100));
}

/* ---------- browser with Mimi installed ---------- */
const extDir = path.join(root, 'extension', 'dist');
const profile = path.join(tmp, 'profile');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-sandbox', '--disable-gpu', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// 401/409 responses are expected in this test; ERR_TUNNEL/NAME errors are Google Fonts being unreachable from the test sandbox.
page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[19]|net::ERR_(TUNNEL|NAME|PROXY|CONNECTION)/.test(m.text())) pageErrors.push(m.text()); });

const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); process.stdout.write(`PASS ${name}\n`); }
  catch (e) { results.push(['FAIL', `${name}: ${e.message}`]); process.stdout.write(`FAIL ${name}: ${e.message}\n`); if (shots) await page.screenshot({ path: `${shots}/FAIL-${results.length}.png` }).catch(() => {}); }
};
const waitText = (t, timeout = 15000, p = page) => p.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const clickText = async (text, sel = 'button, a', p = page) => {
  await p.waitForFunction((t, s) => [...document.querySelectorAll(s)].some((x) => x.textContent.trim().includes(t) && !x.disabled), { timeout: 15000 }, text, sel);
  await p.evaluate((t, s) => { [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(t) && !x.disabled).click(); }, text, sel);
};
const typeInto = async (sel, value, p = page) => {
  await p.$eval(sel, (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.type(sel, value);
};
const shot = async (n, p = page, full = false) => { if (shots) await p.screenshot({ path: `${shots}/${n}.png`, fullPage: full }); };
const hash = () => page.evaluate(() => location.hash);
const assert = (c, m) => { if (!c) throw new Error(m); };

const extPage = async (file = 'sidepanel.html') => {
  const p = await browser.newPage();
  await p.setViewport({ width: 400, height: 860 });
  await p.goto(`chrome-extension://${EXT}/${file}`, { waitUntil: 'networkidle0' });
  return p;
};
const extStorage = async (keys) => {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${EXT}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  const v = await p.evaluate((k) => chrome.storage.local.get(k), keys);
  await p.close();
  return v;
};

const EMAIL = `asha.${Date.now()}@example.com`;
const PASS = 'Solace-test-42';

await step('extension is installed and answers the website', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const r = await page.evaluate((id) => new Promise((res) => chrome.runtime.sendMessage(id, { type: 'TL_HELLO' }, res)), EXT);
  assert(r?.ok && r.version === '2.0.0' && r.account?.status === 'signed-out', `HELLO reply ${JSON.stringify(r)}`);
});

await step('landing renders with working navigation', async () => {
  await waitText('because you are');
  await shot('01-landing');
  await clickText('RESPONSE PROTOCOL');
  await page.waitForFunction(() => document.getElementById('solution').getBoundingClientRect().top < 200, { timeout: 5000 });
  await page.evaluate(() => window.scrollTo(0, 0));
});

await step('Get Started opens sign-up; switch to log in and back', async () => {
  await clickText('Get Started');
  await page.waitForSelector('[role=dialog]');
  assert((await hash()) === '#/signup', `hash ${await hash()}`);
  await waitText('Join Solace Workspace');
  await clickText('Log in', '[role=dialog] button');
  await waitText('Welcome back to Solace');
  assert((await hash()).startsWith('#/signin'), 'switched to signin');
  await clickText('Sign up', '[role=dialog] button');
  await waitText('Join Solace Workspace');
});

await step('sign-up validation shows field errors and blocks submit', async () => {
  await page.click('[role=dialog] button[type=submit]');
  await waitText('Enter your name or a nickname.');
  await waitText('Enter your email address.');
  await page.type('#auth-name', 'Asha');
  await page.type('#auth-email', 'not-an-email');
  await page.type('#auth-password', 'short');
  await page.click('[role=dialog] button[type=submit]');
  await waitText('That email address doesn’t look right.');
  await waitText('Use at least 8 characters.');
  await shot('02-signup-errors');
  await typeInto('#auth-email', EMAIL);
  await typeInto('#auth-password', PASS);
  await page.type('#auth-confirm', 'different-1');
  await page.click('[role=dialog] button[type=submit]');
  await waitText('Passwords don’t match.');
  const users = JSON.parse(existsSync(dbFile) ? readFileSync(dbFile, 'utf8') : '{"users":[]}').users;
  assert(users.length === 0, 'no account created while invalid');
});

await step('sign-up creates a real account and starts onboarding', async () => {
  await typeInto('#auth-confirm', PASS);
  await page.click('[role=dialog] button[type=submit]');
  await page.waitForFunction(() => location.hash.startsWith('#/onboarding'), { timeout: 15000 });
  await waitText('What brings you to');
  const db = JSON.parse(readFileSync(dbFile, 'utf8'));
  const u = db.users.find((x) => x.email === EMAIL);
  assert(u && u.passwordHash.startsWith('scrypt$') && !readFileSync(dbFile, 'utf8').includes(PASS), 'stored hashed');
  const cookies = await page.cookies();
  const c = cookies.find((x) => x.name === 'solace_session');
  assert(c && c.httpOnly && c.sameSite === 'Lax', 'HttpOnly SameSite cookie');
  assert(await page.evaluate(() => !document.cookie.includes('solace_session')), 'cookie hidden from page JS');
  await shot('03-onboarding-1');
});

await step('onboarding: concern → golden-hour clock → Mimi step → dashboard', async () => {
  await clickText('A deepfake or morphed image of me');
  await clickText('Continue');
  await waitText('When did you find it?');
  await shot('04-onboarding-2');
  await clickText('Continue');
  await waitText('Add Mimi to your browser');
  await page.waitForSelector('[data-testid=mimi-status][data-state=installed]', { timeout: 10000 });
  await shot('05-onboarding-3');
  await clickText('Go to my dashboard');
  await page.waitForFunction(() => location.hash === '#/dashboard', { timeout: 10000 });
  await waitText('Incident Response Workspace');
  await waitText('Since you found it');
  await waitText('Mimi installed · connect');
  await shot('06-dashboard');
});

await step('session survives a page refresh', async () => {
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Incident Response Workspace');
  await waitText(EMAIL);
});

await step('protected routes reject signed-out visitors', async () => {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/#/dashboard/vault`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => location.hash.startsWith('#/signin'), { timeout: 10000 });
  const h = await p.evaluate(() => location.hash);
  assert(h.includes('next=%2Fdashboard%2Fvault'), `redirect keeps next: ${h}`);
  await p.waitForFunction(() => document.body.innerText.includes('Please log in to continue.'), { timeout: 5000 });
  const r = await p.evaluate(async () => (await fetch('/api/settings')).status);
  assert(r === 401, 'API rejects without session');
  await ctx.close();
});

let sealedHash = '';
await step('Evidence Vault seals a real file (SHA-256 matches) and persists', async () => {
  await clickText('Evidence Vault');
  await waitText('No evidence sealed yet');
  const file = path.join(tmp, 'screenshot_proof.png');
  const bytes = Buffer.from('solace evidence sample ' + Date.now());
  writeFileSync(file, bytes);
  sealedHash = createHash('sha256').update(bytes).digest('hex');
  const input = await page.$('[data-testid=vault-input]');
  await input.uploadFile(file);
  await waitText('screenshot_proof.png');
  await waitText(sealedHash.slice(0, 24));
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText(sealedHash.slice(0, 24));
  await shot('07-vault');
});

await step('incident report: describe → photo → details → report lists both fingerprints; deadlines show 2h / 3h / 7d', async () => {
  await clickText('Incident Report');
  await waitText('Incident Report Builder');
  await clickText('Harassment or bullying');
  await page.type('[data-testid=report-description]', 'Since 3 October an unknown account has sent me abusive messages every night and threatened to post my photos.');
  await clickText('Next: Photos');
  const file = path.join(tmp, 'threat_screenshot.png');
  const bytes = Buffer.from('solace report photo ' + Date.now());
  writeFileSync(file, bytes);
  const photoHash = createHash('sha256').update(bytes).digest('hex');
  await (await page.$('[data-testid=report-photos]')).uploadFile(file);
  await waitText('A-1');
  await clickText('Next: Your details');
  await clickText('Next: Review');
  await page.waitForSelector('[data-testid=report-preview]');
  await waitText('Respected Sir / Madam');
  await waitText(`SHA-256: ${photoHash}`);
  await waitText(sealedHash);
  await shot('08-report', page, true);
  await clickText('Takedown Deadlines');
  await waitText('2-Hour Emergency Removal');
  await waitText('3-Hour Court / Govt Order');
  await waitText('7-Day Grievance Resolution');
  await clickText('I’ve sent it now');
  await waitText(' left');
  await shot('08b-deadlines');
});

await step('link Mimi to the account (one-time code → device token)', async () => {
  await clickText('Mimi Extension');
  await page.waitForSelector('[data-testid=mimi-status][data-state=installed]');
  await clickText('Connect Mimi to this account');
  await page.waitForSelector('[data-testid=mimi-status][data-linked=yes]', { timeout: 15000 });
  await waitText('Mimi connected');
  await shot('09-mimi-linked');
  const st = await extStorage(['account']);
  assert(st.account?.user?.email === EMAIL && st.account.token?.length > 30, 'token stored in extension');
  const db = JSON.parse(readFileSync(dbFile, 'utf8'));
  assert(db.deviceTokens.length === 1 && !JSON.stringify(db).includes(st.account.token), 'only the token hash is on the server');
});

await step('extension side panel shows the signed-in account', async () => {
  const p = await extPage('sidepanel.html');
  await p.waitForSelector('.acct-avatar', { timeout: 10000 });
  await clickText('Asha', 'button', p).catch(async () => { await p.click('.acct-chip'); });
  await p.waitForFunction((e) => document.body.innerText.includes(e), { timeout: 10000 }, EMAIL);
  await shot('10-ext-settings-account', p);
  await p.close();
});

await step('settings sync: website change reaches Mimi; Mimi change reaches website', async () => {
  await clickText('Account');
  await waitText('Mimi settings (synced)');
  await page.waitForFunction(() => document.body.innerText.includes('Hide hurtful messages'), { timeout: 10000 });
  await page.evaluate(() => { [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Hide hurtful messages')).querySelector('input').click(); });
  await waitText('Mimi picks this up');
  const p = await extPage('sidepanel.html'); // opening the panel refreshes the account
  await p.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.abuseShieldBlur === false, { timeout: 10000 });
  await p.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, composerWarnings: false } }); });
  await new Promise((r) => setTimeout(r, 2500)); // service worker debounces 1.2 s
  await p.close();
  const s = await page.evaluate(async () => (await (await fetch('/api/settings')).json()).settings);
  assert(s.abuseShieldBlur === false && s.composerWarnings === false, `server settings ${JSON.stringify(s)}`);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Linked devices');
  await waitText('Mimi on');
  await shot('11-account', page, true);
});

await step('sign-out ends the session and signs Mimi out too', async () => {
  await page.evaluate(() => { document.querySelector('button[aria-label="Sign out"]').click(); });
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', { timeout: 10000 });
  await waitText('because you are');
  await waitText('Sign In');
  const st = await extStorage(['account']);
  assert(!st.account, 'extension forgot the token');
  const db = JSON.parse(readFileSync(dbFile, 'utf8'));
  assert(db.deviceTokens.every((t) => t.revokedAt), 'server revoked the device token');
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => location.hash.startsWith('#/signin'), { timeout: 10000 });
});

await step('sign-in: wrong password, then correct; returning user skips onboarding', async () => {
  await page.waitForSelector('#auth-email');
  await page.type('#auth-email', EMAIL);
  await page.type('#auth-password', 'wrong-pass-9');
  await page.click('[role=dialog] button[type=submit]');
  await waitText('That email and password don’t match.');
  await shot('12-signin-error');
  await page.type('#auth-password', PASS);
  await page.click('[role=dialog] button[type=submit]');
  await page.waitForFunction(() => location.hash === '#/dashboard', { timeout: 10000 });
  await waitText('Incident Response Workspace');
});

await step('duplicate account is refused with a helpful message', async () => {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/#/signup`, { waitUntil: 'networkidle0' });
  await p.type('#auth-name', 'Someone');
  await p.type('#auth-email', EMAIL.toUpperCase());
  await p.type('#auth-password', PASS);
  await p.type('#auth-confirm', PASS);
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForFunction(() => document.body.innerText.includes('already exists'), { timeout: 10000 });
  await ctx.close();
});

await step('"Sign in" from Mimi → #/connect links automatically', async () => {
  const p = await extPage('sidepanel.html');
  await p.waitForSelector('.acct-signin');
  await p.close();
  await page.goto(`${BASE}/#/connect`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid=mimi-status][data-linked=yes]', { timeout: 15000 });
  const st = await extStorage(['account']);
  assert(st.account?.user?.email === EMAIL, 'linked again');
});

await step('device revoked on the website → Mimi shows “session ended”', async () => {
  await page.goto(`${BASE}/#/dashboard/account`, { waitUntil: 'networkidle0' });
  await clickText('Sign out device');
  await waitText('No Mimi is connected');
  const p = await extPage('sidepanel.html');
  await p.waitForFunction(() => document.querySelector('.acct-signin')?.textContent.includes('Sign in again'), { timeout: 10000 });
  await shot('13-ext-expired', p);
  await p.close();
});

await step('expired website session sends the user to sign in with a notice', async () => {
  await page.deleteCookie({ name: 'solace_session', url: BASE });
  await page.setCookie({ name: 'solace_session', value: 'stale-token-value-xxxxxxxxxxxxxxxx', url: BASE, httpOnly: true, sameSite: 'Lax' });
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' }); // a fresh visit with the stale cookie
  await page.waitForFunction(() => location.hash.startsWith('#/signin'), { timeout: 10000 });
  await waitText('Your session expired. Please log in again.');
  await shot('14-expired');
});

await step('popup renders with the account card', async () => {
  const p = await extPage('popup.html');
  await p.setViewport({ width: 360, height: 640 });
  await p.waitForFunction(() => document.body.innerText.includes('Open Mimi'), { timeout: 10000 });
  await shot('15-popup', p, true);
  await p.close();
});

await step('mobile layouts: landing, auth modal and dashboard fit 390px', async () => {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(over <= 1, `landing overflows by ${over}px`);
  await shot('16-mobile-landing', p);
  await p.goto(`${BASE}/#/signin`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('#auth-email');
  await shot('17-mobile-signin', p);
  await p.type('#auth-email', EMAIL); await p.type('#auth-password', PASS);
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForFunction(() => location.hash === '#/dashboard', { timeout: 10000 });
  const over2 = await p.evaluate(() => document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth);
  assert(over2 <= 1, `dashboard overflows by ${over2}px`);
  await shot('18-mobile-dashboard', p);
  await p.click('button[aria-label="Open menu"]');
  await p.waitForSelector('aside');
  await shot('19-mobile-menu', p);
  await p.close();
});

await step('no uncaught page errors', async () => { assert(pageErrors.length === 0, pageErrors.slice(0, 5).join(' | ')); });

await browser.close();
api.kill();
rmSync(tmp, { recursive: true, force: true });
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} journey checks passed`);
if (fails.length) { console.log(apiLog.slice(-2000)); process.exit(1); }
