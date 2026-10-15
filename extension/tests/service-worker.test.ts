/**
 * Service worker logic with a stubbed chrome.* API (Node + fake IndexedDB).
 * Real-Chrome behaviour (gesture rules for sidePanel.open, captureVisibleTab
 * permissions) is NOT exercised here; see the README test report.
 */
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { listEvidence } from '../src/evidence/evidence-store';
import { listPatterns } from '../src/shared/local-data';

type Listener = (...a: unknown[]) => unknown;
const L: Record<string, Listener[]> = {};
const on = (name: string) => ({ addListener: (f: Listener) => { (L[name] ??= []).push(f); }, removeListener: () => {} });
const local: Record<string, unknown> = {};
const session: Record<string, unknown> = {};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sample = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'samples', 'scene1-original.jpg'));
const sampleB64 = sample.toString('base64');
const contentReplies: Record<string, unknown> = {};
const opened: number[] = [];
const menus: string[] = [];

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: { id: 'ext', onInstalled: on('installed'), onStartup: on('startup'), onMessage: on('message'), onMessageExternal: on('external'), getManifest: () => ({ version: '9.9.9' }) },
  contextMenus: { removeAll: (cb: () => void) => cb(), create: (o: { id: string }) => menus.push(o.id), onClicked: on('clicked') },
  sidePanel: { open: vi.fn(async ({ windowId }: { windowId: number }) => { opened.push(windowId); }), setPanelBehavior: vi.fn(async () => {}) },
  storage: {
    local: { get: async (k: string) => ({ [k]: local[k] }), set: async (o: object) => Object.assign(local, o), remove: async (k: string) => { delete local[k]; } },
    session: { get: async (k: string) => ({ [k]: session[k] }), set: async (o: object) => Object.assign(session, o), remove: async (k: string) => { delete session[k]; } },
    onChanged: on('changed'),
  },
  tabs: {
    sendMessage: vi.fn(async (_tab: number, m: { type: string }) => {
      if (!(m.type in contentReplies)) throw new Error('Could not establish connection');
      return contentReplies[m.type];
    }),
    captureVisibleTab: vi.fn(async () => PNG),
  },
  scripting: { executeScript: vi.fn(async () => { contentReplies.TL_PING = { ok: true }; contentReplies.TL_FETCH_IMAGE = { ok: true, base64: sampleB64 }; }) },
  permissions: { contains: vi.fn(async () => false) },
};

const tick = () => new Promise((r) => setTimeout(r, 60));
const fire = async (name: string, ...args: unknown[]) => { for (const f of L[name] ?? []) f(...args); await tick(); await tick(); };
const ask = (msg: unknown, tab = { id: 1, windowId: 7, url: 'https://web.whatsapp.com/' }) => new Promise((res) => {
  for (const f of L.message ?? []) f(msg, { id: 'ext', tab }, res);
});

beforeAll(async () => {
  await import('../src/background/service-worker');
  await fire('installed');
});

