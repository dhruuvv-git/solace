/** Evidence Locker storage - local IndexedDB only, nothing is uploaded. */
import { uid } from '../engine/math';
import { idb } from '../shared/idb';
import type { EvidenceRecord } from '../shared/types';
import { fingerprint, verifyFingerprint } from './fingerprint';

export const EVIDENCE_LIMITS = { maxText: 20_000, maxScreenshotBytes: 8 * 1024 * 1024 };

export type NewEvidence = Omit<EvidenceRecord, 'id' | 'createdAt' | 'fingerprint' | 'fingerprintVersion' | 'timestamp'> & { timestamp?: string };

export function validateEvidence(e: NewEvidence): string | null {
  if (!e.text?.trim() && !e.screenshot) return 'Evidence needs text or a screenshot.';
  if ((e.text ?? '').length > EVIDENCE_LIMITS.maxText) return `Text is longer than ${EVIDENCE_LIMITS.maxText} characters.`;
  if (e.screenshot) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(e.screenshot)) return 'Screenshot must be a PNG, JPEG or WebP image.';
    if (e.screenshot.length * 0.75 > EVIDENCE_LIMITS.maxScreenshotBytes) return 'Screenshot is too large (limit 8 MB).';
  }
  try { new URL(e.url); } catch { if (e.url !== 'manual-entry') return 'Invalid source URL.'; }
  return null;
}

/** Build a record with its fingerprint (does not save). */
export async function buildEvidence(e: NewEvidence): Promise<EvidenceRecord> {
  const err = validateEvidence(e);
  if (err) throw new Error(err);
  const timestamp = e.timestamp ?? new Date().toISOString();
  const text = (e.text ?? '').normalize('NFC');
  const fp = await fingerprint({ screenshot: e.screenshot ?? null, text, timestamp, url: e.url });
  return { ...e, text, id: uid('ev'), createdAt: new Date().toISOString(), timestamp, fingerprint: fp, fingerprintVersion: 1 };
}

export async function saveEvidence(e: NewEvidence): Promise<EvidenceRecord> {
  const rec = await buildEvidence(e);
  await idb.put('evidence', rec);
  return rec;
}

export async function listEvidence(): Promise<EvidenceRecord[]> {
  const all = await idb.getAll<EvidenceRecord>('evidence');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteEvidence(ids: string[]): Promise<void> {
  await idb.deleteMany('evidence', ids);
}

export async function clearEvidence(): Promise<void> {
  await idb.clear('evidence');
}

export { verifyFingerprint };
