/** Website session state — serverless, localStorage-only. No backend or DB required. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LocalAuth } from './localAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  const refresh = useCallback(() => {
    const sess = LocalAuth.me();
    if (sess && sess.user) {
      setState({ status: 'signedIn', user: sess.user });
    } else {
      setState({ status: 'signedOut', user: null });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    setUser: (user) => {
      // Also persist setUser calls back into localStorage session
      const sess = (() => { try { return JSON.parse(localStorage.getItem('solace_session')); } catch { return null; } })();
      if (sess) {
        sess.user = { ...sess.user, ...user };
        localStorage.setItem('solace_session', JSON.stringify(sess));
      }
      setState({ status: 'signedIn', user: { ...(state.user || {}), ...user } });
    },
    signIn: async (email, password) => {
      const { user } = await LocalAuth.signIn({ email, password });
      setState({ status: 'signedIn', user });
      return user;
    },
    signUp: async (name, email, password) => {
      const { user } = await LocalAuth.signUp({ name, email, password });
      setState({ status: 'signedIn', user });
      return user;
    },
    signOut: () => {
      LocalAuth.signOut();
      setState({ status: 'signedOut', user: null });
    },
    updateAccount: async ({ name }) => {
      const { user } = await LocalAuth.updateAccount({ name });
      setState({ status: 'signedIn', user });
      return user;
    },
    // Stubs for code that references these — no-ops in serverless mode
    clearExpired: () => {},
    expired: false,
    offline: false,
  }), [state, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
