/** Test helpers: Node codecs (jpeg-js) and byte-level fixture builders. */
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import type { RGBAImage } from '../src/engine/pixels';

export const SAMPLES = path.resolve(__dirname, '..', 'public', 'samples');

export function readSample(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(SAMPLES, name)));
}

export function decodeJpeg(bytes: Uint8Array): RGBAImage {
  const d = jpeg.decode(bytes, { useTArray: true });
  return { width: d.width, height: d.height, data: d.data };
}

/** Node stand-in for the browser's OffscreenCanvas JPEG(0.9) round trip. */
export async function recompressNode(img: RGBAImage): Promise<RGBAImage> {
  const enc = jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, 90);
  return decodeJpeg(new Uint8Array(enc.data));
}

export function solid(w: number, h: number, v = 128): RGBAImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
}

function crc32(buf: Uint8Array) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal PNG container (IHDR + given text chunks + IEND) - enough for metadata parsing. */
export function pngWithChunks(chunks: { type: string; data: Uint8Array }[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  for (const c of [{ type: 'IHDR', data: ihdr }, ...chunks, { type: 'IEND', data: new Uint8Array(0) }]) {
    const t = Buffer.from(c.type, 'latin1');
    const len = Buffer.alloc(4); len.writeUInt32BE(c.data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, Buffer.from(c.data)])));
    parts.push(len, t, Buffer.from(c.data), crc);
  }
  return new Uint8Array(Buffer.concat(parts));
}

export function tEXt(key: string, value: string): { type: string; data: Uint8Array } {
  return { type: 'tEXt', data: new Uint8Array(Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')])) };
}

/** Little-endian TIFF with ASCII tags. */
export function tiffAscii(entries: [number, string][]): Buffer {
  const n = entries.length;
  const ifdSize = 2 + n * 12 + 4;
  let dataOff = 8 + ifdSize;
  const head = Buffer.alloc(8 + ifdSize);
  head.write('II', 0, 'latin1'); head.writeUInt16LE(42, 2); head.writeUInt32LE(8, 4); head.writeUInt16LE(n, 8);
  const blobs: Buffer[] = [];
  entries.forEach(([tag, val], i) => {
    const v = Buffer.from(`${val}\0`, 'latin1');
    const e = 10 + i * 12;
    head.writeUInt16LE(tag, e); head.writeUInt16LE(2, e + 2); head.writeUInt32LE(v.length, e + 4);
    if (v.length <= 4) v.copy(head, e + 8); else { head.writeUInt32LE(dataOff, e + 8); blobs.push(v); dataOff += v.length; }
  });
  return Buffer.concat([head, ...blobs]);
}

/** A tiny JPEG (8x8 grey) carrying the given EXIF ASCII tags. */
export function jpegWithExif(entries: [number, string][]): Uint8Array {
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffAscii(entries)]);
  const img = solid(16, 16);
  const enc = jpeg.encode({ data: Buffer.from(img.data), width: 16, height: 16, exifBuffer: exif } as unknown as jpeg.RawImageData<Buffer>, 90);
  return new Uint8Array(enc.data);
}
