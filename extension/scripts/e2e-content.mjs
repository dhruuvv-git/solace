/**
 * Content-script DOM test: injects the BUILT dist/content/*.js bundles into
 * mock WhatsApp-Web-like and Instagram-like pages in headless Chromium, with
 * a stubbed chrome.* API. Verifies blurring, own-message skipping, live
 * updates, typing warnings, the floating menu and profile review messages.
 *
 * This does NOT prove compatibility with the live sites, whose markup can
 * change at any time; it verifies Solace' logic against the documented
 * anchors ([data-pre-plain-text], [data-id], footer contenteditable,
 * span[dir=auto], header counts).
 *
 * Usage: CHROME_PATH=/path/to/chrome node scripts/e2e-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (n) => fs.readFileSync(path.join(root, 'dist', 'content', `${n}.js`), 'utf8');

const STUB = `
window.__sent = [];
window.__listeners = [];
const store = { settings: undefined };
window.chrome = {
  runtime: {
    id: 'test-ext',
    sendMessage: async (m) => { window.__sent.push(m); return { ok: true, screenshot: false }; },
    onMessage: { addListener: (f) => window.__listeners.push(f) },
  },
  storage: {
    local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o), remove: async () => {} },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
};
window.__ping = () => new Promise((res) => { for (const l of window.__listeners) l({ type: 'TL_PING' }, { id: 'test-ext' }, res); });
`;

const WA = `<!doctype html><html><body>
<div id="main">
  <div data-id="false_123_A" class="row"><div class="copyable-text" data-pre-plain-text="[10:21, 15/10/2026] Unknown Caller: "><span class="selectable-text"><span>you are a worthless loser, nobody likes you</span></span></div></div>
  <div data-id="false_123_B" class="row"><div class="copyable-text" data-pre-plain-text="[10:22, 15/10/2026] Asha: "><span class="selectable-text"><span>see you at practice tomorrow</span></span></div></div>
  <div data-id="true_123_C" class="row"><div class="copyable-text" data-pre-plain-text="[10:23, 15/10/2026] You: "><span class="selectable-text"><span>you idiot, you are so stupid</span></span></div></div>
</div>
<footer><div contenteditable="true" role="textbox" aria-label="Type a message" style="min-height:20px;border:1px solid #ccc"></div></footer>
</body></html>`;

const IG = `<!doctype html><html><body>
<header><img src="https://scontent.cdninstagram.com/v/pic.jpg" alt="priya.k's profile picture"><h2>priya.k</h2>
<ul><li>3 posts</li><li>12 followers</li><li>1,940 following</li></ul></header>
<main><ul>
  <li><a href="/rahul_x/" role="link"><span>rahul_x</span></a> <span dir="auto">you look so ugly and fat pig lol</span></li>
  <li><a href="/meera/" role="link"><span>meera</span></a> <span dir="auto">Beautiful picture!</span></li>
</ul></main>
<form><textarea aria-label="Add a comment…"></textarea></form>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
const results = [];
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', `${name}${ok ? '' : ` — ${detail}`}`]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function mockPage(url, html) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => results.push(['FAIL', `page error: ${e.message}`]));
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith(url.split('/').slice(0, 3).join('/')) ? r.respond({ contentType: 'text/html', body: html }) : r.respond({ status: 404, body: '' })));
  await page.evaluateOnNewDocument(STUB);
  await page.goto(url);
  return page;
}

/* ---------- WhatsApp ---------- */
{
  const page = await mockPage('http://wa.mock/', WA);
  await page.addScriptTag({ content: bundle('whatsapp') });
  await wait(900);
  const st = await page.evaluate(() => [...document.querySelectorAll('[data-pre-plain-text] .selectable-text')].map((e) => !!e.dataset.tlBlurred));
  check('WA: hurtful incoming message blurred', st[0] === true, JSON.stringify(st));
  check('WA: friendly message not blurred', st[1] === false, JSON.stringify(st));
  check('WA: own outgoing message not blurred', st[2] === false, JSON.stringify(st));
  check('WA: original text untouched', (await page.evaluate(() => document.querySelector('[data-id="false_123_A"]').innerText)).includes('worthless loser'));
  check('WA: label chip inserted', (await page.evaluate(() => document.querySelectorAll('[data-tl-chip]').length)) === 1);
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.setAttribute('data-id', 'false_123_D');
    d.innerHTML = '<div data-pre-plain-text="[10:30, 15/10/2026] Unknown Caller: "><span class="selectable-text">I will kill you</span></div>';
    document.getElementById('main').appendChild(d);
  });
  await wait(900);
  check('WA: newly arriving message is checked (MutationObserver)', await page.evaluate(() => !!document.querySelector('[data-id="false_123_D"] .selectable-text').dataset.tlBlurred));
  check('WA: floating button mounted once', (await page.evaluate(() => document.querySelectorAll('#trustlens-fab').length)) === 1);
  // composer warning
  await page.focus('footer [contenteditable]');
  await page.keyboard.type('shut up you idiot');
  await wait(900);
  check('WA: typing warning shown', await page.evaluate(() => !!document.getElementById('trustlens-composer')));
  // selection -> menu -> analyze
  await page.evaluate(() => {
    const s = document.querySelector('[data-id="false_123_A"] .selectable-text span');
    const r = document.createRange(); r.selectNodeContents(s);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await wait(300);
  const sent = await page.evaluate(async () => {
    // closed shadow root: drive the menu with keyboard-free DOM access through the host is impossible,
    // so call the same path the menu uses: click the host button via elementFromPoint.
    const host = document.getElementById('trustlens-fab');
    const r = host.getBoundingClientRect();
    return { visible: r.width >= 0 };
  });
  check('WA: menu host present', sent.visible);
  const vp = page.viewport() ?? { width: 800, height: 600 };
  await page.mouse.click(vp.width - 18 - 22, vp.height - 88 - 22);
  await wait(200);
  await page.keyboard.press('Tab'); // -> "Is it real?"
  await page.keyboard.press('Tab'); // -> "Is it kind?"
  await page.keyboard.press('Enter');
  await wait(300);
  const msgs = await page.evaluate(() => window.__sent);
  const kind = msgs.find((m) => m.type === 'TL_ANALYZE_TEXT');
  check('WA: menu sends selected text + sender to the panel', kind?.mode === 'kind' && kind.text.includes('worthless loser') && kind.senderLabel === 'Unknown Caller', JSON.stringify(msgs));
  const ping = await page.evaluate(() => window.__ping());
  check('WA: ping reports features', ping?.platform === 'whatsapp' && ping.features['abuse shield'] === 'active', JSON.stringify(ping));
  const reply = await page.evaluate(() => new Promise((res) => { for (const l of window.__listeners) l({ type: 'TL_SELECTION_CONTEXT' }, { id: 'test-ext' }, res); }));
  check('WA: sender of selected message reported', reply?.senderLabel === 'Unknown Caller', JSON.stringify(reply));
  const foreign = await page.evaluate(() => new Promise((res) => { let got = false; for (const l of window.__listeners) l({ type: 'TL_PING' }, { id: 'other-ext' }, () => { got = true; }); setTimeout(() => res(got), 100); }));
  check('WA: messages from other extensions ignored', foreign === false);
  await page.close();
}

/* ---------- Instagram ---------- */
{
  const page = await mockPage('http://ig.mock/priya.k/', IG);
  await page.addScriptTag({ content: bundle('instagram') });
  await wait(1000);
  const st = await page.evaluate(() => [...document.querySelectorAll('span[dir=auto]')].map((e) => !!e.dataset.tlBlurred));
  check('IG: hurtful comment blurred', st[0] === true, JSON.stringify(st));
  check('IG: friendly comment not blurred', st[1] === false, JSON.stringify(st));
  await page.focus('textarea');
  await page.keyboard.type('you are such a loser');
  await wait(900);
  check('IG: comment typing warning shown', await page.evaluate(() => !!document.getElementById('trustlens-composer')));
  const ping = await page.evaluate(() => window.__ping());
  check('IG: profile review available on profile page', ping?.features['profile review'] === 'active', JSON.stringify(ping));
  await page.close();
}

/* ---------- disabled setting turns integration off ---------- */
{
  const page = await mockPage('http://wa.mock/', WA);
  await page.evaluate(() => chrome.storage.local.set({ settings: { whatsappEnabled: false } }));
  await page.addScriptTag({ content: bundle('whatsapp') });
  await wait(900);
  check('WA disabled: nothing blurred, no button', await page.evaluate(() => !document.querySelector('[data-tl-blurred]') && !document.getElementById('trustlens-fab')));
  const ping = await page.evaluate(() => window.__ping());
  check('WA disabled: ping explains it is off', ping?.features.integration === 'off');
  await page.close();
}

console.log(results.map((r) => `${r[0]}  ${r[1]}`).join('\n'));
await browser.close();
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
