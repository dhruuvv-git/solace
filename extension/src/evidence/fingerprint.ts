/**
 * Evidence fingerprint:  h = SHA-256(screenshot || text || timestamp || URL)
 *
 * Canonical serialization (version 1) so the same evidence always gives the
 * same hash and fields cannot "slide" into each other:
 *
 *   "TRUSTLENS-EVIDENCE-V1"
 *   for each field in order [screenshot bytes, text, timestamp, url]:
 *       8-byte big-endian length  ||  field bytes
 *
 *   screenshot = raw decoded image bytes (empty if none)
 *   text       = UTF-8 of text.normalize('NFC')
 *   timestamp  = UTF-8 of the ISO-8601 string stored with the record
 *   url        = UTF-8 of the URL string stored with the record
 *
 * A hash shows whether a record changed AFTER it was fingerprinted. It does
 * not prove the screenshot is genuine or that the content was never faked.
 */
import { sha256Hex } from '../engine/math';

const MAGIC = 'TRUSTLENS-EVIDENCE-V1';

export function dataUrlToBytes(dataUrl: string | undefined | null): Uint8Array {
  if (!dataUrl) return new Uint8Array(0);
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('Screenshot must be a PNG, JPEG or WebP data URL.');
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function canonicalBytes(fields: { screenshot?: string | null; text: string; timestamp: string; url: string }): Uint8Array {
  const enc = new TextEncoder();
  const parts = [
    dataUrlToBytes(fields.screenshot),
    enc.encode((fields.text ?? '').normalize('NFC')),
    enc.encode(fields.timestamp),
    enc.encode(fields.url ?? ''),
  ];
  const magic = enc.encode(MAGIC);
  const total = magic.length + parts.reduce((s, p) => s + 8 + p.length, 0);
  const out = new Uint8Array(total);
  out.set(magic, 0);
  let off = magic.length;
  const dv = new DataView(out.buffer);
  for (const p of parts) {
    dv.setBigUint64(off, BigInt(p.length));
    off += 8;
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export async function fingerprint(fields: { screenshot?: string | null; text: string; timestamp: string; url: string }): Promise<string> {
  return sha256Hex(canonicalBytes(fields));
}

export async function verifyFingerprint(rec: { screenshot?: string | null; text: string; timestamp: string; url: string; fingerprint: string }): Promise<boolean> {
  try {
    return (await fingerprint(rec)) === rec.fingerprint;
  } catch {
    return false;
  }
}
