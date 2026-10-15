/** Local persistence for pattern history, scan history and user reference hashes. */
import { addEvent, assessPattern, senderKey } from '../engine/bullying-patterns';
import { isValidHash, type HashEntry } from '../engine/known-fakes';
import { sha256Hex, uid } from '../engine/math';
import { idb } from './idb';
import { getSalt, getSettings } from './settings';
import type { HarmCategory, HistoryEntry, PatternAssessment, SenderPattern } from './types';

/* ---------------- Pattern Detector ---------------- */

export async function recordSenderMessage(platform: string, label: string, text: string, severity: number, category: HarmCategory | null, ts = Date.now()): Promise<{ pattern: SenderPattern; assessment: PatternAssessment; added: boolean }> {
  const cleanLabel = label.trim().slice(0, 80);
  if (!cleanLabel) throw new Error('A sender name is needed to track a pattern.');
  const salt = await getSalt();
  const key = await senderKey(platform, cleanLabel, salt);
  const prev = (await idb.get<SenderPattern>('patterns', key)) ?? null;
  const msgHash = (await sha256Hex(`${salt}|${text.normalize('NFC')}`)).slice(0, 32);
  const { pattern, added } = addEvent(prev, key, cleanLabel, platform, { ts, severity, category, msgHash });
  if (added) await idb.put('patterns', pattern);
  const s = await getSettings();
  return { pattern, assessment: assessPattern(pattern, Date.now(), s.patternTheta), added };
}

export async function getSenderPattern(platform: string, label: string): Promise<SenderPattern | null> {
  const key = await senderKey(platform, label.trim().slice(0, 80), await getSalt());
  return (await idb.get<SenderPattern>('patterns', key)) ?? null;
}

export async function listPatterns(): Promise<SenderPattern[]> {
  return (await idb.getAll<SenderPattern>('patterns')).sort((a, b) => b.lastTs - a.lastTs);
}

export const deletePattern = (key: string) => idb.delete('patterns', key);
export const clearPatterns = () => idb.clear('patterns');

/* ---------------- Scan history (summaries only) ---------------- */

export async function addHistory(e: Omit<HistoryEntry, 'id' | 'ts'>): Promise<void> {
  try {
    const s = await getSettings();
    if (!s.scanHistory) return;
    await idb.put('history', { ...e, id: uid('h'), ts: Date.now() });
    const all = await idb.getAll<HistoryEntry>('history');
    // Keep the most recent five locally retained images to avoid filling browser storage.
    const images = all.filter((x) => x.imageData).sort((a, b) => b.ts - a.ts);
    if (images.length > 5) await idb.deleteMany('history', images.slice(5).map((x) => x.id));
    if (all.length > 100) {
      const old = all.sort((a, b) => a.ts - b.ts).slice(0, all.length - 100).map((x) => x.id);
      await idb.deleteMany('history', old);
    }
  } catch {
    // history is a convenience; never block an analysis on it
  }
}

export async function listHistory(): Promise<HistoryEntry[]> {
  return (await idb.getAll<HistoryEntry>('history')).sort((a, b) => b.ts - a.ts);
}
export const clearHistory = () => idb.clear('history');

/* ---------------- User reference hashes ---------------- */

export interface RefEntry extends HashEntry { createdAt: number; kind: 'known-fake' | 'profile-photo' }

export async function addRef(label: string, hash: string, kind: RefEntry['kind'], note?: string): Promise<RefEntry> {
  if (!isValidHash(hash)) throw new Error('Invalid image hash.');
  const e: RefEntry = { id: uid('ref'), label: label.trim().slice(0, 80) || 'Untitled', hash, note, createdAt: Date.now(), kind };
  await idb.put('refs', e);
  return e;
}
export async function listRefs(kind?: RefEntry['kind']): Promise<RefEntry[]> {
  const all = await idb.getAll<RefEntry>('refs');
  return all.filter((r) => !kind || r.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
}
export const deleteRef = (id: string) => idb.delete('refs', id);

/** Import a JSON list of {label, hash} (e.g. shared by a school or fact-checker). */
export async function importRefsJson(json: string): Promise<number> {
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('File is not valid JSON.'); }
  const list = Array.isArray(data) ? data : (data as { entries?: unknown[] })?.entries;
  if (!Array.isArray(list)) throw new Error('Expected a JSON array of {label, hash} objects.');
  let n = 0;
  for (const it of list.slice(0, 5000)) {
    const o = it as { label?: unknown; hash?: unknown; note?: unknown };
    if (typeof o.hash === 'string' && isValidHash(o.hash.toLowerCase())) {
      await addRef(typeof o.label === 'string' ? o.label : 'Imported', o.hash.toLowerCase(), 'known-fake', typeof o.note === 'string' ? o.note.slice(0, 200) : undefined);
      n++;
    }
  }
  if (n === 0) throw new Error('No valid 16-character hex hashes found.');
  return n;
}
