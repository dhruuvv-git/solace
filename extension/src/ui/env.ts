/** Detects where the UI runs (extension page vs landing demo) and wraps chrome APIs safely. */
import { safeWebsiteUrl } from '../shared/app-config';
import type { ToBackground } from '../shared/messaging';

export const isExtension = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.id && location.protocol === 'chrome-extension:';

export async function sendToBackground<T = { ok: boolean; error?: string }>(msg: ToBackground): Promise<T> {
  if (!isExtension()) throw new Error('Available in the installed extension only.');
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

export async function hasAllSitesAccess(): Promise<boolean> {
  if (!isExtension() || !chrome.permissions) return false;
  return chrome.permissions.contains({ origins: ['<all_urls>'] });
}

/** Must be called from a click handler (user gesture). */
export async function requestAllSitesAccess(): Promise<boolean> {
  if (!isExtension() || !chrome.permissions) return false;
  return chrome.permissions.request({ origins: ['<all_urls>'] });
}

export async function removeAllSitesAccess(): Promise<boolean> {
  if (!isExtension() || !chrome.permissions) return false;
  return chrome.permissions.remove({ origins: ['<all_urls>'] });
}

export function assetUrl(path: string): string {
  if (isExtension()) return chrome.runtime.getURL(path);
  return new URL(path, document.baseURI).toString();
}

/** Opens the companion website (configurable in Settings / solace.config.json). */
export function openWebsite(url: string) {
  const safe = safeWebsiteUrl(url);
  if (!safe) return false;
  if (isExtension() && chrome.tabs?.create) void chrome.tabs.create({ url: safe });
  else window.open(safe, '_blank', 'noopener');
  return true;
}

