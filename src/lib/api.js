/**
 * Serverless API stub — no backend required for hackathon/Vercel static deployment.
 * All calls that previously hit the server are replaced with localStorage no-ops or
 * are handled directly in auth.jsx via LocalAuth.
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
export function onSessionExpired(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// No-op stubs — each returns a resolved promise with sensible defaults.
export const Api = {
  me: async () => { return { user: null }; },
  signUp: async () => { return { user: null }; },
  signIn: async () => { return { user: null }; },
  signOut: async () => {},
  updateAccount: async (b) => {
    // Persist name change locally
    const sess = (() => { try { return JSON.parse(localStorage.getItem('solace_session')); } catch { return null; } })();
    if (sess && b.name) {
      sess.user.name = b.name;
      localStorage.setItem('solace_session', JSON.stringify(sess));
    }
    return { user: sess?.user ?? {} };
  },
  onboarding: async (b) => {
    // Store onboarding data in the localStorage user profile
    const sess = (() => { try { return JSON.parse(localStorage.getItem('solace_session')); } catch { return null; } })();
    if (sess) {
      sess.user.onboarding = { completed: true, concern: b.concern };
      if (b.startIncident) sess.user.incident = { type: b.concern, discoveredAt: Date.now() };
      localStorage.setItem('solace_session', JSON.stringify(sess));

      // Also persist in users store
      const users = (() => { try { return JSON.parse(localStorage.getItem('solace_users') || '{}'); } catch { return {}; } })();
      if (users[sess.user.email]) {
        users[sess.user.email].user = sess.user;
        localStorage.setItem('solace_users', JSON.stringify(users));
      }
      return { user: sess.user };
    }
    return { user: {} };
  },
  incident: async (b) => {
    const sess = (() => { try { return JSON.parse(localStorage.getItem('solace_session')); } catch { return null; } })();
    if (sess) {
      if (b.clear) {
        delete sess.user.incident;
      } else {
        const incident = { ...(sess.user.incident || {}) };
        if (b.type !== undefined) incident.type = b.type;
        if (b.discoveredAt !== undefined) incident.discoveredAt = b.discoveredAt;
        if (!Number.isFinite(incident.discoveredAt)) incident.discoveredAt = Date.now();
        if (Object.prototype.hasOwnProperty.call(b, 'noticeSentAt')) {
          incident.noticeSentAt = b.noticeSentAt;
        } else if (!Object.prototype.hasOwnProperty.call(incident, 'noticeSentAt')) {
          incident.noticeSentAt = null;
        }
        sess.user.incident = incident;
      }
      localStorage.setItem('solace_session', JSON.stringify(sess));

      const users = (() => { try { return JSON.parse(localStorage.getItem('solace_users') || '{}'); } catch { return {}; } })();
      if (users[sess.user.email]) {
        users[sess.user.email].user = sess.user;
        localStorage.setItem('solace_users', JSON.stringify(users));
      }

      // AuthContext merges user updates, so explicitly pass null after clearing.
      const user = b.clear ? { ...sess.user, incident: null } : sess.user;
      return { user };
    }
    return { user: {} };
  },
  deleteAccount: async () => {
    localStorage.removeItem('solace_session');
    localStorage.removeItem('solace_users');
  },
  settings: async () => ({ settings: {} }),
  saveSettings: async () => {},
  linkCode: async () => ({ code: 'OFFLINE' }),
  devices: async () => ({ devices: [] }),
  revokeDevice: async () => {},
};

// Keep the bare `api` function as a pass-through no-op for any remaining direct callers.
export async function api() { return {}; }
