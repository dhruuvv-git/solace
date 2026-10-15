/**
 * Solace API client. Same-origin requests (the dev server proxies /api to the API
 * on port 8787; in production the API serves the site), so the HttpOnly session
 * cookie travels automatically and no token is ever visible to page JavaScript.
 */
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

const listeners = new Set();
/** Called with the error whenever the server says the session ended. */
export function onSessionExpired(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach Solace. Check your connection — if you are running locally, start it with “npm run dev”.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 502 || res.status === 504 || (res.status === 500 && !data)) {
      throw new ApiError(res.status, 'offline', 'The Solace server is not running. Start it with “npm run dev”.');
    }
    const err = new ApiError(res.status, data?.error || 'error', data?.message || `Request failed (${res.status}).`, data?.fields);
    if (res.status === 401 && err.code === 'session_expired') listeners.forEach((fn) => fn(err));
    throw err;
  }
  return data;
}

export const Api = {
  me: () => api('GET', '/auth/me'),
  signUp: (b) => api('POST', '/auth/signup', b),
  signIn: (b) => api('POST', '/auth/signin', b),
  signOut: () => api('POST', '/auth/signout', {}),
  updateAccount: (b) => api('PATCH', '/account', b),
  onboarding: (b) => api('POST', '/account/onboarding', b),
  incident: (b) => api('PUT', '/account/incident', b),
  deleteAccount: (password) => api('DELETE', '/account', { password }),
  settings: () => api('GET', '/settings'),
  saveSettings: (settings) => api('PUT', '/settings', { settings }),
  linkCode: () => api('POST', '/extension/link-code', {}),
  devices: () => api('GET', '/extension/devices'),
  revokeDevice: (id) => api('DELETE', `/extension/devices/${encodeURIComponent(id)}`, {}),
};
