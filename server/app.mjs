/**
 * Solace API — accounts, sessions, onboarding, synced Mimi settings and the
 * website ↔ extension account link.
 *
 * Website auth: HttpOnly, SameSite=Lax session cookie (token hashed at rest).
 *   State-changing requests must be JSON and, when the browser sends an Origin,
 *   come from an allowed website origin (CSRF defence on top of SameSite).
 * Extension auth: the signed-in website asks for a one-time link code (2 min),
 *   hands it to the extension through Chrome's externally_connectable messaging,
 *   and the extension swaps it for its own revocable device token (30 days).
 *   The website never sees the device token; the extension never sees the cookie.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { openStore } from './store.mjs';
import { dummyVerify, hashPassword, newId, newLinkCode, newToken, sha256, verifyPassword } from './security.mjs';

const DAY = 24 * 60 * 60 * 1000;
export const LIMITS = {
  sessionIdleMs: 7 * DAY,
  sessionAbsoluteMs: 30 * DAY,
  deviceTokenMs: 30 * DAY,
  linkCodeMs: 2 * 60 * 1000,
  bodyBytes: 64 * 1024,
};
const COOKIE = 'solace_session';
export const CONCERNS = ['intimate-images', 'deepfake', 'impersonation', 'harassment', 'extortion', 'exploring'];

/** Mimi settings that follow the account. API keys and per-device choices are never synced. */
const SYNCED_SETTINGS = {
  whatsappEnabled: 'boolean', instagramEnabled: 'boolean', abuseShieldBlur: 'boolean', composerWarnings: 'boolean',
  floatingButton: 'boolean', patternTracking: 'boolean', scanHistory: 'boolean', autoSaveSafetyEvidence: 'boolean',
  includeScreenshots: 'boolean', threshold: 'number', patternTheta: 'number', customLexicon: 'lexicon',
};

const HARM = ['insult', 'profanity', 'threat', 'body-shaming', 'identity-hate', 'sexual-harassment'];

function cleanSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const [k, type] of Object.entries(SYNCED_SETTINGS)) {
    if (!(k in input)) continue;
    const v = input[k];
    if (type === 'boolean' && typeof v === 'boolean') out[k] = v;
    else if (type === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      out[k] = k === 'threshold' ? Math.min(0.8, Math.max(0.2, v)) : Math.min(10, Math.max(1.01, v));
    } else if (type === 'lexicon' && Array.isArray(v)) {
      out[k] = v
        .filter((e) => e && typeof e.term === 'string' && e.term.trim().length >= 2 && e.term.length <= 60 && HARM.includes(e.category) && typeof e.weight === 'number' && Number.isFinite(e.weight))
        .map((e) => ({ term: e.term.trim().toLowerCase(), category: e.category, weight: Math.min(3, Math.max(0, e.weight)), lang: ['en', 'hi', 'hinglish'].includes(e.lang) ? e.lang : 'en', ...(typeof e.softer === 'string' && e.softer.length <= 80 ? { softer: e.softer } : {}) }))
        .slice(0, 300);
    }
  }
  return out;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;
export function validateSignup({ name, email, password } = {}) {
  const errors = {};
  const n = typeof name === 'string' ? name.trim() : '';
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!n) errors.name = 'Enter your name or a nickname.';
  else if (n.length > 80) errors.name = 'Keep the name under 80 characters.';
  if (!e) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(e) || e.length > 254) errors.email = 'That email address doesn’t look right.';
  if (typeof password !== 'string' || !password) errors.password = 'Choose a password.';
  else if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (password.length > 128) errors.password = 'Use at most 128 characters.';
  else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) errors.password = 'Use at least one letter and one number.';
  return { ok: Object.keys(errors).length === 0, errors, name: n, email: e };
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, createdAt: u.createdAt,
    onboarding: u.onboarding ?? { completed: false },
    incident: u.incident ?? null,
  };
}

/* ---------------- small HTTP helpers ---------------- */

class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readJson(req) {
  const type = req.headers['content-type'] || '';
  if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'json_required', 'Send JSON.');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > LIMITS.bodyBytes) throw new HttpError(413, 'too_large', 'Request too large.');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'bad_json', 'Malformed JSON.'); }
}

