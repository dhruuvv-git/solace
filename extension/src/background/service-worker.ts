/**
 * Solace service worker (Manifest V3).
 * - Context menus for images and selected text.
 * - Fetches clicked images (page origin first, then extension host permission).
 * - Hands work to the side panel through chrome.storage.session ("pendingJob").
 * - Saves user-requested evidence (screenshot when permitted) to IndexedDB.
 * - Records Pattern Detector events when the user enabled tracking.
 * Messages from content scripts are validated; page text is only data.
 */
import { analyzeToxicity } from '../engine/toxicity';
import { LEXICON } from '../engine/data/lexicon';
import { sniffFormat } from '../engine/metadata-analysis';
import { saveEvidence } from '../evidence/evidence-store';
import { recordSenderMessage } from '../shared/local-data';
import {
  LIMITS, base64ToBytes, bytesToBase64, platformFromUrl, validateToBackground,
  originAllowed, validateFromWebsite,
  type FetchImageReply, type PanelJob, type SelectionContextReply, type SourceInfo,
} from '../shared/messaging';
import { getSettings, onSettingsChanged } from '../shared/settings';
import { getAccount, linkWithCode, pushSettingsIfChanged, unlinkFromWebsite, setWebsiteAccount, AccountError } from '../account/account';
import { APP } from '../shared/app-config';

const MAX_IMAGE = 7 * 1024 * 1024;
const MENU = {
  image: 'tl-image',
  misinfo: 'tl-misinfo',
  kind: 'tl-kind',
  safety: 'tl-safety',
  evidence: 'tl-evidence',
} as const;

