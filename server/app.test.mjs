/** API tests: run with `npm run test:api` (node:test, no extra dependencies). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, validateSignup } from './app.mjs';

const EXT = 'gkjdoahaifebddccafjnenhmjcgokcdf';
let base, server, dir, dbFile;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'solace-api-'));
  dbFile = path.join(dir, 'db.json');
  ({ server } = await createApp({ dbFile, extensionIds: [EXT], appOrigins: [] }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

const WEB = 'http://localhost:5173';
/** Minimal cookie jar per "browser". */
function browser() {
  let cookie = '';
  return async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { Origin: WEB, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) { const v = set.split(';')[0]; cookie = v.endsWith('=') ? '' : v; }
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
}
const ext = async (method, p, body, token) => {
  const res = await fetch(base + p, {
    method,
    headers: { Origin: `chrome-extension://${EXT}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

test('signup validation rules', () => {
  assert.equal(validateSignup({ name: 'A', email: 'a@b.co', password: 'abcdefg1' }).ok, true);
  assert.ok(validateSignup({ name: '', email: 'x', password: 'short' }).errors.name);
  assert.ok(validateSignup({ name: 'A', email: 'not-an-email', password: 'abcdefg1' }).errors.email);
  assert.ok(validateSignup({ name: 'A', email: 'a@b.co', password: 'abcdefgh' }).errors.password, 'needs a digit');
  assert.ok(validateSignup({ name: 'A', email: 'a@b.co', password: 'abc12' }).errors.password, 'too short');
});

test('sign up → session → me → sign out → protected routes reject', async () => {
  const b = browser();
  const r = await b('POST', '/api/auth/signup', { name: 'Asha', email: 'Asha@Example.com', password: 'safe-pass-1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'asha@example.com');
  assert.equal(r.body.user.onboarding.completed, false);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  assert.match(r.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(r.body.user.passwordHash, undefined, 'never leaks the hash');

  const me = await b('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, 'Asha');

  const out = await b('POST', '/api/auth/signout', {});
  assert.equal(out.status, 200);
  const after = await b('GET', '/api/auth/me');
  assert.equal(after.status, 401);
  assert.equal(after.body.error, 'not_signed_in');
});

test('passwords are stored hashed with scrypt, never in plain text', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'Hash', email: 'hash@example.com', password: 'plain-text-9' });
  const raw = readFileSync(dbFile, 'utf8');
  assert.ok(!raw.includes('plain-text-9'));
  assert.match(raw, /"passwordHash": "scrypt\$32768\$8\$1\$/);
});

test('duplicate email → 409; wrong password → 401 with a generic message', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'Dev', email: 'dev@example.com', password: 'correct-pass-1' });
  const dup = await browser()('POST', '/api/auth/signup', { name: 'Dev2', email: 'DEV@example.com', password: 'another-pass-1' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'email_taken');
  const bad = await browser()('POST', '/api/auth/signin', { email: 'dev@example.com', password: 'wrong-pass-1' });
  assert.equal(bad.status, 401);
  const unknown = await browser()('POST', '/api/auth/signin', { email: 'nobody@example.com', password: 'wrong-pass-1' });
  assert.equal(unknown.status, 401);
  assert.equal(bad.body.message, unknown.body.message, 'does not reveal which emails exist');
  const missing = await browser()('POST', '/api/auth/signin', { email: '', password: '' });
  assert.equal(missing.status, 400);
  assert.ok(missing.body.fields.email && missing.body.fields.password);
  const ok = await browser()('POST', '/api/auth/signin', { email: ' Dev@Example.com ', password: 'correct-pass-1' });
  assert.equal(ok.status, 200);
});

test('sign-in attempts are rate limited per email', async () => {
  await browser()('POST', '/api/auth/signup', { name: 'Rate', email: 'rate@example.com', password: 'correct-pass-1' });
  let last;
  for (let i = 0; i < 9; i++) last = await browser()('POST', '/api/auth/signin', { email: 'rate@example.com', password: 'nope-nope-1' });
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});

test('CSRF: cross-site origin and non-JSON bodies are rejected', async () => {
  const evil = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', email: 'x@y.co', password: 'abcdefg1' }) });
  assert.equal(evil.status, 403);
  const form = await fetch(base + '/api/auth/signin', { method: 'POST', headers: { Origin: WEB, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(form.status, 415);
});

test('onboarding and incident are saved to the account', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'On', email: 'on@example.com', password: 'onboard-me-1' });
  const bad = await b('POST', '/api/account/onboarding', { concern: 'nonsense' });
  assert.equal(bad.status, 400);
  const r = await b('POST', '/api/account/onboarding', { concern: 'deepfake', startIncident: true });
  assert.equal(r.body.user.onboarding.completed, true);
  assert.equal(r.body.user.incident.type, 'deepfake');
  const sent = Date.now();
  const inc = await b('PUT', '/api/account/incident', { noticeSentAt: sent });
  assert.equal(inc.body.user.incident.noticeSentAt, sent);
  const future = await b('PUT', '/api/account/incident', { noticeSentAt: Date.now() + 10 * 86400000 });
  assert.equal(future.status, 400);
  const cleared = await b('PUT', '/api/account/incident', { clear: true });
  assert.equal(cleared.body.user.incident, null);
});

test('extension link: one-time code → device token → me; code reuse fails; settings sync', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'Link', email: 'link@example.com', password: 'link-me-123' });
  const noAuth = await browser()('POST', '/api/extension/link-code', {});
  assert.equal(noAuth.status, 401, 'needs a website session');

  const { body: { code } } = await b('POST', '/api/extension/link-code', {});
  assert.ok(code.length >= 30);
  const ex = await ext('POST', '/api/extension/exchange', { code, deviceName: 'Chrome' });
  assert.equal(ex.status, 200);
  assert.equal(ex.headers.get('access-control-allow-origin'), `chrome-extension://${EXT}`);
  assert.equal(ex.body.user.email, 'link@example.com');
  const token = ex.body.token;

  const again = await ext('POST', '/api/extension/exchange', { code });
  assert.equal(again.status, 400, 'codes are single-use');

  const me = await ext('GET', '/api/extension/me', undefined, token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, 'Link');

  const put = await ext('PUT', '/api/extension/settings', { settings: { abuseShieldBlur: false, threshold: 0.99, groqApiKey: 'gsk_secret', customLexicon: [{ term: ' Badword ', category: 'insult', weight: 9, lang: 'en' }, { term: 'x', category: 'insult', weight: 1 }, 'junk'] } }, token);
  assert.equal(put.body.settings.abuseShieldBlur, false);
  assert.equal(put.body.settings.threshold, 0.8, 'clamped');
  assert.equal(put.body.settings.groqApiKey, undefined, 'API keys never sync');
  assert.deepEqual(put.body.settings.customLexicon, [{ term: 'badword', category: 'insult', weight: 3, lang: 'en' }]);
  const web = await b('GET', '/api/settings');
  assert.equal(web.body.settings.abuseShieldBlur, false, 'website sees the same account settings');

  const devices = await b('GET', '/api/extension/devices');
  assert.equal(devices.body.devices.length, 1);
  assert.equal(devices.body.devices[0].tokenHash, undefined);
});

test('website sign-out also signs out the Mimi linked from that session', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'Out', email: 'out@example.com', password: 'sign-out-12' });
  const { body: { code } } = await b('POST', '/api/extension/link-code', {});
  const { body: { token } } = await ext('POST', '/api/extension/exchange', { code });
  assert.equal((await ext('GET', '/api/extension/me', undefined, token)).status, 200);
  await b('POST', '/api/auth/signout', {});
  const me = await ext('GET', '/api/extension/me', undefined, token);
  assert.equal(me.status, 401);
  assert.equal(me.body.error, 'session_expired');
});

