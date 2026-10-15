/** Extension account link + settings sync, with a stubbed chrome.storage and a fake Solace API. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const local: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, local[x]])),
      set: async (o: object) => { Object.assign(local, JSON.parse(JSON.stringify(o))); },
      remove: async (k: string) => { delete local[k]; },
    },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
};

type Call = { method: string; path: string; body: Record<string, unknown> | undefined; auth: string | null };
const calls: Call[] = [];
let serverSettings: Record<string, unknown> | null = null;
let meStatus = 200;
const fetchMock = vi.fn(async (url: URL | string, init: RequestInit = {}) => {
  const u = new URL(String(url));
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? null;
  calls.push({ method: init.method ?? 'GET', path: u.pathname, body, auth });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  if (u.pathname === '/api/extension/exchange') return body?.code === 'good-code-aaaaaaaaaaaaaaaaaa' ? json(200, { token: 'tok-1-xxxxxxxxxxxxxxxxxxxxxxxx', expiresAt: Date.now() + 1e9, user, settings: serverSettings }) : json(400, { error: 'invalid_code', message: 'This link has expired.' });
  if (u.pathname === '/api/extension/settings') { serverSettings = { ...(serverSettings ?? {}), ...(body?.settings as object) }; return json(200, { settings: serverSettings }); }
  if (u.pathname === '/api/extension/me') return meStatus === 200 ? json(200, { user: { ...user, name: 'Asha K' }, settings: serverSettings, expiresAt: Date.now() + 1e9 }) : json(401, { error: 'session_expired', message: 'Mimi was signed out.' });
  if (u.pathname === '/api/extension/signout') return json(200, { ok: true });
  return json(404, {});
});
vi.stubGlobal('fetch', fetchMock);

const acct = await import('../src/account/account');
const { getSettings, saveSettings } = await import('../src/shared/settings');
const { validateFromWebsite } = await import('../src/shared/messaging');

beforeEach(() => {
  for (const k of Object.keys(local)) delete local[k];
  calls.length = 0;
  serverSettings = null;
  meStatus = 200;
});

describe('account link', () => {
  it('uses the website from solace.config.json as the API base', async () => {
    expect(await acct.apiBase()).toBe('http://localhost:5173/api/');
    expect(await acct.connectUrl()).toBe('http://localhost:5173/#/connect');
  });

  it('exchanges a one-time code for a device token and seeds the account with this device’s settings', async () => {
    await saveSettings({ abuseShieldBlur: false, groqApiKey: 'gsk_secret_key_123' });
    const user = await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    expect(user.email).toBe('asha@example.com');
    const state = await acct.getAccount();
    expect(state.status).toBe('signed-in');
    const put = calls.find((c) => c.path === '/api/extension/settings')!;
    expect(put.auth).toBe('Bearer tok-1-xxxxxxxxxxxxxxxxxxxxxxxx');
    expect(put.body!.settings).toMatchObject({ abuseShieldBlur: false });
    expect(JSON.stringify(put.body)).not.toContain('gsk_secret'); // API keys never leave the device
    expect(JSON.stringify(put.body)).not.toContain('websiteUrl');
  });

  it('takes the account’s settings when the account already has them', async () => {
    serverSettings = { composerWarnings: false, threshold: 0.65 };
    await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    const s = await getSettings();
    expect(s.composerWarnings).toBe(false);
    expect(s.threshold).toBe(0.65);
    expect(calls.some((c) => c.path === '/api/extension/settings')).toBe(false);
  });

  it('rejects an expired code with the server message', async () => {
    await expect(acct.linkWithCode('bad-code-bbbbbbbbbbbbbbbbbbbb')).rejects.toThrow('This link has expired.');
    expect((await acct.getAccount()).status).toBe('signed-out');
  });
});

describe('settings sync', () => {
  it('pushes only changed synced settings', async () => {
    await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    calls.length = 0;
    expect(await acct.pushSettingsIfChanged(await getSettings())).toBe(false); // nothing changed
    const next = await saveSettings({ floatingButton: false });
    expect(await acct.pushSettingsIfChanged(next)).toBe(true);
    expect(calls.filter((c) => c.path === '/api/extension/settings')).toHaveLength(1);
    expect(serverSettings!.floatingButton).toBe(false);
    const groqOnly = await saveSettings({ groqApiKey: 'gsk_other_key_456' });
    expect(await acct.pushSettingsIfChanged(groqOnly)).toBe(false); // not a synced key
  });

  it('refresh pulls changes made on the website and updates the name', async () => {
    await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    serverSettings = { ...serverSettings, abuseShieldBlur: false };
    const state = await acct.refreshAccount();
    expect(state.user!.name).toBe('Asha K');
    expect((await getSettings()).abuseShieldBlur).toBe(false);
  });
});

describe('expiry and sign-out', () => {
  it('a 401 moves Mimi to "session expired" and forgets the token', async () => {
    await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    meStatus = 401;
    const state = await acct.refreshAccount();
    expect(state.status).toBe('expired');
    expect(state.user!.email).toBe('asha@example.com');
    expect(local.account).toBeUndefined();
  });

  it('sign-out revokes on the server and clears local state', async () => {
    await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    await acct.signOutAccount();
    expect(calls.some((c) => c.path === '/api/extension/signout' && c.auth?.startsWith('Bearer '))).toBe(true);
    expect((await acct.getAccount()).status).toBe('signed-out');
  });

  it('website sign-out only unlinks the same user', async () => {
    await acct.linkWithCode('good-code-aaaaaaaaaaaaaaaaaa');
    expect(await acct.unlinkFromWebsite('someone-else')).toBe(false);
    expect((await acct.getAccount()).status).toBe('signed-in');
    expect(await acct.unlinkFromWebsite('u1')).toBe(true);
    expect((await acct.getAccount()).status).toBe('signed-out');
  });
});

describe('website messages', () => {
  it('validates link and unlink messages', () => {
    expect(validateFromWebsite({ type: 'TL_LINK', code: 'good-code-aaaaaaaaaaaaaaaaaa' })).toEqual({ type: 'TL_LINK', code: 'good-code-aaaaaaaaaaaaaaaaaa' });
    expect(validateFromWebsite({ type: 'TL_LINK', code: 'short' })).toBeNull();
    expect(validateFromWebsite({ type: 'TL_LINK', code: '<script>alert(1)</script>aaaaaaaaaa' })).toBeNull();
    expect(validateFromWebsite({ type: 'TL_UNLINK', userId: 'u1' })).toEqual({ type: 'TL_UNLINK', userId: 'u1' });
    expect(validateFromWebsite({ type: 'TL_UNLINK', userId: 5 })).toBeNull();
  });
});
