/**
 * Solace account in the extension.
 *
 * Link flow (no password ever typed into the extension):
 *   1. Mimi opens the Solace website at #/signin.
 *   2. The signed-in website asks the API for a one-time link code (2 minutes)
 *      and sends it to Mimi with chrome.runtime.sendMessage (externally_connectable;
 *      only origins in solace.config.json can do this).
 *   3. Mimi's service worker swaps the code for its own device token at
 *      POST /api/extension/exchange and keeps it in chrome.storage.local
 *      (extension-only storage; web pages and content scripts cannot read it).
 *   4. The token is revocable from the website (Account → Devices), expires after
 *      30 days, and is revoked when the user signs out of the website session that
 *      created it. Any 401 moves Mimi to the "session expired" state.
 *
 * Only the settings in SYNC_KEYS follow the account. The Groq API key, the website
 * link and all analysis data (evidence, patterns, history) stay on this device.
 */
import { APP, safeWebsiteUrl } from '../shared/app-config';
import { getSettings, kvGet, kvRemove, kvSet, saveSettings, type Settings } from '../shared/settings';

export interface AccountUser { id: string; name: string; email: string }
export type AccountStatus = 'signed-out' | 'signed-in' | 'expired';
export interface AccountState { status: AccountStatus; user?: AccountUser; linkedAt?: number; expiresAt?: number; lastSyncAt?: number }

interface StoredAccount { token: string; user: AccountUser; linkedAt: number; expiresAt: number; lastSyncAt?: number }
interface ExpiredAccount { user: AccountUser; at: number }

const KEY = 'account';
const EXPIRED_KEY = 'accountExpired';
const SNAPSHOT_KEY = 'accountSyncSnapshot';

export const SYNC_KEYS = [
  'whatsappEnabled', 'instagramEnabled', 'abuseShieldBlur', 'composerWarnings', 'floatingButton', 'patternTracking',
  'scanHistory', 'autoSaveSafetyEvidence', 'includeScreenshots', 'threshold', 'patternTheta', 'customLexicon',
] as const satisfies readonly (keyof Settings)[];
type Synced = Pick<Settings, (typeof SYNC_KEYS)[number]>;

export class AccountError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

export async function apiBase(): Promise<string> {
  const s = await getSettings();
  const site = safeWebsiteUrl(s.websiteUrl) ?? APP.websiteUrl;
  return new URL('api/', site).toString();
}

/** Open the website's real sign-in form. Static Vercel mode has no account-link API. */
export async function connectUrl(): Promise<string> {
  const s = await getSettings();
  const site = safeWebsiteUrl(s.websiteUrl) ?? APP.websiteUrl;
  return new URL('#/signin', site).toString();
}