describe('service worker', () => {
  it('creates the five context menu items', () => {
    expect(menus).toEqual(['tl-image', 'tl-misinfo', 'tl-kind', 'tl-safety', 'tl-evidence']);
  });

  it('image on an ordinary site: injects generic script, fetches bytes, queues an image job', async () => {
    await fire('clicked', { menuItemId: 'tl-image', srcUrl: 'https://example.com/a.jpg', frameId: 0, pageUrl: 'https://example.com/' }, { id: 1, windowId: 7, url: 'https://example.com/' });
    const job = session.pendingJob as { kind: string; base64?: string; name?: string };
    expect(opened).toContain(7);
    expect(job.kind).toBe('image');
    expect(job.name).toBe('a.jpg');
    expect(job.base64).toBe(sampleB64);
  });

  it('cross-origin image without permission produces an honest error job', async () => {
    contentReplies.TL_FETCH_IMAGE = { ok: false, error: 'blocked by CORS' };
    await fire('clicked', { menuItemId: 'tl-image', srcUrl: 'https://cdn.other.com/b.jpg', frameId: 0 }, { id: 1, windowId: 7, url: 'https://example.com/' });
    const job = session.pendingJob as { kind: string; message: string };
    expect(job.kind).toBe('image-error');
    expect(job.message).toMatch(/cdn\.other\.com/);
  });

  it('selected text goes to the right shield with the WhatsApp sender', async () => {
    contentReplies.TL_SELECTION_CONTEXT = { platform: 'whatsapp', senderLabel: 'Unknown Caller' };
    await fire('clicked', { menuItemId: 'tl-safety', selectionText: 'I will leak your photos', frameId: 0 }, { id: 1, windowId: 7, url: 'https://web.whatsapp.com/' });
    const job = session.pendingJob as { kind: string; mode: string; text: string; source: { senderLabel: string; platform: string } };
    expect(job).toMatchObject({ kind: 'text', mode: 'safety', text: 'I will leak your photos' });
    expect(job.source).toMatchObject({ platform: 'whatsapp', senderLabel: 'Unknown Caller' });
  });

  it('save selection as evidence stores a fingerprinted record with screenshot', async () => {
    await fire('clicked', { menuItemId: 'tl-evidence', selectionText: 'pay or else', frameId: 0 }, { id: 1, windowId: 7, url: 'https://web.whatsapp.com/' });
    await tick();
    const all = await listEvidence();
    expect(all[0].text).toBe('pay or else');
    expect(all[0].screenshot).toBe(PNG);
    expect(all[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((session.pendingJob as { kind: string }).kind).toBe('evidence-saved');
  });

  it('evidence still saves (text only) when the screenshot is not permitted', async () => {
    (chrome.tabs.captureVisibleTab as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no permission'));
    const r = await ask({ type: 'TL_CAPTURE_EVIDENCE', text: 'second item' }) as { ok: boolean; screenshot: boolean };
    expect(r.ok).toBe(true);
    expect(r.screenshot).toBe(false);
    const rec = (await listEvidence()).find((x) => x.text === 'second item')!;
    expect(rec.note).toMatch(/Text only/);
  });

  it('rejects malformed messages and messages without a tab', async () => {
    expect(await ask({ type: 'TL_ANALYZE_TEXT', mode: 'x', text: 1 })).toMatchObject({ ok: false });
    let replied = false;
    for (const f of L.message) f({ type: 'TL_OPEN_PANEL' }, { id: 'ext' }, () => { replied = true; });
    await tick();
    expect(replied).toBe(false);
  });

  it('pattern events are recorded only when tracking is on', async () => {
    expect(await ask({ type: 'TL_RECORD_PATTERN', senderLabel: 'X', text: 'you idiot loser' })).toMatchObject({ ok: false });
    local.settings = { patternTracking: true };
    expect(await ask({ type: 'TL_RECORD_PATTERN', senderLabel: 'X', text: 'you idiot loser' })).toMatchObject({ ok: true, added: true });
    expect((await listPatterns()).length).toBe(1);
  });

  it('profile review queues the observed profile', async () => {
    const r = await ask({ type: 'TL_PROFILE_REVIEW', profile: { username: 'priya.k', url: 'https://www.instagram.com/priya.k/', followers: 12, following: 1940, posts: 3 } }, { id: 1, windowId: 7, url: 'https://www.instagram.com/priya.k/' });
    expect(r).toMatchObject({ ok: true });
    expect(session.pendingJob).toMatchObject({ kind: 'profile', profile: { username: 'priya.k', following: 1940 } });
  });

  it('website: HELLO from an allowed origin returns name and version', async () => {
    const r = await new Promise((res) => { for (const f of L.external) f({ type: 'TL_HELLO' }, { origin: 'http://127.0.0.1:5500', tab: { windowId: 3 } }, res); });
    expect(r).toMatchObject({ ok: true, assistant: 'Mimi', version: '9.9.9' });
  });

  it('website: HELLO reflects when Mimi is open and clears when it closes', async () => {
    expect(await ask({ type: 'TL_PANEL_VISIBILITY', visible: true })).toMatchObject({ ok: true });
    const openedPanel = await new Promise((res) => { for (const f of L.external) f({ type: 'TL_HELLO' }, { origin: 'http://127.0.0.1:5500', tab: { windowId: 3 } }, res); });
    expect(openedPanel).toMatchObject({ mimiOpen: true });
    expect(await ask({ type: 'TL_PANEL_VISIBILITY', visible: false })).toMatchObject({ ok: true });
    const closedPanel = await new Promise((res) => { for (const f of L.external) f({ type: 'TL_HELLO' }, { origin: 'http://127.0.0.1:5500', tab: { windowId: 3 } }, res); });
    expect(closedPanel).toMatchObject({ mimiOpen: false });
  });

  it('website: blocks other origins and invalid messages', async () => {
    const bad = await new Promise((res) => { for (const f of L.external) f({ type: 'TL_HELLO' }, { origin: 'https://evil.example' }, res); });
    expect(bad).toMatchObject({ ok: false });
    const inv = await new Promise((res) => { for (const f of L.external) f({ type: 'TL_CHECK', mode: 'eval', text: 'x' }, { origin: 'http://localhost:5500' }, res); });
    expect(inv).toMatchObject({ ok: false, error: 'Invalid request.' });
  });

  it('website: CHECK queues the text for Mimi and opens the panel', async () => {
    const r = await new Promise((res) => { for (const f of L.external) f({ type: 'TL_CHECK', mode: 'safety', text: 'i will leak your photos' }, { origin: 'http://127.0.0.1:5500', tab: { windowId: 4, url: 'http://127.0.0.1:5500/' } }, res); });
    expect(r).toMatchObject({ ok: true, opened: true });
    expect(session.pendingJob).toMatchObject({ kind: 'text', mode: 'safety', text: 'i will leak your photos' });
    expect(opened).toContain(4);
  });
});
