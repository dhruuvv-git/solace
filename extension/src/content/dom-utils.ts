/**
 * Helpers shared by the WhatsApp, Instagram and generic content scripts.
 * All injected UI lives in closed Shadow DOM so it cannot be styled or
 * scripted by the host page, and never alters page text (only a CSS blur).
 * Page text is treated as untrusted data: it is only ever set via
 * textContent, never innerHTML.
 */
import { LEXICON } from '../engine/data/lexicon';
import LOGO_URL from '../../public/icons/icon-48.png';
import { analyzeToxicity } from '../engine/toxicity';
import { bytesToBase64, type FetchImageReply, type Platform, type PingReply, type ToBackground, type ToContent } from '../shared/messaging';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, type Settings } from '../shared/settings';
import type { ToxicityResult } from '../shared/types';

export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

/* ---------------- messaging ---------------- */

export function extensionAlive(): boolean {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

export async function send<T = { ok: boolean; error?: string }>(msg: ToBackground): Promise<T | { ok: false; error: string }> {
  if (!extensionAlive()) return { ok: false, error: 'Solace was updated or reloaded. Reload this page to reconnect.' };
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Could not reach Solace.' };
  }
}

export async function fetchImageBase64(url: string): Promise<FetchImageReply> {
  try {
    if (!/^(https?:|blob:|data:image\/)/.test(url)) return { ok: false, error: 'Unsupported image address.' };
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `The image could not be downloaded (HTTP ${res.status}).` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return { ok: false, error: 'The image is larger than 7 MB. Save it and upload it in the panel instead.' };
    return { ok: true, base64: bytesToBase64(buf) };
  } catch {
    return { ok: false, error: 'The page’s image server does not allow Solace to read it directly.' };
  }
}

/* ---------------- settings ---------------- */

export function liveSettings(onChange?: (s: Settings) => void) {
  const state = { current: DEFAULT_SETTINGS as Settings, loaded: false };
  getSettings().then((s) => { state.current = s; state.loaded = true; onChange?.(s); }).catch(() => {});
  try { onSettingsChanged((s) => { state.current = s; onChange?.(s); }); } catch { /* context gone */ }
  return state;
}

export function toxicityFor(text: string, s: Settings): ToxicityResult {
  return analyzeToxicity(text, s.customLexicon.length ? [...LEXICON, ...s.customLexicon] : LEXICON);
}

/* ---------------- shadow UI ---------------- */

