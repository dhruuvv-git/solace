/**
 * Solace on Instagram (single-page app).
 *
 * - Abuse Shield: leaf text spans (span[dir="auto"]) inside comment lists,
 *   post dialogs and DM threads are checked; hurtful ones get a CSS blur
 *   with a Reveal button. Usernames/links are skipped.
 * - Typing warnings for comment boxes and the DM composer.
 * - Profile review: on a profile page the floating menu offers "Review this
 *   profile", reading only what is visible (username, photo, post/follower
 *   counts). Account age is never visible, so it is left "unknown".
 * Navigation inside the SPA is detected by watching location changes.
 */
import type { PingReply, ProfileSnapshot, SelectionContextReply } from '../shared/messaging';
import { profileFromPath, readCounts } from './parsers';
import { blurElement, composerWatcher, currentSelection, debounce, liveSettings, mountFab, onContentMessage, pageToast, send, toxicityFor, unblurAll } from './dom-utils';

declare global { interface Window { __trustlensIG?: boolean } }

if (!window.__trustlensIG) {
  window.__trustlensIG = true;
  main();
}

function main() {
  const settings = liveSettings((s) => apply(s.instagramEnabled));
  let fab: { remove: () => void } | null = null;
  let observer: MutationObserver | null = null;
  let composer: ReturnType<typeof composerWatcher> | null = null;
  const processed = new WeakSet<Element>();
  let scanned = 0;
  let lastHref = location.href;

  const senderFor = (elx: Element): string | undefined => {
    const item = elx.closest('li, div[role="row"], article');
    const a = item?.querySelector<HTMLAnchorElement>('a[href^="/"][role="link"], h3 a[href^="/"], a[href^="/"]');
    const name = a?.getAttribute('href')?.split('/').filter(Boolean)[0];
    return name && profileFromPath(`/${name}/`) ? name : undefined;
  };

  const scan = () => {
    const s = settings.current;
    if (!s.instagramEnabled || !s.abuseShieldBlur) return;
    const spans = document.querySelectorAll<HTMLElement>('ul span[dir="auto"], div[role="dialog"] span[dir="auto"], div[role="row"] span[dir="auto"], div[role="grid"] div[dir="auto"]');
    for (const sp of spans) {
      if (processed.has(sp)) continue;
      processed.add(sp);
      if (sp.closest('a, h1, h2, button, [data-tl-chip]') || sp.querySelector('span[dir="auto"]')) continue;
      const text = (sp.innerText || '').trim();
      if (text.length < 3 || text.length > 2200) continue;
      scanned++;
      const r = toxicityFor(text, s);
      if (r.level === 'hurtful' || r.level === 'severe') {
        blurElement(sp, r);
        const sender = senderFor(sp);
        if (s.patternTracking && sender) void send({ type: 'TL_RECORD_PATTERN', senderLabel: sender, text });
      }
    }
  };
  const scanSoon = debounce(scan, 500);

  const analyze = async (mode: 'misinfo' | 'kind' | 'safety', text: string) => {
    const res = await send({ type: 'TL_ANALYZE_TEXT', mode, text });
    if (!res.ok) pageToast(res.error ?? 'Click the Mimi icon in the toolbar — your text is waiting there.', true);
  };

  const reviewProfile = async () => {
    const username = profileFromPath(location.pathname);
    if (!username) { pageToast('Open someone’s profile page first.', true); return; }
    const header = document.querySelector('header');
    const counts = header ? readCounts(header.innerText) : { posts: null, followers: null, following: null };
    const img = header?.querySelector<HTMLImageElement>('img');
    const profile: ProfileSnapshot = {
      username, url: location.href.slice(0, 2048),
      imageUrl: img?.src && /^https:\/\//.test(img.src) ? img.src.slice(0, 2048) : undefined,
      followers: counts.followers, following: counts.following, posts: counts.posts,
    };
    const res = await send({ type: 'TL_PROFILE_REVIEW', profile });
    if (!res.ok) pageToast(res.error ?? 'Click the Mimi icon in the toolbar — the profile is waiting there.', true);
    else if (!header) pageToast('Could not read this profile’s header. Fill in the details manually in the panel.', true);
  };

  function apply(enabled: boolean) {
    if (!enabled) { fab?.remove(); fab = null; observer?.disconnect(); observer = null; composer?.stop(); composer = null; unblurAll(); return; }
    if (settings.current.floatingButton && !fab) {
      fab = mountFab(currentSelection, () => [
        { label: 'Open Mimi', run: async () => { const r = await send({ type: 'TL_OPEN_PANEL' }); if (!r.ok) pageToast('Click the Mimi icon in Chrome’s toolbar to open the panel.', true); } },
        ...(profileFromPath(location.pathname) ? [{ label: 'Is it really them? Review this profile', run: reviewProfile }] : []),
        { label: 'Is it real? Check selected text', needsSelection: true, run: (t: string) => analyze('misinfo', t) },
        { label: 'Is it kind? Check selected text', needsSelection: true, run: (t: string) => analyze('kind', t) },
        { label: 'Am I safe? Get a safety plan', needsSelection: true, run: (t: string) => analyze('safety', t) },
        { label: 'Save selection as evidence', needsSelection: true, run: async (t: string) => {
          const r = await send<{ ok: boolean; error?: string; screenshot?: boolean }>({ type: 'TL_CAPTURE_EVIDENCE', text: t });
          if (r.ok) pageToast((r as { screenshot?: boolean }).screenshot ? 'Saved to Evidence Locker with screenshot' : 'Saved to Evidence Locker (text only)');
          else pageToast(`Not saved: ${r.error}`, true);
        } },
      ]);
    } else if (!settings.current.floatingButton && fab) { fab.remove(); fab = null; }
    if (!observer) {
      observer = new MutationObserver(scanSoon);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (!settings.current.abuseShieldBlur) unblurAll(); else scanSoon();
    if (!composer) {
      composer = composerWatcher((e) => {
        if (e instanceof HTMLTextAreaElement) return /comment|kommentar|टिप्पणी/i.test(e.getAttribute('aria-label') ?? '') || !!e.closest('form');
        return (e as HTMLElement).isContentEditable && e.getAttribute('role') === 'textbox';
      }, () => settings.current);
    }
  }

  const ping = (): PingReply => {
    const s = settings.current;
    if (!s.instagramEnabled) return { ok: true, platform: 'instagram', features: { integration: 'off' }, notes: ['Turned off in Settings.'] };
    const onProfile = !!profileFromPath(location.pathname);
    return {
      ok: true, platform: 'instagram',
      features: {
        'abuse shield': s.abuseShieldBlur ? (scanned > 0 ? 'active' : 'unavailable') : 'off',
        'typing warnings': s.composerWarnings ? 'active' : 'off',
        'profile review': onProfile ? 'active' : 'unavailable',
      },
      notes: [!onProfile ? 'Open a profile page to review an account.' : '', s.abuseShieldBlur && scanned === 0 ? 'No comments or messages visible yet.' : ''].filter(Boolean),
    };
  };

  onContentMessage('instagram', ping, (m) => (m.type === 'TL_SELECTION_CONTEXT' ? ({ platform: 'instagram' } satisfies SelectionContextReply) : undefined));

  // SPA navigation: the menu items are rebuilt each time the menu opens (so
  // "Review this profile" follows the current URL); rescan when the URL changes.
  window.setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; scanSoon(); } }, 800);

  const start = () => apply(settings.current.instagramEnabled);
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
