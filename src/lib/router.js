/**
 * Hash router: #/ (landing), #/signin, #/signup, #/onboarding, #/dashboard/<tab>, #/connect.
 * Hash URLs work on any static host and keep the landing page's #section anchors free.
 */
import { useEffect, useState } from 'react';

export const ROUTES = ['/', '/signin', '/signup', '/onboarding', '/dashboard', '/connect'];

export function parseHash(hash = window.location.hash) {
  const raw = hash.startsWith('#/') ? hash.slice(1) : '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const base = `/${segments[0] || ''}`;
  return {
    path: ROUTES.includes(base) ? base : '/',
    sub: segments[1] || null,
    query: Object.fromEntries(new URLSearchParams(queryPart)),
    raw,
  };
}

export function navigate(to, { replace = false } = {}) {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Only internal routes are accepted as ?next= targets (no open redirects). */
export function safeNext(next, fallback = '/dashboard') {
  return typeof next === 'string' && /^\/(dashboard|onboarding|connect)(\/[a-z-]*)?$/.test(next) ? next : fallback;
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  return route;
}
