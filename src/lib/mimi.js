/**
 * Talk to the Mimi extension from the website (Chrome externally_connectable).
 * The extension only accepts messages from origins listed in solace.config.json.
 *
 *   Mimi.detect()           → { installed, version, updateAvailable, account, reason }
 *   Mimi.open(view?)        → opens Mimi's side panel
 *   Mimi.check(mode, text)  → sends text to Mimi (safety | kind | misinfo)
 *   Mimi.link(code)         → hands Mimi a one-time code to sign in to this account
 *   Mimi.unlink(userId)     → tells Mimi this user signed out
 */
import { useCallback, useEffect, useState } from 'react';
import cfg from '../../solace.config.json';

export const EXTENSION_ID = cfg.extensionId;
export const ASSISTANT = cfg.assistantName;
export const DOWNLOAD_URL = '/downloads/solace-extension.zip';

export function isChromium() {
  const ua = navigator.userAgent || '';
  return /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\/|FxiOS/.test(ua) && !/Mobile/.test(ua);
}

function send(message, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const rt = window.chrome?.runtime;
    // chrome.runtime.sendMessage only exists on this page when an installed extension lists this site.
    if (!rt || typeof rt.sendMessage !== 'function') { resolve({ ok: false, reason: 'not-installed' }); return; }
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, reason: 'timeout' }); } }, timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, message, (response) => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (window.chrome.runtime.lastError || !response) { resolve({ ok: false, reason: 'not-installed' }); return; }
        resolve(response);
      });
    } catch {
      if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, reason: 'not-installed' }); }
    }
  });
}

export function newer(a, b) {
  const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

let latest = null;
async function latestVersion() {
  if (latest) return latest;
  try { latest = (await (await fetch('/downloads/extension.json', { cache: 'no-cache' })).json()).version; } catch { latest = null; }
  return latest;
}

export const Mimi = {
  async detect() {
    if (!isChromium()) return { installed: false, reason: 'unsupported-browser' };
    const [r, v] = await Promise.all([send({ type: 'TL_HELLO' }, 1500), latestVersion()]);
    if (!r?.ok) return { installed: false, reason: r?.reason || 'not-installed', latestVersion: v };
    return { installed: true, version: r.version, latestVersion: v, updateAvailable: v ? newer(v, r.version) : false, account: r.account ?? { status: 'signed-out' } };
  },
  open: (view) => send(view ? { type: 'TL_OPEN', view } : { type: 'TL_OPEN' }),
  check: (mode, text) => send({ type: 'TL_CHECK', mode, text: String(text || '').slice(0, 20000) }),
  link: (code) => send({ type: 'TL_LINK', code }, 15000),
  unlink: (userId) => send(userId ? { type: 'TL_UNLINK', userId } : { type: 'TL_UNLINK' }),
};

/** Live extension status; re-checks when the window regains focus (e.g. after installing). */
export function useMimiStatus() {
  const [status, setStatus] = useState({ state: 'checking' });
  const refresh = useCallback(async () => {
    const r = await Mimi.detect();
    if (r.installed) setStatus({ state: r.updateAvailable ? 'update' : 'installed', ...r });
    else setStatus({ state: r.reason === 'unsupported-browser' ? 'unsupported' : 'missing', ...r });
    return r;
  }, []);
  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener('focus', on);
    return () => window.removeEventListener('focus', on);
  }, [refresh]);
  return { ...status, refresh };
}