const jobId = () => `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

async function setJob(job: PanelJob) {
  await chrome.storage.session.set({ pendingJob: job });
}

/** Opens the side panel; must be called synchronously inside a user-gesture event. */
function openPanel(windowId: number | undefined): Promise<boolean> {
  if (windowId === undefined) return Promise.resolve(false);
  try {
    return chrome.sidePanel.open({ windowId }).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.image, title: 'Check image with Solace', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.misinfo, title: 'Solace: Is it real? (check forward)', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.kind, title: 'Solace: Is it kind? (check message)', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.safety, title: 'Solace: Am I safe? (safety plan)', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.evidence, title: 'Solace: Save selection as evidence', contexts: ['selection'] });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createMenus();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});
chrome.runtime.onStartup.addListener(createMenus);

/* ---------------- helpers ---------------- */

async function ensureContentScript(tabId: number, frameId: number | undefined, url: string | undefined): Promise<boolean> {
  const p = platformFromUrl(url);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TL_PING' }, { frameId: frameId ?? 0 });
    return true;
  } catch {
    if (p !== 'web') return false; // WA/IG scripts are declared in the manifest; page needs a reload
    try {
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId ?? 0] }, files: ['content/generic-site.js'] });
      return true;
    } catch {
      return false;
    }
  }
}

async function fetchInWorker(url: string): Promise<FetchImageReply> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Unsupported image address.' };
    const allowed = await chrome.permissions.contains({ origins: [`${u.origin}/*`] });
    if (!allowed) return { ok: false, error: `This image is hosted on ${u.hostname}. Allow “image access on all sites” in Solace Settings, or save the image and upload it in the panel.` };
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `The image could not be downloaded (HTTP ${res.status}).` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE) return { ok: false, error: 'The image is larger than 7 MB. Save it and upload it in the panel.' };
    return { ok: true, base64: bytesToBase64(buf) };
  } catch (e) {
    return { ok: false, error: `Download failed: ${(e as Error).message}` };
  }
}

async function getImage(tab: chrome.tabs.Tab, frameId: number | undefined, srcUrl: string): Promise<FetchImageReply> {
  if (srcUrl.startsWith('data:image/')) {
    const b64 = srcUrl.split(',')[1] ?? '';
    if (b64.length * 0.75 > MAX_IMAGE) return { ok: false, error: 'The image is larger than 7 MB.' };
    return /;base64,/.test(srcUrl) ? { ok: true, base64: b64 } : { ok: false, error: 'Unsupported inline image.' };
  }
  let pageErr: string | undefined;
  if (tab.id !== undefined && (await ensureContentScript(tab.id, frameId, tab.url))) {
    try {
      const r = (await chrome.tabs.sendMessage(tab.id, { type: 'TL_FETCH_IMAGE', url: srcUrl }, { frameId: frameId ?? 0 })) as FetchImageReply;
      if (r?.ok && r.base64) return r;
      pageErr = r?.error;
    } catch (e) { pageErr = (e as Error).message; }
  } else if (platformFromUrl(tab.url) !== 'web') {
    pageErr = 'Solace is not connected to this tab yet. Reload the page and try again.';
  }
  if (srcUrl.startsWith('blob:')) return { ok: false, error: pageErr ?? 'This image only exists inside the page. Reload the page and try again.' };
  const w = await fetchInWorker(srcUrl);
  return w.ok ? w : { ok: false, error: w.error ?? pageErr };
}

async function selectionContext(tab: chrome.tabs.Tab, frameId?: number): Promise<SelectionContextReply> {
  const platform = platformFromUrl(tab.url);
  if (tab.id === undefined || platform === 'web') return { platform };
  try { return (await chrome.tabs.sendMessage(tab.id, { type: 'TL_SELECTION_CONTEXT' }, { frameId: frameId ?? 0 })) as SelectionContextReply; }
  catch { return { platform }; }
}

async function captureEvidence(tab: chrome.tabs.Tab, text: string, senderLabel: string | undefined, source: 'context-menu' | 'in-page') {
  const s = await getSettings();
  let screenshot: string | undefined;
  let note: string | undefined;
  if (s.includeScreenshots && tab.windowId !== undefined) {
    try { screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }); }
    catch { note = source === 'in-page' ? 'screenshot needs the right-click menu or “image access on all sites”' : 'screenshot was not permitted on this page'; }
    if (screenshot && screenshot.length * 0.75 > 8 * 1024 * 1024) { screenshot = undefined; note = 'screenshot too large'; }
  } else if (!s.includeScreenshots) note = 'screenshots are turned off in Settings';
  const rec = await saveEvidence({
    text: text.slice(0, LIMITS.text), url: tab.url ?? 'manual-entry', platform: platformFromUrl(tab.url), senderLabel, screenshot, source,
    note: note ? `Text only: ${note}.` : undefined,
  });
  await setJob({ id: jobId(), createdAt: Date.now(), kind: 'evidence-saved', evidenceId: rec.id, screenshot: !!screenshot, note });
  return { id: rec.id, screenshot: !!screenshot, note };
}

/* ---------------- context menu ---------------- */

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  // Open first, synchronously, while the user gesture is still valid.
  void openPanel(tab.windowId);
  void (async () => {
    const source: SourceInfo = { url: tab.url ?? info.pageUrl ?? '', platform: platformFromUrl(tab.url ?? info.pageUrl), title: tab.title?.slice(0, 200) };
    if (info.menuItemId === MENU.image && info.srcUrl) {
      const r = await getImage(tab, info.frameId, info.srcUrl);
      if (r.ok && r.base64) {
        const bytes = base64ToBytes(r.base64);
        if (sniffFormat(bytes) === 'unknown') {
          await setJob({ id: jobId(), createdAt: Date.now(), kind: 'image-error', message: 'That file is not a JPEG, PNG, WebP or GIF image Solace can analyse (it may be SVG or a video frame).', srcUrl: info.srcUrl, source });
          return;
        }
        let name = 'image';
        try { name = decodeURIComponent(new URL(info.srcUrl).pathname.split('/').pop() || 'image').slice(0, 80); } catch { /* keep */ }
        await setJob({ id: jobId(), createdAt: Date.now(), kind: 'image', name, base64: r.base64, source });
      } else {
        await setJob({ id: jobId(), createdAt: Date.now(), kind: 'image-error', message: r.error ?? 'The image could not be read.', srcUrl: info.srcUrl, source });
      }
      return;
    }
    const text = (info.selectionText ?? '').slice(0, LIMITS.text);
    if (!text.trim()) return;
    const ctx = await selectionContext(tab, info.frameId);
    source.senderLabel = ctx.senderLabel?.slice(0, LIMITS.label);
    if (info.menuItemId === MENU.evidence) {
      try { await captureEvidence(tab, text, source.senderLabel, 'context-menu'); }
      catch (e) { await setJob({ id: jobId(), createdAt: Date.now(), kind: 'image-error', message: `Evidence was not saved: ${(e as Error).message}`, source }); }
      return;
    }
    const mode = info.menuItemId === MENU.misinfo ? 'misinfo' : info.menuItemId === MENU.kind ? 'kind' : 'safety';
    await setJob({ id: jobId(), createdAt: Date.now(), kind: 'text', mode, text, source });
  })();
});

