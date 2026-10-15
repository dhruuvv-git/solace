import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildEvidence, clearEvidence, deleteEvidence, listEvidence, saveEvidence } from '../src/evidence/evidence-store';
import { canonicalBytes, fingerprint, verifyFingerprint } from '../src/evidence/fingerprint';
import { buildHtmlReport, buildJsonExport, escapeHtml } from '../src/evidence/report-export';
import { sha256Hex } from '../src/engine/math';
import { applyAnswer, expectedScore, initialState, nextItem, updateRatings } from '../src/game/elo';
import { QUIZ_ITEMS } from '../src/game/quiz-data';
import { addRef, clearPatterns, importRefsJson, listPatterns, listRefs, recordSenderMessage } from '../src/shared/local-data';
import { getSettings, saveSettings } from '../src/shared/settings';
import type { GameItem } from '../src/shared/types';

// localStorage shim for settings (landing-page code path)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
};
(globalThis as unknown as { window: EventTarget }).window = new EventTarget();

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('evidence fingerprint', () => {
  const f = { screenshot: PNG_1PX, text: 'I will leak your photos', timestamp: '2026-10-15T05:00:00.000Z', url: 'https://web.whatsapp.com/' };

  it('is reproducible and equals SHA-256 of the documented canonical bytes', async () => {
    const a = await fingerprint(f), b = await fingerprint({ ...f });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(await sha256Hex(canonicalBytes(f)));
  });

  it('changes when any field changes, and fields cannot slide into each other', async () => {
    const a = await fingerprint(f);
    expect(await fingerprint({ ...f, text: f.text + '.' })).not.toBe(a);
    expect(await fingerprint({ ...f, url: 'https://x.com' })).not.toBe(a);
    expect(await fingerprint({ ...f, screenshot: null })).not.toBe(a);
    const x = await fingerprint({ text: 'ab', timestamp: 'c', url: '' });
    const y = await fingerprint({ text: 'a', timestamp: 'bc', url: '' });
    expect(x).not.toBe(y);
  });

  it('normalises text to NFC', async () => {
    expect(await fingerprint({ ...f, text: 'é' })).toBe(await fingerprint({ ...f, text: 'é' }));
  });

  it('verify detects tampering', async () => {
    const rec = await buildEvidence({ text: 'hello', url: 'https://example.com/', platform: 'web', source: 'side-panel' });
    expect(await verifyFingerprint(rec)).toBe(true);
    expect(await verifyFingerprint({ ...rec, text: 'hell0' })).toBe(false);
  });
});

