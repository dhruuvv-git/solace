/**
 * Typed messages between content scripts, the service worker and extension
 * pages, plus validators. Page DOM content is UNTRUSTED: everything arriving
 * from a content script is treated as data, length-limited and type-checked.
 */

export type Platform = 'whatsapp' | 'instagram' | 'web';

export interface SourceInfo {
  url: string;
  platform: Platform;
  senderLabel?: string;
  title?: string;
}

export interface ProfileSnapshot {
  username: string;
  imageUrl?: string;
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  url: string;
}

export type PanelJob =
  | { id: string; createdAt: number; kind: 'image'; name: string; base64: string; source: SourceInfo }
  | { id: string; createdAt: number; kind: 'image-error'; message: string; srcUrl?: string; source: SourceInfo }
  | { id: string; createdAt: number; kind: 'text'; mode: 'misinfo' | 'kind' | 'safety'; text: string; source: SourceInfo }
  | { id: string; createdAt: number; kind: 'evidence-saved'; evidenceId: string; screenshot: boolean; note?: string }
  | { id: string; createdAt: number; kind: 'profile'; profile: ProfileSnapshot; imageBase64?: string; imageError?: string; source: SourceInfo }
  | { id: string; createdAt: number; kind: 'navigate'; view: string };

export type ToBackground =
  | { type: 'TL_PANEL_VISIBILITY'; visible: boolean }
  | { type: 'TL_OPEN_PANEL'; view?: string }
  | { type: 'TL_ANALYZE_TEXT'; mode: 'misinfo' | 'kind' | 'safety'; text: string; senderLabel?: string }
  | { type: 'TL_CAPTURE_EVIDENCE'; text: string; senderLabel?: string }
  | { type: 'TL_PROFILE_REVIEW'; profile: ProfileSnapshot }
  | { type: 'TL_RECORD_PATTERN'; senderLabel: string; text: string };

export type ToContent =
  | { type: 'TL_PING' }
  | { type: 'TL_FETCH_IMAGE'; url: string }
  | { type: 'TL_SELECTION_CONTEXT' };

export interface PingReply { ok: true; platform: Platform; features: Record<string, 'active' | 'off' | 'unavailable'>; notes: string[] }
export interface FetchImageReply { ok: boolean; base64?: string; error?: string }
export interface SelectionContextReply { senderLabel?: string; platform: Platform }
export interface Reply { ok: boolean; error?: string; [k: string]: unknown }

export const LIMITS = { text: 20_000, label: 80, url: 2048 };

const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

export function validateToBackground(m: unknown): ToBackground | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case 'TL_PANEL_VISIBILITY':
      return typeof o.visible === 'boolean' ? { type: 'TL_PANEL_VISIBILITY', visible: o.visible } : null;
    case 'TL_OPEN_PANEL':
      return o.view === undefined || str(o.view, 40) ? (o as ToBackground) : null;
    case 'TL_ANALYZE_TEXT':
      return ['misinfo', 'kind', 'safety'].includes(o.mode as string) && str(o.text, LIMITS.text) && (o.senderLabel === undefined || str(o.senderLabel, LIMITS.label)) ? (o as ToBackground) : null;
    case 'TL_CAPTURE_EVIDENCE':
      return str(o.text, LIMITS.text) && (o.senderLabel === undefined || str(o.senderLabel, LIMITS.label)) ? (o as ToBackground) : null;
    case 'TL_RECORD_PATTERN':
      return str(o.text, LIMITS.text) && str(o.senderLabel, LIMITS.label) ? (o as ToBackground) : null;
    case 'TL_PROFILE_REVIEW': {
      const p = o.profile as Record<string, unknown> | undefined;
      if (!p || !str(p.username, 60) || !str(p.url, LIMITS.url)) return null;
      if (p.imageUrl !== undefined && !(str(p.imageUrl, LIMITS.url) && /^https:\/\//.test(p.imageUrl as string))) return null;
      for (const k of ['followers', 'following', 'posts']) {
        const v = p[k];
        if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) return null;
      }
      return o as ToBackground;
    }
    default:
      return null;
  }
}

export function platformFromUrl(url: string | undefined): Platform {
  try {
    const h = new URL(url ?? '').hostname;
    if (h === 'web.whatsapp.com') return 'whatsapp';
    if (h === 'www.instagram.com' || h === 'instagram.com') return 'instagram';
  } catch { /* ignore */ }
  return 'web';
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------- website ↔ extension (externally_connectable) ---------------- */

export type FromWebsite =
  | { type: 'TL_HELLO' }
  | { type: 'TL_OPEN'; view?: 'overview' | 'real' | 'kind' | 'identity' | 'safety' | 'locker' | 'game' | 'settings' }
  | { type: 'TL_CHECK'; mode: 'misinfo' | 'kind' | 'safety'; text: string }
  /** Signed-in website hands Mimi a one-time code to link the same Solace account. */
  | { type: 'TL_LINK'; code: string }
  /** Website signed out: Mimi forgets the link if it belongs to this user. */
  | { type: 'TL_UNLINK'; userId?: string }
  /** Mirror the website's browser-local account identity into this extension profile. */
  | { type: 'TL_LOCAL_ACCOUNT'; user: { id: string; name: string; email: string } }
  | { type: 'TL_LOCAL_SIGNOUT' };

const WEB_VIEWS = ['overview', 'real', 'kind', 'identity', 'safety', 'locker', 'game', 'settings'];

export function validateFromWebsite(m: unknown): FromWebsite | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.type === 'TL_HELLO') return { type: 'TL_HELLO' };
  if (o.type === 'TL_OPEN') return o.view === undefined || (typeof o.view === 'string' && WEB_VIEWS.includes(o.view)) ? (o as FromWebsite) : null;
  if (o.type === 'TL_LINK') return typeof o.code === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(o.code) ? { type: 'TL_LINK', code: o.code } : null;
  if (o.type === 'TL_UNLINK') return o.userId === undefined || (typeof o.userId === 'string' && o.userId.length <= 64) ? { type: 'TL_UNLINK', ...(typeof o.userId === 'string' ? { userId: o.userId } : {}) } : null;
  if (o.type === 'TL_LOCAL_ACCOUNT') {
    const u = o.user as Record<string, unknown> | undefined;
    return u && typeof u.id === 'string' && u.id.length > 0 && u.id.length <= 64 && typeof u.name === 'string' && u.name.trim().length > 0 && u.name.length <= 120 && typeof u.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) && u.email.length <= 254
      ? { type: 'TL_LOCAL_ACCOUNT', user: { id: u.id, name: u.name.trim(), email: u.email.trim().toLowerCase() } } : null;
  }
  if (o.type === 'TL_LOCAL_SIGNOUT') return { type: 'TL_LOCAL_SIGNOUT' };
  if (o.type === 'TL_CHECK') return ['misinfo', 'kind', 'safety'].includes(o.mode as string) && typeof o.text === 'string' && o.text.trim().length > 0 && o.text.length <= LIMITS.text ? (o as FromWebsite) : null;
  return null;
}

/** Chrome match pattern ("https://site.com/*", "http://localhost/*") → test for an origin. */
export function originAllowed(origin: string | undefined, patterns: string[]): boolean {
  if (!origin) return false;
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  return patterns.some((p) => {
    const m = /^(https?|\*):\/\/([^/]+)\//.exec(p);
    if (!m) return false;
    const [, scheme, host] = m;
    if (scheme !== '*' && `${scheme}:` !== u.protocol) return false;
    if (host.startsWith('*.')) return u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1));
    return u.hostname === host.split(':')[0];
  });
}
