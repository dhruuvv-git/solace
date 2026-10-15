/**
 * Browser smoke test of the built UI pages in headless Chromium.
 * The pages are loaded over http (not as an installed extension), so chrome.*
 * APIs are absent and the UI uses its localStorage/IndexedDB fallbacks; this
 * checks rendering, navigation, the Web Worker image pipeline with real
 * browser codecs (createImageBitmap + OffscreenCanvas JPEG), the shields and
 * the Evidence Locker.
 *
 * Usage: CHROME_PATH=/path/to/chrome BASE=http://localhost:8765 node scripts/e2e-browser.mjs [screenshotDir]
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const SITE = JSON.parse(readFileSync(new URL('../../solace.config.json', import.meta.url), 'utf8')).appUrl;

const BASE = process.env.BASE ?? 'http://localhost:8765';
const shots = process.argv[2];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name}: ${e.message}`]); }
};
const clickText = async (text, sel = 'button') => {
  const ok = await page.evaluate((t, s) => {
    const b = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(t) && !x.disabled);
    if (b) { b.click(); return true; } return false;
  }, text, sel);
  if (!ok) throw new Error(`no clickable "${text}"`);
};
const nav = async (label) => {
  await page.click('.mimi-trigger');
  await page.waitForSelector('.mimi-menu [role=menuitem]');
  const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll('.mimi-menu [role=menuitem]')].find((x) => x.textContent.includes(t)); if (b) { b.click(); return true; } return false; }, label);
  if (!ok) throw new Error(`no menu item "${label}"`);
};
const waitText = (t, timeout = 20000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const shot = async (n) => { if (shots) await page.screenshot({ path: `${shots}/${n}.png`, fullPage: true }); };

await step('side panel renders overview', async () => {
  await page.goto(`${BASE}/sidepanel.html`, { waitUntil: 'networkidle0' });
  await waitText('Let’s check it before you trust');
  await shot('01-overview');
});

await step('quick check routes three analyses', async () => {
  await page.type('textarea', 'Send 5000 by tonight or I will leak your photos. FORWARD TO EVERYONE!!!');
  await clickText('Check');
  await waitText('Threat risk');
  await shot('02-quick');
});

await step('image analysis via Web Worker on a sample', async () => {
  await nav('Is It Real?');
  await page.select('select', 'debunked-demo-2.jpg');
  await waitText('debunked-demo-2.jpg');
  await clickText('Scan image');
  await waitText('How each signal voted', 30000);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes('Likely fake')) throw new Error('expected Likely fake for debunked demo');
  if (!/Error level analysis[\s\S]*?(Suspicious|Neutral|Supports real)/.test(txt)) throw new Error('ELA did not run in browser');
  if (!/Spectral slope[\s\S]*?α =/.test(txt)) throw new Error('spectral did not run');
  await shot('03-image-result');
});

await step('AI metadata sample is flagged', async () => {
  await clickText('Choose another');
  await page.select('select', 'demo-ai-metadata.png');
  await waitText('demo-ai-metadata.png');
  await clickText('Scan image');
  await waitText('How each signal voted', 30000);
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes('Embedded AI-generator settings found')) throw new Error('metadata finding missing');
});

await step('forward checker + correction card', async () => {
  await clickText('Forwarded message', '[role=tab]');
  await page.type('textarea', 'URGENT!!! Forward this to everyone before it is deleted. Sabko bhejo');
  await clickText('Check message');
  await waitText('Polite reply you can send');
});

await step('Is it kind: draft warning and suggestion', async () => {
  await nav('Is It Kind?');
  const tas = await page.$$('textarea');
  await tas[0].type('shut up you idiot, your plan is useless');
  await clickText('Check my message');
  await waitText('A kinder way to say it');
  await shot('04-kind');
});

await step('Is it kind: pattern history alert after repeats', async () => {
  const tas = await page.$$('textarea');
  const sender = await page.$('input[placeholder^="Name or number"]');
  await sender.type('Unknown 98xxxx');
  for (const msg of ['you are a loser, nobody likes you', 'you idiot, everyone hates you', 'you are worthless and pathetic']) {
    await tas[1].click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await tas[1].type(msg);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Check message'); b[b.length - 1].click(); });
    await waitText('Add to pattern history');
    await clickText('Add to pattern history');
    await new Promise((r) => setTimeout(r, 300));
  }
  await waitText('Repeated targeting');
  await shot('05-pattern');
});

await step('Is it really them: username lookalike', async () => {
  await nav('Is It Really Them?');
  const inputs = await page.$$('input[type=text]');
  await inputs[0].type('rahul_sharma');
  await inputs[1].type('rahul_sharrna');
  await clickText('Compare');
  await waitText('Possible lookalike');
  await clickText('Assess risk');
  await waitText('Based on 0 of 4 indicators');
  await shot('06-identity');
});

await step('Am I safe: sextortion → plan, intro modal, evidence save', async () => {
  await nav('Am I Safe?');
  await page.type('textarea', 'Send ₹5000 by tonight or I will leak your photos to your parents. I know your school.');
  await clickText('Check my safety');
  await waitText('Keep evidence automatically?');
  await clickText('Save automatically');
  await waitText('Saved to the Evidence Locker');
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes('Blackmail / sextortion')) throw new Error('category missing');
  if (!/Risk = likelihood 5 × severity 4 = 20/.test(txt)) throw new Error('risk math not shown as expected');
  if (!txt.includes('Legal options in India') || !txt.includes('§308')) throw new Error('legal section missing for sextortion');
  if (!txt.includes('Technical analysis')) throw new Error('technical analysis missing');
  await shot('07-safety');
});

await step('Am I safe: emergency override', async () => {
  const ta = await page.$('textarea');
  await ta.click({ clickCount: 3 }); await page.keyboard.press('Backspace');
  await ta.type("I'm outside your house right now. Come out or I will hurt you");
  await clickText('Check my safety');
  await waitText('If you are in danger now, call 112');
  await shot('08-emergency');
});

await step('Am I safe: ordinary abuse gets help, not law sections', async () => {
  const ta = await page.$('textarea');
  await ta.click({ clickCount: 3 }); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await ta.type('f*ck off you bitch');
  await clickText('Check my safety');
  await waitText('Abusive message, not a threat');
  const txt = await page.evaluate(() => document.body.innerText);
  if (txt.includes('Legal options in India')) throw new Error('legal section shown for ordinary abuse');
  if (!txt.includes('If you want to reply')) throw new Error('abuse help missing');
  await shot('08b-abuse');
});

await step('Am I safe: "ill fuck ur entire family" is a sexual-violence threat', async () => {
  const ta = await page.$('textarea');
  await ta.click(); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await ta.type('ill fuck ur entire family');
  await clickText('Check my safety');
  await waitText('Legal options in India');
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes('§351(3)')) throw new Error('351(3) missing');
  await shot('08c-threat');
});

await step('Evidence Locker lists and verifies fingerprints', async () => {
  await nav('Evidence Locker');
  await waitText('Select all');
  await clickText('View');
  await waitText('Unchanged since saved');
  await shot('09-locker');
  await page.keyboard.press('Escape');
});

await step('Train Your Eye plays a round', async () => {
  await nav('Train Your Eye');
  await waitText('Rating 1200');
  await clickText('Real original');
  await page.waitForFunction(() => /Correct|Not quite/.test(document.body.innerText));
  await clickText('Next picture');
  await shot('10-game');
});

await step('Settings toggles persist', async () => {
  await nav('Settings');
  const waSwitch = () => page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Enable on WhatsApp Web')); return document.getElementById(l.htmlFor); });
  await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Enable on WhatsApp Web')); document.getElementById(l.htmlFor).click(); });
  await waitText('Setting saved');
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('Settings');
  const v = await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Enable on WhatsApp Web')); return document.getElementById(l.htmlFor).checked; });
  if (v !== false) throw new Error('toggle did not persist');
  await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Enable on WhatsApp Web')); document.getElementById(l.htmlFor).click(); });
  void waSwitch;
});

await step('Groq answers a message check (Groq API mocked)', async () => {
  await page.setRequestInterception(true);
  const groqReply = { category: 'sexual_threat', serious: true, risk: 'high', summary: 'MOCK-GROQ: this is a threat of sexual violence.', why: ['ill fuck ur entire family'], do: ['Save the chat'], dont: ['Do not reply'], technical: ['Unknown numbers are often someone you know.'], legal: [{ law: 'BNS 2023', section: '351(3)', why: 'grave threat' }, { law: 'IPC', section: '506', why: 'old' }], replies: [], rewrite: null };
  page.on('request', (r) => {
    if (!r.url().startsWith('https://api.groq.com/')) return r.continue();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors });
    return r.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(groqReply) } }] }) });
  });
  await nav('Settings');
  await page.type('input[type=password]', 'gsk_' + 'x'.repeat(40));
  await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Let Groq answer')); document.getElementById(l.htmlFor).click(); });
  await waitText('Groq answers turned on');
  await nav('Am I Safe?');
  const ta = await page.$('textarea');
  await ta.click(); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  await ta.type('ill fuck ur entire family');
  await clickText('Check my safety');
  await waitText('MOCK-GROQ');
  const txt = await page.evaluate(() => document.body.innerText);
  if (!txt.includes('1 unverified reference removed')) throw new Error('unverified law not filtered');
  if (!txt.includes('Solace local check')) throw new Error('local check missing under AI answer');
  await shot('11-groq');
  await page.setRequestInterception(false);
});

await step('Mimi menu: keyboard navigation and Website button', async () => {
  await page.click('.mimi-trigger');
  await page.waitForSelector('.mimi-menu');
  const items = await page.$$eval('.mimi-menu [role=menuitem]', (els) => els.map((e) => e.textContent));
  if (items.length !== 9) throw new Error(`expected 9 menu items, got ${items.length}`);
  await page.keyboard.press('Escape');
  if (await page.$('.mimi-menu')) throw new Error('menu did not close on Escape');
  const popupPromise = new Promise((res) => browser.once('targetcreated', (t) => res(t.url())));
  await clickText('Website');
  const url = await Promise.race([popupPromise, new Promise((r) => setTimeout(() => r('none'), 3000))]);
  if (!String(url).startsWith(SITE)) throw new Error(`website opened ${url}, expected ${SITE}`);
});

await step('popup renders', async () => {
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 360, height: 600 });
  // chrome.* is unavailable outside the extension: the popup should at least render its markup or fail visibly
  p2.on('pageerror', () => {});
  await p2.goto(`${BASE}/popup.html`, { waitUntil: 'networkidle0' });
  await p2.close();
});

console.log(results.map((r) => `${r[0]}  ${r[1]}`).join('\n'));
const unexpected = errors.filter((e) => !/chrome is not defined|Failed to load resource/.test(e));
if (unexpected.length) console.log('Browser errors:\n' + unexpected.join('\n'));
await browser.close();
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