describe('evidence store, export and delete', () => {
  beforeEach(async () => { await clearEvidence(); });

  it('saves, lists, exports and deletes', async () => {
    const a = await saveEvidence({ text: '<script>alert(1)</script> threat', url: 'https://www.instagram.com/direct/', platform: 'instagram', source: 'safety-copilot', riskScore: 16, riskLevel: 'high', screenshot: PNG_1PX });
    await saveEvidence({ text: 'second', url: 'manual-entry', platform: 'manual', source: 'side-panel' });
    expect(await listEvidence()).toHaveLength(2);
    const html = await buildHtmlReport(await listEvidence());
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('unchanged since saved');
    expect(html).toContain(a.fingerprint);
    const json = JSON.parse(buildJsonExport(await listEvidence()));
    expect(json.records).toHaveLength(2);
    await deleteEvidence([a.id]);
    expect(await listEvidence()).toHaveLength(1);
    await clearEvidence();
    expect(await listEvidence()).toHaveLength(0);
  });

  it('rejects invalid evidence', async () => {
    await expect(saveEvidence({ text: '', url: 'https://x.com', platform: 'web', source: 'side-panel' })).rejects.toThrow(/text or a screenshot/);
    await expect(saveEvidence({ text: 'x', url: 'https://x.com', platform: 'web', source: 'side-panel', screenshot: 'javascript:alert(1)' })).rejects.toThrow(/PNG/);
    await expect(saveEvidence({ text: 'x', url: 'not a url', platform: 'web', source: 'side-panel' })).rejects.toThrow(/URL/);
  });

  it('report shows a mismatch for a tampered record', async () => {
    const r = await buildEvidence({ text: 'orig', url: 'https://x.com/', platform: 'web', source: 'side-panel' });
    const html = await buildHtmlReport([{ ...r, text: 'edited' }]);
    expect(html).toContain('DOES NOT MATCH');
    expect(escapeHtml('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;');
  });
});

describe('local pattern storage (hashed sender keys)', () => {
  beforeEach(async () => { await clearPatterns(); });

  it('stores hashed keys, not raw names, and raises an alert after repeats', async () => {
    const now = Date.now();
    await recordSenderMessage('whatsapp', 'Unknown +91 98xxxxxx', 'you loser', 0.8, 'insult', now - 2 * 3600e3);
    await recordSenderMessage('whatsapp', 'Unknown +91 98xxxxxx', 'you idiot', 0.8, 'insult', now - 3600e3);
    const r = await recordSenderMessage('whatsapp', 'Unknown +91 98xxxxxx', 'nobody likes you', 0.9, 'insult', now);
    expect(r.assessment.alert).toBe(true);
    const all = await listPatterns();
    expect(all).toHaveLength(1);
    expect(all[0].senderKey).toMatch(/^[0-9a-f]{32}$/);
    expect(all[0].senderKey).not.toContain('Unknown');
    // same message twice is not double counted
    const again = await recordSenderMessage('whatsapp', 'Unknown +91 98xxxxxx', 'nobody likes you', 0.9, 'insult', now);
    expect(again.added).toBe(false);
  });
});

describe('settings and reference hashes', () => {
  it('sanitises settings', async () => {
    const s = await saveSettings({ threshold: 9, patternTheta: NaN });
    expect(s.threshold).toBe(0.8);
    expect(s.patternTheta).toBe(2);
    expect((await getSettings()).threshold).toBe(0.8);
  });

  it('adds and imports user reference hashes with validation', async () => {
    await addRef('my fake', '0123456789abcdef', 'known-fake');
    await expect(addRef('bad', 'zz', 'known-fake')).rejects.toThrow();
    expect(await importRefsJson(JSON.stringify([{ label: 'a', hash: 'FFFFFFFFFFFFFFFF' }, { label: 'b', hash: 'nope' }]))).toBe(1);
    await expect(importRefsJson('not json')).rejects.toThrow(/JSON/);
    expect((await listRefs('known-fake')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Train Your Eye Elo', () => {
  it('expected score formula', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / (1 + 10), 10);
  });

  it('rating updates use K = 32 and are zero-sum', () => {
    const c = updateRatings(1200, 1200, true);
    expect(c.user).toBeCloseTo(1216);
    expect(c.img).toBeCloseTo(1184);
    const w = updateRatings(1200, 1200, false);
    expect(w.user).toBeCloseTo(1184);
    expect(w.img).toBeCloseTo(1216);
    expect(c.user + c.img).toBeCloseTo(2400);
  });

  it('applyAnswer tracks score, streak and progress', () => {
    const item = QUIZ_ITEMS[0];
    let st = initialState(QUIZ_ITEMS);
    const r1 = applyAnswer(st, item, item.label);
    expect(r1.correct).toBe(true);
    st = r1.state;
    expect(st.score).toBe(1);
    expect(st.streak).toBe(1);
    const r2 = applyAnswer(st, QUIZ_ITEMS[1], QUIZ_ITEMS[1].label === 'real' ? 'fake' : 'real');
    expect(r2.correct).toBe(false);
    expect(r2.state.streak).toBe(0);
    expect(r2.state.bestStreak).toBe(1);
    expect(r2.state.played).toBe(2);
  });

  it('next question is the unanswered item closest to the player rating', () => {
    const items: GameItem[] = [1000, 1210, 1500].map((r, i) => ({ id: `i${i}`, src: '', label: 'real', title: '', explanation: '', cue: '', provenance: '', initialRating: r }));
    const st = initialState(items);
    expect(nextItem(st, items, undefined, () => 0)!.id).toBe('i1');
    const st2 = { ...st, answered: { i1: 1 } };
    expect(nextItem(st2, items, undefined, () => 0)!.id).toBe('i0'); // |1000-1200| < |1500-1200|
  });

  it('bundled quiz has labelled items with provenance and files', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    expect(QUIZ_ITEMS.length).toBeGreaterThanOrEqual(10);
    for (const q of QUIZ_ITEMS) {
      expect(['real', 'fake']).toContain(q.label);
      expect(q.provenance).toMatch(/Solace/);
      expect(fs.existsSync(path.resolve(__dirname, '..', 'public', q.src))).toBe(true);
    }
  });
});