export const SHADOW_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif; }
.fab { position: fixed; right: 18px; bottom: 88px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.fab-btn { width: 48px; height: 48px; border-radius: 50%; background: #0d0814; color: #a78bfa; border: 1px solid rgba(168,85,247,.35); padding: 0; box-shadow: 0 6px 18px rgba(0,0,0,.35); cursor: pointer; display: grid; place-items: center; }
.fab-btn:focus-visible, button:focus-visible { outline: 2px solid #a855f7; outline-offset: 2px; }
.menu { background: #0b0712; color: #f1f5f9; border: 1px solid rgba(168,85,247,.35); border-radius: 12px; padding: 8px; width: 260px; box-shadow: 0 10px 30px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.menu h4 { margin: 2px 6px 4px; font-size: 13px; }
.menu p { margin: 2px 6px 6px; color: #94a3b8; font-size: 12px; line-height: 1.4; }
.menu button { all: unset; padding: 8px 10px; border-radius: 8px; cursor: pointer; color: #f1f5f9; font-size: 13px; }
.menu button:hover { background: #1a1028; }
.menu button[disabled] { opacity: .45; cursor: not-allowed; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483001; background: #f1f5f9; color: #0b0712; padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.35); max-width: 92vw; }
.toast.bad { background: #ffd0d2; }
.chip { display: inline-flex; gap: 8px; align-items: center; background: #0d0814; color: #f1f5f9; border: 1px solid rgba(168,85,247,.35); border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 12px; margin: 2px 0; }
.chip button { all: unset; background: linear-gradient(160deg,#9b6ce8,#7c3aed 50%,#5b21b6); color: #fff; border-radius: 999px; padding: 2px 10px; font-weight: 700; cursor: pointer; font-size: 12px; }
.bubble { position: fixed; z-index: 2147483000; width: min(360px, 92vw); background: #0b0712; color: #f1f5f9; border: 1px solid #fbbf24; border-radius: 12px; padding: 10px 12px; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 6px; }
.bubble.bad { border-color: #fb7185; }
.bubble strong { font-size: 13px; }
.bubble .alt { background: #1a1028; border-radius: 8px; padding: 6px 8px; }
.bubble .row { display: flex; gap: 6px; flex-wrap: wrap; }
.bubble button { all: unset; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(168,85,247,.35); cursor: pointer; font-size: 12px; font-weight: 700; }
.bubble button.primary { background: linear-gradient(160deg,#9b6ce8,#7c3aed 50%,#5b21b6); color: #fff; border-color: transparent; }
.muted { color: #94a3b8; font-size: 12px; }
`;

export function shadowHost(id: string): { host: HTMLElement; root: ShadowRoot } {
  document.getElementById(id)?.remove();
  const host = document.createElement('div');
  host.id = id;
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  root.appendChild(style);
  document.documentElement.appendChild(host);
  return { host, root };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

let toastRoot: ShadowRoot | null = null;
export function pageToast(text: string, bad = false) {
  if (!toastRoot || !toastRoot.host.isConnected) toastRoot = shadowHost('trustlens-toast').root;
  toastRoot.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el('div', { class: `toast ${bad ? 'bad' : ''}`, role: 'status' }, text);
  toastRoot.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

const SHIELD_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>';

export interface FabAction { label: string; needsSelection?: boolean; run: (sel: string) => void | Promise<void> }

/** Floating Solace button with a small menu of user-initiated actions. */
export function mountFab(getSelection: () => string, actions: () => FabAction[]) {
  const { host, root } = shadowHost('trustlens-fab');
  const wrap = el('div', { class: 'fab' });
  const menu = el('div', { class: 'menu', role: 'menu', hidden: '' });
  const btn = el('button', { class: 'fab-btn', 'aria-label': 'Ask Mimi', 'aria-expanded': 'false', title: 'Ask Mimi' });
  // Solace logo (bundled as a data URL); fall back to a static, extension-authored SVG if the page blocks data: images
  const logo = el('img', { alt: '', width: '34', height: '34' });
  logo.src = LOGO_URL;
  logo.addEventListener('error', () => { logo.remove(); btn.innerHTML = SHIELD_SVG; }, { once: true });
  btn.appendChild(logo);
  let savedSel = '';
  const render = () => {
    menu.replaceChildren();
    menu.appendChild(el('h4', {}, 'Mimi'));
    menu.appendChild(el('p', {}, savedSel ? `Selected: “${savedSel.slice(0, 80)}${savedSel.length > 80 ? '…' : ''}”` : 'Select message text first to check or save it. Checks run on your device.'));
    for (const a of actions()) {
      const b = el('button', { role: 'menuitem' }, a.label);
      if (a.needsSelection && !savedSel) b.setAttribute('disabled', '');
      b.addEventListener('click', async () => { close(); await a.run(savedSel); });
      menu.appendChild(b);
    }
  };
  const open = () => { savedSel = getSelection(); render(); menu.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); (menu.querySelector('button:not([disabled])') as HTMLElement | null)?.focus(); };
  const close = () => { menu.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); };
  // keep the page selection when pressing the button
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => (menu.hasAttribute('hidden') ? open() : close()));
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
  document.addEventListener('mousedown', (e) => { if (!e.composedPath().includes(host)) close(); });
  wrap.append(menu, btn);
  root.appendChild(wrap);
  return { remove: () => host.remove() };
}

/* ---------------- abuse shield overlay ---------------- */

const LABEL: Record<string, string> = { insult: 'insult', profanity: 'abusive language', threat: 'threat', 'body-shaming': 'body shaming', 'identity-hate': 'identity hate', 'sexual-harassment': 'sexual harassment' };

/** Blurs a text element (CSS only) and adds a Reveal/Hide control. Returns an undo function. */
export function blurElement(target: HTMLElement, r: ToxicityResult): () => void {
  if (target.dataset.tlBlurred) return () => {};
  target.dataset.tlBlurred = '1';
  const prevFilter = target.style.filter;
  target.style.filter = 'blur(6px)';
  target.style.transition = 'filter .2s';
  const host = document.createElement('span');
  host.dataset.tlChip = '1';
  host.style.display = 'block';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style'); style.textContent = SHADOW_CSS; root.appendChild(style);
  const chip = el('span', { class: 'chip', role: 'note' });
  const txt = el('span', {}, `Mimi hid this: ${LABEL[r.primaryCategory ?? 'insult'] ?? 'hurtful'}`);
  const b = el('button', { type: 'button' }, 'Reveal');
  let hidden = true;
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    hidden = !hidden;
    target.style.filter = hidden ? 'blur(6px)' : prevFilter;
    b.textContent = hidden ? 'Reveal' : 'Hide again';
    txt.textContent = hidden ? `Mimi hid this: ${LABEL[r.primaryCategory ?? 'insult'] ?? 'hurtful'}` : 'Shown by you';
  });
  chip.append(txt, b);
  root.appendChild(chip);
  target.parentElement?.insertBefore(host, target);
  return () => { target.style.filter = prevFilter; delete target.dataset.tlBlurred; host.remove(); };
}

export function unblurAll() {
  document.querySelectorAll<HTMLElement>('[data-tl-blurred]').forEach((e) => { e.style.filter = ''; delete e.dataset.tlBlurred; });
  document.querySelectorAll('[data-tl-chip]').forEach((e) => e.remove());
}

/* ---------------- composer warning ---------------- */

export function composerWatcher(isComposer: (el: Element) => boolean, getSettingsNow: () => Settings) {
  let bubble: { host: HTMLElement; root: ShadowRoot } | null = null;
  let timer: number | undefined;
  let dismissedFor = '';
  let lastSeen = 0;
  const close = () => { bubble?.host.remove(); bubble = null; };

  const show = (field: HTMLElement, text: string, r: ToxicityResult) => {
    if (!bubble || !bubble.host.isConnected) bubble = shadowHost('trustlens-composer');
    const rect = field.getBoundingClientRect();
    const box = el('div', { class: `bubble ${r.level === 'mild' ? '' : 'bad'}`, role: 'status', 'aria-live': 'polite' });
    box.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 370))}px`;
    box.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
    const words = r.matches.filter((m) => m.contribution > 0.05).map((m) => `“${m.matchedText}”`).slice(0, 3).join(', ');
    box.append(el('strong', {}, r.level === 'mild' ? 'This might come across as unkind' : 'This could hurt someone'), el('span', { class: 'muted' }, `Words: ${words}. Mimi never blocks or changes your message.`));
    if (r.suggestion) {
      box.append(el('span', { class: 'muted' }, 'A kinder way:'), el('div', { class: 'alt' }, r.suggestion));
    }
    const row = el('div', { class: 'row' });
    if (r.suggestion) {
      const copy = el('button', { class: 'primary', type: 'button' }, 'Copy suggestion');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(r.suggestion!); pageToast('Suggestion copied — paste it if you want to use it'); }
        catch { pageToast('Copy failed. Select the suggestion text and copy it.', true); }
      });
      row.append(copy);
    }
    const dismiss = el('button', { type: 'button' }, 'Dismiss');
    dismiss.addEventListener('click', () => { dismissedFor = text; close(); field.focus(); });
    row.append(dismiss);
    box.append(row);
    bubble.root.querySelectorAll('.bubble').forEach((b) => b.remove());
    bubble.root.appendChild(box);
  };

  const onInput = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !isComposer(t)) return;
    lastSeen = Date.now();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const s = getSettingsNow();
      if (!s.composerWarnings) { close(); return; }
      const text = (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement ? t.value : t.innerText).trim();
      if (text.length < 3 || text === dismissedFor) { close(); return; }
      const r = toxicityFor(text, s);
      if (r.level === 'none') close(); else show(t, text, r);
    }, 450);
  };
  document.addEventListener('input', onInput, true);
  // close the bubble once the composer is emptied (e.g. after sending)
  const sweep = window.setInterval(() => {
    const a = document.activeElement as HTMLElement | null;
    if (bubble && (!a || !isComposer(a) || !(a.innerText ?? (a as HTMLTextAreaElement).value ?? '').trim())) close();
  }, 1500);
  return {
    status: () => (lastSeen ? 'active' : 'waiting') as 'active' | 'waiting',
    stop: () => { document.removeEventListener('input', onInput, true); window.clearInterval(sweep); close(); },
  };
}

/* ---------------- misc ---------------- */

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: number | undefined;
  return (...a: A) => { window.clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
}

export function currentSelection(): string {
  return (window.getSelection()?.toString() ?? '').trim().slice(0, 20000);
}

export function onContentMessage(platform: Platform, ping: () => PingReply, extra?: (m: ToContent) => unknown | Promise<unknown>) {
  chrome.runtime.onMessage.addListener((m: ToContent, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !m || typeof m !== 'object') return false;
    if (m.type === 'TL_PING') { sendResponse(ping()); return false; }
    if (m.type === 'TL_FETCH_IMAGE' && typeof m.url === 'string') { fetchImageBase64(m.url).then(sendResponse); return true; }
    const r = extra?.(m);
    if (r instanceof Promise) { r.then(sendResponse); return true; }
    if (r !== undefined) { sendResponse(r); return false; }
    if (m.type === 'TL_SELECTION_CONTEXT') { sendResponse({ platform }); return false; }
    return false;
  });
}