function makeLimiter() {
  const hits = new Map();
  return (key, max, windowMs) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + windowMs }); return; }
    h.count += 1;
    if (h.count > max) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a few minutes and try again.', { retryAfter: Math.ceil((h.resetAt - now) / 1000) });
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.zip': 'application/zip', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

/* ---------------- app ---------------- */

/**
 * @param {object} opts
 * @param {string} opts.dbFile        path to the JSON database
 * @param {string[]} opts.extensionIds allowed Chrome extension IDs
 * @param {string[]} [opts.appOrigins] allowed website origins; empty = any http(s)://localhost|127.0.0.1 port (development)
 * @param {boolean} [opts.secureCookies]
 * @param {string} [opts.staticDir]   built website to serve (production)
 */
export async function createApp(opts) {
  const store = await openStore(opts.dbFile);
  const limit = makeLimiter();
  const extOrigins = new Set((opts.extensionIds ?? []).map((id) => `chrome-extension://${id}`));
  const appOrigins = new Set(opts.appOrigins ?? []);

  const websiteOriginAllowed = (origin) => {
    if (!origin) return true; // same-origin navigations / non-browser clients; cookie is SameSite=Lax anyway
    if (appOrigins.size) return appOrigins.has(origin);
    try { const u = new URL(origin); return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'); } catch { return false; }
  };

  const setCookie = (res, req, token, maxAgeMs) => {
    const secure = opts.secureCookies || req.headers['x-forwarded-proto'] === 'https';
    const parts = [`${COOKIE}=${token ? encodeURIComponent(token) : ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? Math.floor(maxAgeMs / 1000) : 0}`];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  };

  async function createSession(res, req, user) {
    const token = newToken();
    const now = Date.now();
    await store.tx((db) => {
      store.sweep(now);
      db.sessions.push({ id: newId(), tokenHash: sha256(token), userId: user.id, createdAt: now, lastSeenAt: now, expiresAt: now + LIMITS.sessionIdleMs, absoluteExpiresAt: now + LIMITS.sessionAbsoluteMs, userAgent: String(req.headers['user-agent'] || '').slice(0, 200) });
    });
    setCookie(res, req, token, LIMITS.sessionIdleMs);
  }

  /** Resolve the cookie session. Returns {user, session} or throws 401 (with session_expired when it existed). */
  async function requireSession(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) throw new HttpError(401, 'not_signed_in', 'Please sign in.');
    const hash = sha256(token);
    const db = store.db;
    const s = db.sessions.find((x) => x.tokenHash === hash);
    const now = Date.now();
    if (!s) { setCookie(res, req, null); throw new HttpError(401, 'session_expired', 'Your session has ended. Please sign in again.'); }
    if (s.expiresAt <= now || s.absoluteExpiresAt <= now) {
      await store.tx((d) => { d.sessions = d.sessions.filter((x) => x !== s); });
      setCookie(res, req, null);
      throw new HttpError(401, 'session_expired', 'Your session has expired. Please sign in again.');
    }
    const user = db.users.find((u) => u.id === s.userId);
    if (!user) throw new HttpError(401, 'session_expired', 'Please sign in again.');
    if (now - s.lastSeenAt > 60 * 60 * 1000) { // roll the idle window at most hourly
      await store.tx(() => { s.lastSeenAt = now; s.expiresAt = Math.min(now + LIMITS.sessionIdleMs, s.absoluteExpiresAt); });
      setCookie(res, req, token, s.expiresAt - now);
    }
    return { user, session: s };
  }

  async function requireDevice(req) {
    const auth = req.headers.authorization || '';
    const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(auth);
    if (!m) throw new HttpError(401, 'not_signed_in', 'Sign in to Solace from Mimi.');
    const t = store.db.deviceTokens.find((x) => x.tokenHash === sha256(m[1]));
    const now = Date.now();
    if (!t || t.revokedAt || t.expiresAt <= now) throw new HttpError(401, 'session_expired', 'Mimi was signed out. Sign in again.');
    const user = store.db.users.find((u) => u.id === t.userId);
    if (!user) throw new HttpError(401, 'session_expired', 'Mimi was signed out. Sign in again.');
    if (now - (t.lastUsedAt ?? 0) > 10 * 60 * 1000) await store.tx(() => { t.lastUsedAt = now; });
    return { user, device: t };
  }

  const ip = (req) => req.socket.remoteAddress || 'unknown';

  /* ---------- route table ---------- */
  const routes = [];
  const route = (method, pattern, kind, handler) => routes.push({ method, pattern, kind, handler });

  route('GET', '/api/health', 'public', async () => ({ ok: true, name: 'Solace API' }));

  route('POST', '/api/auth/signup', 'website', async ({ req, res, body }) => {
    limit(`signup:${ip(req)}`, 20, 60 * 60 * 1000);
    const v = validateSignup(body);
    if (!v.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', { fields: v.errors });
    if (store.db.users.some((u) => u.email === v.email)) {
      throw new HttpError(409, 'email_taken', 'An account with this email already exists. Sign in instead.', { fields: { email: 'This email already has an account.' } });
    }
    const passwordHash = await hashPassword(body.password);
    const user = { id: newId(), name: v.name, email: v.email, passwordHash, createdAt: Date.now(), onboarding: { completed: false }, incident: null };
    await store.tx((db) => { db.users.push(user); });
    await createSession(res, req, user);
    return { status: 201, body: { user: publicUser(user) } };
  });

  route('POST', '/api/auth/signin', 'website', async ({ req, res, body }) => {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fields = {};
    if (!email) fields.email = 'Enter your email address.';
    if (!password) fields.password = 'Enter your password.';
    if (Object.keys(fields).length) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', { fields });
    limit(`signin:${ip(req)}`, 50, 15 * 60 * 1000);
    limit(`signin:${ip(req)}:${email}`, 8, 15 * 60 * 1000);
    const user = store.db.users.find((u) => u.email === email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
    if (!ok) throw new HttpError(401, 'invalid_credentials', 'That email and password don’t match. Try again.');
    await createSession(res, req, user);
    return { user: publicUser(user) };
  });

  route('POST', '/api/auth/signout', 'website', async ({ req, res }) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const hash = sha256(token);
      await store.tx((db) => {
        const s = db.sessions.find((x) => x.tokenHash === hash);
        if (s) {
          const now = Date.now();
          // Mimi linked from this browser session signs out with it.
          for (const t of db.deviceTokens) if (t.sessionId === s.id && !t.revokedAt) t.revokedAt = now;
          db.sessions = db.sessions.filter((x) => x !== s);
        }
      });
    }
    setCookie(res, req, null);
    return { ok: true };
  });

  route('GET', '/api/auth/me', 'session', async ({ user }) => ({ user: publicUser(user) }));

  route('PATCH', '/api/account', 'session', async ({ user, body }) => {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) throw new HttpError(400, 'invalid_input', 'Enter a name up to 80 characters.', { fields: { name: 'Enter a name up to 80 characters.' } });
    await store.tx(() => { user.name = name; });
    return { user: publicUser(user) };
  });

  route('POST', '/api/account/onboarding', 'session', async ({ user, body }) => {
    const concern = CONCERNS.includes(body.concern) ? body.concern : null;
    if (!concern) throw new HttpError(400, 'invalid_input', 'Choose what brings you to Solace.', { fields: { concern: 'Choose one option.' } });
    const now = Date.now();
    await store.tx(() => {
      user.onboarding = { completed: true, concern, completedAt: now };
      if (body.startIncident === true && concern !== 'exploring') user.incident = { type: concern, discoveredAt: now, noticeSentAt: null };
    });
    return { user: publicUser(user) };
  });

  const ts = (v) => (v === null ? null : typeof v === 'number' && Number.isFinite(v) && v > 1e12 && v < Date.now() + 60_000 ? Math.floor(v) : undefined);
  route('PUT', '/api/account/incident', 'session', async ({ user, body }) => {
    if (body === null || body.clear === true) { await store.tx(() => { user.incident = null; }); return { user: publicUser(user) }; }
    const next = { ...(user.incident ?? { type: 'harassment', discoveredAt: Date.now(), noticeSentAt: null }) };
    if ('type' in body) { if (!CONCERNS.includes(body.type) || body.type === 'exploring') throw new HttpError(400, 'invalid_input', 'Unknown incident type.'); next.type = body.type; }
    for (const k of ['discoveredAt', 'noticeSentAt']) {
      if (k in body) { const v = ts(body[k]); if (v === undefined) throw new HttpError(400, 'invalid_input', `Invalid ${k}.`); next[k] = v; }
    }
    if (!next.discoveredAt) throw new HttpError(400, 'invalid_input', 'An incident needs a discovery time.');
    await store.tx(() => { user.incident = next; });
    return { user: publicUser(user) };
  });

  route('DELETE', '/api/account', 'session', async ({ user, body, req, res }) => {
    if (typeof body.password !== 'string' || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, 'invalid_credentials', 'Password is incorrect.', { fields: { password: 'Password is incorrect.' } });
    }
    await store.tx((db) => {
      db.users = db.users.filter((u) => u.id !== user.id);
      db.sessions = db.sessions.filter((s) => s.userId !== user.id);
      db.deviceTokens = db.deviceTokens.filter((t) => t.userId !== user.id);
      db.linkCodes = db.linkCodes.filter((c) => c.userId !== user.id);
      delete db.settings[user.id];
    });
    setCookie(res, req, null);
    return { ok: true };
  });

  route('GET', '/api/settings', 'session', async ({ user }) => ({ settings: store.db.settings[user.id] ?? null }));
  route('PUT', '/api/settings', 'session', async ({ user, body }) => {
    const s = cleanSettings(body.settings);
    if (!s) throw new HttpError(400, 'invalid_input', 'Invalid settings.');
    await store.tx((db) => { db.settings[user.id] = { ...(db.settings[user.id] ?? {}), ...s, updatedAt: Date.now() }; });
    return { settings: store.db.settings[user.id] };
  });

  /* ---------- extension link ---------- */

  route('POST', '/api/extension/link-code', 'session', async ({ user, session }) => {
    const code = newLinkCode();
    const now = Date.now();
    await store.tx((db) => {
      store.sweep(now);
      db.linkCodes.push({ codeHash: sha256(code), userId: user.id, sessionId: session.id, createdAt: now, expiresAt: now + LIMITS.linkCodeMs });
    });
    return { code, expiresAt: now + LIMITS.linkCodeMs };
  });

  route('POST', '/api/extension/exchange', 'extension-public', async ({ req, body }) => {
    limit(`exchange:${ip(req)}`, 30, 15 * 60 * 1000);
    const code = typeof body.code === 'string' ? body.code : '';
    const now = Date.now();
    const c = store.db.linkCodes.find((x) => x.codeHash === sha256(code));
    if (!c || c.usedAt || c.expiresAt <= now) throw new HttpError(400, 'invalid_code', 'This link has expired. Start again from the website.');
    const user = store.db.users.find((u) => u.id === c.userId);
    if (!user) throw new HttpError(400, 'invalid_code', 'This link has expired. Start again from the website.');
    const token = newToken();
    const device = {
      id: newId(), tokenHash: sha256(token), userId: user.id, sessionId: c.sessionId,
      deviceName: typeof body.deviceName === 'string' ? body.deviceName.slice(0, 60) : 'Mimi extension',
      createdAt: now, lastUsedAt: now, expiresAt: now + LIMITS.deviceTokenMs,
    };
    await store.tx((db) => {
      c.usedAt = now;
      // one live link per user per browser profile is enough: the extension replaces its old token on re-link
      if (typeof body.replaces === 'string') {
        const old = db.deviceTokens.find((t) => t.tokenHash === sha256(body.replaces) && t.userId === user.id);
        if (old) old.revokedAt = now;
      }
      db.deviceTokens.push(device);
    });
    return { token, expiresAt: device.expiresAt, deviceId: device.id, user: publicUser(user), settings: store.db.settings[user.id] ?? null };
  });

  route('GET', '/api/extension/me', 'device', async ({ user, device }) => ({ user: publicUser(user), settings: store.db.settings[user.id] ?? null, expiresAt: device.expiresAt }));
  route('PUT', '/api/extension/settings', 'device', async ({ user, body }) => {
    const s = cleanSettings(body.settings);
    if (!s) throw new HttpError(400, 'invalid_input', 'Invalid settings.');
    await store.tx((db) => { db.settings[user.id] = { ...(db.settings[user.id] ?? {}), ...s, updatedAt: Date.now() }; });
    return { settings: store.db.settings[user.id] };
  });
  route('POST', '/api/extension/signout', 'device', async ({ device }) => {
    await store.tx(() => { device.revokedAt = Date.now(); });
    return { ok: true };
  });

  route('GET', '/api/extension/devices', 'session', async ({ user }) => {
    const now = Date.now();
    return {
      devices: store.db.deviceTokens
        .filter((t) => t.userId === user.id && !t.revokedAt && t.expiresAt > now)
        .map((t) => ({ id: t.id, deviceName: t.deviceName, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, expiresAt: t.expiresAt })),
    };
  });
  route('DELETE', /^\/api\/extension\/devices\/([A-Za-z0-9_-]+)$/, 'session', async ({ user, params }) => {
    const t = store.db.deviceTokens.find((x) => x.id === params[0] && x.userId === user.id);
    if (!t) throw new HttpError(404, 'not_found', 'Device not found.');
    await store.tx(() => { t.revokedAt = Date.now(); });
    return { ok: true };
  });

  /* ---------- request handling ---------- */

  function corsFor(req, res, kind) {
    const origin = req.headers.origin;
    if ((kind === 'device' || kind === 'extension-public') && origin && extOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }

  function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
  }

  async function serveStatic(req, res, url) {
    if (!opts.staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
    const root = path.resolve(opts.staticDir);
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) return false;
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(root, 'index.html'); }
    try {
      const data = await readFile(file);
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
      return true;
    } catch { return false; }
  }

  const handler = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (await serveStatic(req, res, url)) return;
        return send(res, 404, { error: 'not_found', message: 'Not found.' });
      }
      const candidates = routes.filter((r) => (typeof r.pattern === 'string' ? r.pattern === url.pathname : r.pattern.test(url.pathname)));
      if (!candidates.length) return send(res, 404, { error: 'not_found', message: 'Unknown API route.' });
      if (req.method === 'OPTIONS') {
        corsFor(req, res, candidates[0].kind);
        res.writeHead(204); return res.end();
      }
      const r = candidates.find((x) => x.method === req.method);
      if (!r) return send(res, 405, { error: 'method_not_allowed', message: 'Method not allowed.' });
      corsFor(req, res, r.kind);
      const params = typeof r.pattern === 'string' ? [] : r.pattern.exec(url.pathname).slice(1);
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';
      if ((r.kind === 'website' || r.kind === 'session') && mutating && !websiteOriginAllowed(req.headers.origin)) {
        throw new HttpError(403, 'bad_origin', 'Request blocked: unknown origin.');
      }
      const body = mutating ? await readJson(req) : {};
      const ctx = { req, res, body: body ?? {}, params };
      if (r.kind === 'session') Object.assign(ctx, await requireSession(req, res));
      if (r.kind === 'device') Object.assign(ctx, await requireDevice(req));
      const out = await r.handler(ctx);
      if (out && typeof out === 'object' && 'status' in out && 'body' in out) return send(res, out.status, out.body);
      return send(res, 200, out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.extra?.retryAfter) res.setHeader('Retry-After', String(err.extra.retryAfter));
        return send(res, err.status, { error: err.code, message: err.message, ...(err.extra?.fields ? { fields: err.extra.fields } : {}) });
      }
      console.error('[solace-api]', err);
      return send(res, 500, { error: 'server_error', message: 'Something went wrong on our side. Try again.' });
    }
  };

  const server = http.createServer(handler);
  return { server, store, handler };
}
