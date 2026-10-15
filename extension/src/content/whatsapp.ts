/**
 * Solace on WhatsApp Web.
 *
 * Anchors on attributes WhatsApp uses for copy/paste and message ids rather
 * than CSS class names:
 *   [data-pre-plain-text]  "[10:21, 15/10/2026] Name: " - message container with sender + time
 *   [data-id]              message row; ids starting "true_" are the user's own messages
 *   footer [contenteditable="true"]  the message composer
 * Only messages currently rendered on screen are looked at, only when a
 * feature is switched on, and nothing is sent or changed in WhatsApp.
 */
import type { PingReply, SelectionContextReply } from '../shared/messaging';
import { parsePrePlain } from './parsers';
import { blurElement, composerWatcher, currentSelection, debounce, liveSettings, mountFab, onContentMessage, pageToast, send, toxicityFor, unblurAll } from './dom-utils';

declare global { interface Window { __trustlensWA?: boolean } }

if (!window.__trustlensWA) {
  window.__trustlensWA = true;
  main();
}


function main() {
  const settings = liveSettings((s) => apply(s.whatsappEnabled));
  let fab: { remove: () => void } | null = null;
  let observer: MutationObserver | null = null;
  let composer: ReturnType<typeof composerWatcher> | null = null;
  const processed = new WeakSet<Element>();
  const recorded = new WeakSet<Element>();
  let lastSelectionSender: string | undefined;
  let scanned = 0;

  const senderForSelection = (): string | undefined => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const elx = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
    const box = elx?.closest('[data-pre-plain-text]');
    return parsePrePlain(box?.getAttribute('data-pre-plain-text') ?? null).sender;
  };
  document.addEventListener('selectionchange', debounce(() => { const s = senderForSelection(); if (s) lastSelectionSender = s; else if (!currentSelection()) lastSelectionSender = undefined; }, 150));

  const scan = () => {
    const s = settings.current;
    if (!s.whatsappEnabled || !s.abuseShieldBlur) return;
    const nodes = document.querySelectorAll<HTMLElement>('[data-pre-plain-text]');
    for (const box of nodes) {
      if (processed.has(box)) continue;
      processed.add(box);
      const row = box.closest('[data-id]');
      if (row?.getAttribute('data-id')?.startsWith('true_')) continue; // own message
      const textEl = box.querySelector<HTMLElement>('.selectable-text, [data-testid="msg-text"]') ?? box;
      const text = (textEl.innerText || '').trim();
      if (text.length < 2 || text.length > 4000) continue;
      scanned++;
      const r = toxicityFor(text, s);
      if (r.level === 'hurtful' || r.level === 'severe') {
        blurElement(textEl, r);
        const sender = parsePrePlain(box.getAttribute('data-pre-plain-text')).sender;
        if (s.patternTracking && sender && !recorded.has(box)) {
          recorded.add(box);
          void send({ type: 'TL_RECORD_PATTERN', senderLabel: sender.slice(0, 80), text: text.slice(0, 20000) });
        }
      }
    }
  };
  const scanSoon = debounce(scan, 400);

  const analyze = async (mode: 'misinfo' | 'kind' | 'safety', text: string) => {
    const res = await send({ type: 'TL_ANALYZE_TEXT', mode, text, senderLabel: lastSelectionSender });
    if (!res.ok) pageToast(res.error ?? 'Could not open Mimi. Click the Mimi icon in the toolbar — your text is waiting there.', true);
  };

  function apply(enabled: boolean) {
    if (!enabled) {
      fab?.remove(); fab = null; observer?.disconnect(); observer = null; composer?.stop(); composer = null; unblurAll();
      return;
    }
    if (settings.current.floatingButton && !fab) {
      fab = mountFab(currentSelection, () => [
        { label: 'Open Mimi', run: async () => { const r = await send({ type: 'TL_OPEN_PANEL' }); if (!r.ok) pageToast('Click the Mimi icon in Chrome’s toolbar to open the panel.', true); } },
        { label: 'Is it real? Check selected forward', needsSelection: true, run: (t) => analyze('misinfo', t) },
        { label: 'Is it kind? Check selected message', needsSelection: true, run: (t) => analyze('kind', t) },
        { label: 'Am I safe? Get a safety plan', needsSelection: true, run: (t) => analyze('safety', t) },
        { label: 'Save selection as evidence', needsSelection: true, run: async (t) => {
          const r = await send<{ ok: boolean; error?: string; screenshot?: boolean }>({ type: 'TL_CAPTURE_EVIDENCE', text: t, senderLabel: lastSelectionSender });
          if (r.ok) pageToast((r as { screenshot?: boolean }).screenshot ? 'Saved to Evidence Locker with screenshot' : 'Saved to Evidence Locker (text only — see the panel for screenshot options)');
          else pageToast(`Not saved: ${r.error}`, true);
        } },
      ]);
    } else if (!settings.current.floatingButton && fab) { fab.remove(); fab = null; }
    if (!observer) {
      observer = new MutationObserver(scanSoon);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (!settings.current.abuseShieldBlur) unblurAll();
    else scanSoon();
    if (!composer) composer = composerWatcher((e) => !!(e as HTMLElement).isContentEditable && !!e.closest('footer'), () => settings.current);
  }

  const ping = (): PingReply => {
    const s = settings.current;
    if (!s.whatsappEnabled) return { ok: true, platform: 'whatsapp', features: { integration: 'off' }, notes: ['Turned off in Settings.'] };
    const chatOpen = !!document.querySelector('footer [contenteditable="true"]');
    const notes: string[] = [];
    if (!chatOpen) notes.push('Open a chat to use message tools.');
    if (chatOpen && document.querySelectorAll('[data-pre-plain-text]').length === 0) notes.push('No readable messages found in this view; WhatsApp may have changed its layout — select text and use the right-click menu instead.');
    return {
      ok: true, platform: 'whatsapp',
      features: {
        'abuse shield': s.abuseShieldBlur ? (scanned > 0 || chatOpen ? 'active' : 'unavailable') : 'off',
        'typing warnings': s.composerWarnings ? (chatOpen ? 'active' : 'unavailable') : 'off',
        'pattern tracking': s.patternTracking ? 'active' : 'off',
      },
      notes,
    };
  };

  onContentMessage('whatsapp', ping, (m) => (m.type === 'TL_SELECTION_CONTEXT' ? ({ platform: 'whatsapp', senderLabel: lastSelectionSender ?? senderForSelection() } satisfies SelectionContextReply) : undefined));

  // settings may already be loaded with defaults; apply once the DOM is ready
  const start = () => apply(settings.current.whatsappEnabled);
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
