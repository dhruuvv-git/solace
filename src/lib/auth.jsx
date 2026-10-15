/** Website session state. The source of truth is the server (GET /api/auth/me); nothing is cached in localStorage. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Api, onSessionExpired } from './api';
import { Mimi } from './mimi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, expired: false, offline: false });

  const refresh = useCallback(async () => {
    try {
      const { user } = await Api.me();
      setState({ status: 'signedIn', user, expired: false, offline: false });
      return user;
    } catch (e) {
      setState((s) => ({ status: 'signedOut', user: null, expired: e.code === 'session_expired' ? true : s.expired, offline: e.code === 'offline' }));
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  // Re-check when the tab regains focus: picks up sign-outs from other tabs and expired sessions.
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [refresh]);
  useEffect(() => onSessionExpired(() => setState({ status: 'signedOut', user: null, expired: true, offline: false })), []);

  const value = useMemo(() => ({
    ...state,
    refresh,
    setUser: (user) => setState({ status: 'signedIn', user, expired: false, offline: false }),
    signIn: async (email, password) => {
      const { user } = await Api.signIn({ email, password });
      setState({ status: 'signedIn', user, expired: false, offline: false });
      return user;
    },
    signUp: async (name, email, password) => {
      const { user } = await Api.signUp({ name, email, password });
      setState({ status: 'signedIn', user, expired: false, offline: false });
      return user;
    },
    signOut: async () => {
      const userId = state.user?.id;
      try { await Api.signOut(); } finally {
        setState({ status: 'signedOut', user: null, expired: false, offline: false });
        // Mimi linked from this browser signs out too (the server already revoked its token).
        Mimi.unlink(userId).catch(() => {});
      }
    },
    clearExpired: () => setState((s) => ({ ...s, expired: false })),
  }), [state, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