/* ---------------- messages from content scripts ---------------- */

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.tab) return false;
  const msg = validateToBackground(raw);
  if (!msg) { sendResponse({ ok: false, error: 'Invalid request.' }); return false; }
  const tab = sender.tab;
  const source: SourceInfo = { url: tab.url ?? '', platform: platformFromUrl(tab.url) };

  switch (msg.type) {
    case 'TL_OPEN_PANEL': {
      openPanel(tab.windowId).then((ok) => sendResponse(ok ? { ok } : { ok, error: 'Chrome only lets the panel open from its toolbar here. Click the Solace icon.' }));
      return true;
    }
    case 'TL_ANALYZE_TEXT': {
      const opening = openPanel(tab.windowId);
      setJob({ id: jobId(), createdAt: Date.now(), kind: 'text', mode: msg.mode, text: msg.text, source: { ...source, senderLabel: msg.senderLabel } })
        .then(() => opening)
        .then((ok) => sendResponse(ok ? { ok } : { ok, error: 'Click the Solace icon in the toolbar — your text is waiting in the panel.' }));
      return true;
    }
    case 'TL_CAPTURE_EVIDENCE': {
      captureEvidence(tab, msg.text, msg.senderLabel, 'in-page')
        .then((r) => sendResponse({ ok: true, screenshot: r.screenshot, id: r.id }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;
    }
    case 'TL_PROFILE_REVIEW': {
      const opening = openPanel(tab.windowId);
      (async () => {
        let imageBase64: string | undefined;
        let imageError: string | undefined;
        if (msg.profile.imageUrl) {
          const r = await fetchInWorker(msg.profile.imageUrl);
          if (r.ok) imageBase64 = r.base64; else imageError = `Profile photo not loaded: ${r.error}`;
        }
        await setJob({ id: jobId(), createdAt: Date.now(), kind: 'profile', profile: msg.profile, imageBase64, imageError, source });
        const ok = await opening;
        sendResponse(ok ? { ok } : { ok, error: 'Click the Solace icon in the toolbar — the profile is waiting in the panel.' });
      })();
      return true;
    }
    case 'TL_RECORD_PATTERN': {
      (async () => {
        const s = await getSettings();
        if (!s.patternTracking) return sendResponse({ ok: false, error: 'Pattern tracking is off.' });
        const r = analyzeToxicity(msg.text, s.customLexicon.length ? [...LEXICON, ...s.customLexicon] : LEXICON);
        const res = await recordSenderMessage(source.platform, msg.senderLabel, msg.text, r.toxicity, r.primaryCategory);
        sendResponse({ ok: true, added: res.added, alert: res.assessment.alert });
      })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;
    }
  }
  return false;
});

/* ---------------- messages from the companion website ---------------- */

chrome.runtime.onMessageExternal.addListener((raw, sender, sendResponse) => {
  // Chrome only delivers messages from origins listed in externally_connectable; check again anyway.
  if (!originAllowed(sender.origin ?? sender.url, APP.origins)) { sendResponse({ ok: false, error: 'This website is not allowed to talk to the extension.' }); return false; }
  const msg = validateFromWebsite(raw);
  if (!msg) { sendResponse({ ok: false, error: 'Invalid request.' }); return false; }
  if (msg.type === 'TL_HELLO') {
    getAccount().then((a) => sendResponse({
      ok: true, name: APP.name, assistant: APP.assistant, version: chrome.runtime.getManifest().version,
      account: { status: a.status, ...(a.user && a.status === 'signed-in' ? { userId: a.user.id, email: a.user.email, name: a.user.name } : {}) },
    }));
    return true;
  }
  if (msg.type === 'TL_LINK') {
    linkWithCode(msg.code).then(
      (user) => sendResponse({ ok: true, account: { status: 'signed-in', userId: user.id, email: user.email, name: user.name } }),
      (e) => sendResponse({ ok: false, error: e instanceof AccountError ? e.message : 'Mimi could not link your account. Try again.' }),
    );
    return true;
  }
  if (msg.type === 'TL_UNLINK') {
    unlinkFromWebsite(msg.userId).then((removed) => sendResponse({ ok: true, removed }));
    return true;
  }
  if (msg.type === 'TL_LOCAL_ACCOUNT') {
    setWebsiteAccount(msg.user).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'TL_LOCAL_SIGNOUT') {
    setWebsiteAccount(null).then(() => sendResponse({ ok: true }));
    return true;
  }
  const windowId = sender.tab?.windowId;
  const opening = openPanel(windowId);
  const source: SourceInfo = { url: sender.tab?.url ?? sender.origin ?? 'website', platform: 'web', title: 'Website' };
  const job: PanelJob = msg.type === 'TL_OPEN'
    ? { id: jobId(), createdAt: Date.now(), kind: 'navigate', view: msg.view ?? 'overview' }
    : { id: jobId(), createdAt: Date.now(), kind: 'text', mode: msg.mode, text: msg.text, source };
  setJob(job).then(() => opening).then((opened) => sendResponse(opened
    ? { ok: true, opened: true }
    : { ok: true, opened: false, hint: `Click the ${APP.assistant} icon in Chrome’s toolbar, then “Open ${APP.assistant}” — your request is waiting there.` }));
  return true;
});

/* ---------- account settings sync ---------- */
let syncTimer: ReturnType<typeof setTimeout> | undefined;
onSettingsChanged((settings) => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { pushSettingsIfChanged(settings).catch(() => {}); }, 1200);
});
