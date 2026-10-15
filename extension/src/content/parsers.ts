/** Pure page-text parsers used by the content scripts (unit-tested). */

/** WhatsApp data-pre-plain-text: "[10:21, 15/10/2026] Name: " */
export function parsePrePlain(attr: string | null): { sender?: string; time?: string } {
  if (!attr) return {};
  const m = /^\[([^\]]{3,40})\]\s*([^:]{1,60}):\s*$/.exec(attr.trim() + (attr.trim().endsWith(':') ? '' : ':'));
  return m ? { time: m[1], sender: m[2].trim() } : {};
}

export const RESERVED = new Set(['explore', 'reels', 'reel', 'direct', 'accounts', 'p', 'stories', 'tv', 'about', 'legal', 'developer', 'challenge', 'emails', 'session', 'web', 'privacy']);

export function profileFromPath(path: string): string | null {
  const m = /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(path);
  if (!m || RESERVED.has(m[1].toLowerCase())) return null;
  return m[1];
}

/** "1,234" "12.5K" "1.2M" "1.2 lakh" → number. */
export function parseCount(s: string): number | null {
  const m = /([\d][\d.,]*)\s*([KkMmBb]|lakh|cr|crore)?/.exec(s.replace(/\s+/g, ' '));
  if (!m) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const raw = unit ? m[1].replace(/,/g, '') : m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const mult = unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : unit === 'b' ? 1e9 : unit === 'lakh' ? 1e5 : unit === 'cr' || unit === 'crore' ? 1e7 : 1;
  return Math.round(n * mult);
}

export function readCounts(text: string): { posts: number | null; followers: number | null; following: number | null } {
  const grab = (word: string) => {
    const m = new RegExp(`([\\d][\\d.,]*\\s*(?:[KkMmBb]|lakh|cr)?)\\s+${word}`, 'i').exec(text);
    return m ? parseCount(m[1]) : null;
  };
  return { posts: grab('posts?'), followers: grab('followers?'), following: grab('following') };
}