export async function dashboardUrl(): Promise<string> {
  const s = await getSettings();
  const site = safeWebsiteUrl(s.websiteUrl) ?? APP.websiteUrl;
  return new URL('#/dashboard', site).toString();
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(new URL(path, await apiBase()), {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'omit',
    });
  } catch {
    throw new AccountError('offline', `Can’t reach ${APP.name}. Check your connection or that the website is running.`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new AccountError(String(data.error ?? 'error'), String(data.message ?? `Request failed (${res.status}).`), res.status);
  return data as T;
}

const pickSynced = (s: Settings): Synced => Object.fromEntries(SYNC_KEYS.map((k) => [k, s[k]])) as Synced;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function readStored(): Promise<StoredAccount | null> {
  const a = await kvGet<StoredAccount | null>(KEY, null);
  return a && typeof a.token === 'string' && a.user ? a : null;
}

export async function getAccount(): Promise<AccountState> {
  const a = await readStored();
  if (a) {
    if (a.expiresAt <= Date.now()) { await markExpired(a.user); return { status: 'expired', user: a.user }; }
    return { status: 'signed-in', user: a.user, linkedAt: a.linkedAt, expiresAt: a.expiresAt, lastSyncAt: a.lastSyncAt };
  }
  const e = await kvGet<ExpiredAccount | null>(EXPIRED_KEY, null);
  return e?.user ? { status: 'expired', user: e.user } : { status: 'signed-out' };
}

async function markExpired(user: AccountUser) {
  await kvRemove(KEY);
  await kvRemove(SNAPSHOT_KEY);
  await kvSet<ExpiredAccount>(EXPIRED_KEY, { user, at: Date.now() });
}

/** Server settings win when they exist (the account is the source of truth); otherwise this device seeds the account. */
async function reconcile(token: string, server: Partial<Synced> | null) {
  const local = await getSettings();
  if (server && Object.keys(server).some((k) => (SYNC_KEYS as readonly string[]).includes(k))) {
    const patch = Object.fromEntries(SYNC_KEYS.filter((k) => k in server).map((k) => [k, server[k]])) as Partial<Settings>;
    const next = await saveSettings(patch);
    await kvSet(SNAPSHOT_KEY, pickSynced(next));
  } else {
    const mine = pickSynced(local);
    await call('PUT', 'extension/settings', { settings: mine }, token);
    await kvSet(SNAPSHOT_KEY, mine);
  }
}

/** Called by the service worker with a code from the website. */
export async function linkWithCode(code: string): Promise<AccountUser> {
  const old = await readStored();
  const r = await call<{ token: string; expiresAt: number; user: AccountUser; settings: Partial<Synced> | null }>(
    'POST', 'extension/exchange', { code, deviceName: deviceName(), ...(old ? { replaces: old.token } : {}) },
  );
  const user = { id: r.user.id, name: r.user.name, email: r.user.email };
  await kvSet<StoredAccount>(KEY, { token: r.token, user, linkedAt: Date.now(), expiresAt: r.expiresAt });
  await kvRemove(EXPIRED_KEY);
  try { await reconcile(r.token, r.settings); await touchSync(); } catch { /* linking succeeded; sync retries on next change */ }
  return user;
}

async function touchSync() {
  const a = await readStored();
  if (a) await kvSet<StoredAccount>(KEY, { ...a, lastSyncAt: Date.now() });
}

/** Re-checks the device token and pulls the account's name and settings. */
export async function refreshAccount(): Promise<AccountState> {
  const a = await readStored();
  if (!a) return getAccount();
  try {
    const r = await call<{ user: AccountUser; settings: Partial<Synced> | null; expiresAt: number }>('GET', 'extension/me', undefined, a.token);
    await kvSet<StoredAccount>(KEY, { ...a, user: { id: r.user.id, name: r.user.name, email: r.user.email }, expiresAt: r.expiresAt, lastSyncAt: Date.now() });
    const snap = await kvGet<Record<string, unknown> | null>(SNAPSHOT_KEY, null);
    const server = r.settings as Record<string, unknown> | null;
    // Changed on the website / another device since our last sync → take the account's values.
    if (server && SYNC_KEYS.some((k) => k in server && !same(server[k], snap?.[k]))) await reconcile(a.token, r.settings);
    // Changed here while offline → push them now.
    else await pushSettingsIfChanged(await getSettings());
  } catch (e) {
    if (e instanceof AccountError && e.status === 401) await markExpired(a.user);
    else throw e;
  }
  return getAccount();
}

/** Pushes synced settings when they changed locally (called from the service worker on storage changes). */
export async function pushSettingsIfChanged(s: Settings): Promise<boolean> {
  const a = await readStored();
  if (!a) return false;
  const mine = pickSynced(s);
  if (same(await kvGet(SNAPSHOT_KEY, null), mine)) return false;
  try {
    await call('PUT', 'extension/settings', { settings: mine }, a.token);
    await kvSet(SNAPSHOT_KEY, mine);
    await touchSync();
    return true;
  } catch (e) {
    if (e instanceof AccountError && e.status === 401) await markExpired(a.user);
    return false;
  }
}

/** Signs Mimi out: revokes the device token on the server (best effort) and forgets it. */
export async function signOutAccount(): Promise<void> {
  const a = await readStored();
  if (a) { try { await call('POST', 'extension/signout', {}, a.token); } catch { /* token is dropped locally regardless */ } }
  await kvRemove(KEY);
  await kvRemove(SNAPSHOT_KEY);
  await kvRemove(EXPIRED_KEY);
}

/** Website signed out: forget the link if it belongs to that user (the server already revoked it). */
export async function unlinkFromWebsite(userId: string | undefined): Promise<boolean> {
  const a = await readStored();
  if (!a || (userId && a.user.id !== userId)) return false;
  await kvRemove(KEY);
  await kvRemove(SNAPSHOT_KEY);
  await kvRemove(EXPIRED_KEY);
  return true;
}

export function onAccountChanged(cb: () => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return () => {};
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (KEY in changes || EXPIRED_KEY in changes)) cb();
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}

function deviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Brave/.test(ua) ? 'Brave' : 'Chrome';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'computer';
  return `Mimi on ${browser} (${os})`;
}