test('extension sign-out and device revoke from the website', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'Rev', email: 'rev@example.com', password: 'revoke-me-1' });
  const t1 = (await ext('POST', '/api/extension/exchange', { code: (await b('POST', '/api/extension/link-code', {})).body.code })).body;
  await ext('POST', '/api/extension/signout', {}, t1.token);
  assert.equal((await ext('GET', '/api/extension/me', undefined, t1.token)).status, 401);
  const t2 = (await ext('POST', '/api/extension/exchange', { code: (await b('POST', '/api/extension/link-code', {})).body.code })).body;
  const del = await b('DELETE', `/api/extension/devices/${t2.deviceId}`, {});
  assert.equal(del.status, 200);
  assert.equal((await ext('GET', '/api/extension/me', undefined, t2.token)).status, 401);
  assert.equal((await ext('GET', '/api/extension/me', undefined, 'not-a-real-token-xxxxxxxxxx')).status, 401);
});

test('CORS preflight allows only the Solace extension', async () => {
  const ok = await fetch(base + '/api/extension/me', { method: 'OPTIONS', headers: { Origin: `chrome-extension://${EXT}`, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), `chrome-extension://${EXT}`);
  const other = await fetch(base + '/api/extension/me', { method: 'OPTIONS', headers: { Origin: 'chrome-extension://someoneelse', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('delete account requires the password and removes everything', async () => {
  const b = browser();
  await b('POST', '/api/auth/signup', { name: 'Del', email: 'del@example.com', password: 'delete-me-1' });
  assert.equal((await b('DELETE', '/api/account', { password: 'wrong-pass-1' })).status, 401);
  assert.equal((await b('DELETE', '/api/account', { password: 'delete-me-1' })).status, 200);
  assert.equal((await browser()('POST', '/api/auth/signin', { email: 'del@example.com', password: 'delete-me-1' })).status, 401);
});
