/**
 * Generates Solace' bundled, legally-distributable sample images:
 *   - procedurally drawn scenes (created by this script, no third-party content)
 *   - deliberately manipulated copies (clone, pasted patch, smoothing, ...)
 *   - two metadata demonstration files
 * and writes the bundled demonstration known-fake dHash dataset and the
 * Train Your Eye catalogue. Run: npm run assets
 */
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { dHash } from '../src/engine/known-fakes';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'samples');
fs.mkdirSync(OUT, { recursive: true });

const W = 640, H = 480;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function gauss(r: () => number) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

class Img {
  d: Float32Array;
  constructor(public w: number, public h: number) { this.d = new Float32Array(w * h * 3); }
  set(x: number, y: number, c: number[], a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    for (let k = 0; k < 3; k++) this.d[i + k] = this.d[i + k] * (1 - a) + c[k] * a;
  }
  get(x: number, y: number) { const i = (y * this.w + x) * 3; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  rect(x0: number, y0: number, x1: number, y1: number, c: number[], a = 1) {
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) this.set(x, y, c, a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number[], a = 1) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (v <= 1) this.set(x, y, c, a * Math.min(1, (1 - v) * 6));
    }
  }
  tri(p: number[][], c: number[]) {
    const [a, b, d] = p;
    const minX = Math.min(a[0], b[0], d[0]), maxX = Math.max(a[0], b[0], d[0]);
    const minY = Math.min(a[1], b[1], d[1]), maxY = Math.max(a[1], b[1], d[1]);
    const s = (p1: number[], p2: number[], p3: number[]) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    for (let y = Math.floor(minY); y <= maxY; y++) for (let x = Math.floor(minX); x <= maxX; x++) {
      const q = [x, y];
      const d1 = s(q, a, b), d2 = s(q, b, d), d3 = s(q, d, a);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.set(x, y, c);
    }
  }
  clone() { const o = new Img(this.w, this.h); o.d.set(this.d); return o; }
  blur(x0 = 0, y0 = 0, x1 = this.w, y1 = this.h, r = 1) {
    const src = this.clone();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const acc = [0, 0, 0]; let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = Math.min(this.w - 1, Math.max(0, x + dx)), yy = Math.min(this.h - 1, Math.max(0, y + dy));
        const v = src.get(xx, yy); acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]; n++;
      }
      this.set(x, y, [acc[0] / n, acc[1] / n, acc[2] / n]);
    }
  }
  grain(r: () => number, sigma: number, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * this.w + x) * 3; const g = gauss(r) * sigma;
      for (let k = 0; k < 3; k++) this.d[i + k] += g + gauss(r) * sigma * 0.3;
    }
  }
  copy(src: Img, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (sx + x < src.w && sy + y < src.h) this.set(dx + x, dy + y, src.get(sx + x, sy + y));
    }
  }
  rgba(): Uint8Array {
    const o = new Uint8Array(this.w * this.h * 4);
    for (let i = 0, p = 0; i < this.w * this.h; i++, p += 4) {
      for (let k = 0; k < 3; k++) o[p + k] = Math.max(0, Math.min(255, Math.round(this.d[i * 3 + k])));
      o[p + 3] = 255;
    }
    return o;
  }
  static fromRGBA(w: number, h: number, data: Uint8Array) {
    const o = new Img(w, h);
    for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) o.d[i * 3 + k] = data[i * 4 + k];
    return o;
  }
}

function jpegRoundTrip(img: Img, q: number): Img {
  const enc = jpeg.encode({ data: Buffer.from(img.rgba()), width: img.w, height: img.h }, q);
  const dec = jpeg.decode(enc.data, { useTArray: true });
  return Img.fromRGBA(dec.width, dec.height, dec.data);
}

interface SceneOpts { seed: number; sky: number[][]; sunX: number; sunY: number; trees: number[]; house: boolean; ground: number[]; lightLeft?: boolean }

function scene(o: SceneOpts): Img {
  const r = rng(o.seed);
  const img = new Img(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / (H * 0.62);
    const c = o.sky[0].map((v, k) => v * (1 - Math.min(1, t)) + o.sky[1][k] * Math.min(1, t));
    img.rect(0, y, W, y + 1, c);
  }
  img.ellipse(o.sunX, o.sunY, 34, 34, [255, 236, 170]);
  for (let i = 0; i < 4; i++) img.ellipse(80 + i * 150 + r() * 40, 70 + r() * 50, 50 + r() * 30, 16 + r() * 8, [250, 250, 252], 0.85);
  for (let x = 0; x < W; x++) {
    const hY = H * 0.6 + Math.sin(x / 90 + o.seed) * 22 + Math.sin(x / 33) * 6;
    img.rect(x, hY, x + 1, H, o.ground);
  }
  for (let x = 0; x < W; x += 2) for (let y = Math.floor(H * 0.66); y < H; y += 3) if (r() < 0.25) img.set(x, y, o.ground.map((v) => v * (0.8 + r() * 0.3)));
  // shadows point away from the sun
  const shadowDir = o.sunX < W / 2 ? 1 : -1;
  for (const tx of o.trees) {
    const ty = H * 0.62 + 40;
    img.ellipse(tx + shadowDir * 38, ty + 6, 46, 9, [20, 40, 20], 0.45);
    img.rect(tx - 6, ty - 40, tx + 6, ty + 5, [92, 60, 34]);
    img.ellipse(tx, ty - 70, 34, 44, [38, 110, 48]);
    img.ellipse(tx - (o.lightLeft ? 10 : -10), ty - 82, 16, 18, [70, 150, 70], 0.7);
  }
  if (o.house) {
    const hx = 380, hy = H * 0.62 + 20;
    img.ellipse(hx + 60 + shadowDir * 60, hy + 62, 90, 12, [20, 40, 20], 0.4);
    img.rect(hx, hy - 10, hx + 120, hy + 60, [214, 196, 168]);
    img.tri([[hx - 12, hy - 8], [hx + 132, hy - 8], [hx + 60, hy - 64]], [160, 64, 52]);
    img.rect(hx + 48, hy + 20, hx + 72, hy + 60, [96, 64, 40]);
    img.rect(hx + 14, hy + 8, hx + 38, hy + 30, [150, 196, 230]);
    img.rect(hx + 84, hy + 8, hx + 108, hy + 30, [150, 196, 230]);
  }
  img.blur(0, 0, W, H, 1);       // lens softness
  img.grain(r, 4.5);             // sensor-like grain
  return img;
}

const SCENES: SceneOpts[] = [
  { seed: 11, sky: [[94, 150, 214], [196, 222, 240]], sunX: 110, sunY: 90, trees: [120, 250], house: true, ground: [92, 150, 70] },
  { seed: 23, sky: [[240, 150, 90], [250, 214, 170]], sunX: 520, sunY: 120, trees: [90, 200, 300], house: false, ground: [120, 140, 60] },
  { seed: 37, sky: [[60, 110, 190], [170, 205, 235]], sunX: 320, sunY: 70, trees: [70, 560], house: true, ground: [80, 135, 75] },
  { seed: 41, sky: [[120, 170, 220], [220, 230, 240]], sunX: 560, sunY: 80, trees: [150, 260], house: true, ground: [100, 160, 80] },
  { seed: 53, sky: [[80, 120, 170], [190, 200, 215]], sunX: 90, sunY: 110, trees: [210, 330, 560], house: false, ground: [86, 128, 66] },
  { seed: 67, sky: [[100, 160, 230], [200, 225, 245]], sunX: 300, sunY: 95, trees: [100, 220], house: true, ground: [96, 150, 72] },
];

interface Out { id: string; file: string; label: 'real' | 'fake'; title: string; cue: string; explanation: string; initialRating: number }
const outputs: Out[] = [];
const known: { id: string; label: string; hash: string; note: string }[] = [];

function saveJpeg(img: Img, file: string, q = 88) {
  const enc = jpeg.encode({ data: Buffer.from(img.rgba()), width: img.w, height: img.h }, q);
  fs.writeFileSync(path.join(OUT, file), enc.data);
  const dec = jpeg.decode(enc.data, { useTArray: true });
  return dHash({ width: dec.width, height: dec.height, data: dec.data });
}

SCENES.forEach((s, i) => {
  const base = scene(s);
  const id = `scene${i + 1}`;
  saveJpeg(base, `${id}-original.jpg`);
  outputs.push({
    id: `${id}-original`, file: `${id}-original.jpg`, label: 'real', title: `Scene ${i + 1}`,
    cue: 'Consistent light and grain',
    explanation: 'Unedited render: shadows fall away from the single sun and the fine grain is the same everywhere.',
    initialRating: 1150 + i * 20,
  });

  const fake = base.clone();
  let title = '', cue = '', explanation = '', rating = 1200;
  const r = rng(s.seed + 999);
  switch (i) {
    case 0: { // copy-move clone of a tree
      fake.copy(base, 120 - 45, Math.floor(H * 0.62) - 120, 90, 170, 300, Math.floor(H * 0.62) - 120);
      title = 'Cloned tree'; cue = 'An identical copy of an object';
      explanation = 'The middle tree is a pixel-for-pixel copy of the left tree (copy-move forgery). Real trees are never identical.';
      rating = 1150; break;
    }
    case 1: { // second sun
      fake.ellipse(140, 100, 30, 30, [255, 236, 170]);
      fake.blur(100, 60, 180, 140, 1);
      title = 'Two suns'; cue = 'Impossible lighting';
      explanation = 'A second sun was painted in, but the shadows only match the first one. Inconsistent light sources are a classic manipulation clue.';
      rating = 1100; break;
    }
    case 2: { // pasted patch from a heavily compressed copy (different history, no grain)
      const low = jpegRoundTrip(scene({ ...s, seed: s.seed + 5, house: false, trees: [200] }), 20);
      fake.copy(low, 140, 230, 200, 180, 220, 250);
      title = 'Pasted region'; cue = 'A blocky patch with different grain';
      explanation = 'A region from a different, heavily compressed image was pasted in. Look for blockier texture and a sharp seam around the patch.';
      rating = 1300; break;
    }
    case 3: { // smoothed area (AI/beauty-filter-like) - grain removed
      fake.blur(120, 170, 420, 400, 3);
      title = 'Over-smoothed area'; cue = 'Waxy, grain-free region';
      explanation = 'One large area was heavily smoothed, removing the natural grain — similar to AI in-painting or beauty filters.';
      rating = 1350; break;
    }
    case 4: { // object added with wrong shadow direction
      const tx = 450, ty = H * 0.62 + 40;
      fake.ellipse(tx - 38, ty + 6, 46, 9, [20, 40, 20], 0.45); // wrong side: sun is left
      fake.ellipse(tx + 38, ty + 6, 46, 9, [92, 150, 70], 0.0);
      fake.rect(tx - 6, ty - 40, tx + 6, ty + 5, [92, 60, 34]);
      fake.ellipse(tx, ty - 70, 34, 44, [38, 110, 48]);
      title = 'Wrong shadow'; cue = 'Shadow points toward the light';
      explanation = 'The added right-hand tree casts its shadow toward the sun, opposite to every other shadow in the scene.';
      rating = 1250; break;
    }
    case 5: { // repeated cloud stamp + noise-free pasted bird shapes
      for (let k = 0; k < 3; k++) fake.copy(base, 60, 40, 140, 70, 260 + k * 110, 30);
      title = 'Stamped clouds'; cue = 'Repeating pattern';
      explanation = 'The same cloud was stamped three times in a row. Repeated identical textures are a sign of cloning.';
      rating = 1200; break;
    }
  }
  void r;
  saveJpeg(fake, `${id}-edited.jpg`);
  outputs.push({ id: `${id}-edited`, file: `${id}-edited.jpg`, label: 'fake', title, cue, explanation, initialRating: rating });
});

/*
 * "Debunked" demonstration images for the known-fake matcher. They use their
 * own scenes: dHash is a near-duplicate detector, so a lightly edited copy and
 * its original hash almost identically - sharing scenes with the game would
 * make every game original "match".
 */
const DEBUNKED: (SceneOpts & { title: string })[] = [
  { seed: 101, sky: [[30, 40, 80], [90, 80, 120]], sunX: 320, sunY: 140, trees: [100, 540], house: true, ground: [60, 90, 60], title: 'night sky with two moons' },
  { seed: 202, sky: [[200, 120, 60], [240, 200, 140]], sunX: 200, sunY: 90, trees: [420], house: false, ground: [150, 130, 70], title: 'desert with cloned trees' },
  { seed: 303, sky: [[110, 180, 230], [220, 235, 245]], sunX: 560, sunY: 70, trees: [80, 180, 280, 380], house: false, ground: [70, 140, 60], title: 'orchard with pasted house' },
];
DEBUNKED.forEach((d, i) => {
  const img = scene(d);
  if (i === 0) img.ellipse(470, 120, 26, 26, [240, 240, 220]);
  if (i === 1) img.copy(img, 380, 200, 90, 180, 520, 200);
  if (i === 2) { const other = scene({ ...SCENES[0], seed: 909 }); img.copy(other, 370, 200, 150, 140, 460, 260); }
  const file = `debunked-demo-${i + 1}.jpg`;
  const h = saveJpeg(img, file);
  known.push({ id: `debunked-demo-${i + 1}`, label: `Solace demo “debunked” image: ${d.title}`, hash: h, note: 'Fictional example created by Solace to demonstrate known-fake matching.' });
});

/* ---------- metadata demonstration files ---------- */

function crc32(buf: Uint8Array) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngWithText(img: Img, key: string, text: string): Buffer {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(img.rgba());
  const buf = PNG.sync.write(png);
  const data = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  const type = Buffer.from('tEXt', 'latin1');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  // insert after IHDR (8 sig + 25 IHDR)
  return Buffer.concat([buf.subarray(0, 33), len, type, data, crc, buf.subarray(33)]);
}
function tiffAscii(entries: [number, string][]): Buffer {
  // little-endian TIFF with one IFD of ASCII tags
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

const metaScene = scene({ seed: 81, sky: [[70, 90, 160], [220, 160, 200]], sunX: 470, sunY: 110, trees: [150], house: false, ground: [70, 110, 90] });
fs.writeFileSync(path.join(OUT, 'demo-ai-metadata.png'), pngWithText(metaScene, 'parameters',
  'a quiet valley at dusk, highly detailed\nNegative prompt: blurry\nSteps: 30, Sampler: Euler a, CFG scale: 7, Seed: 12345, Size: 640x480, Model: demo'));
{
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffAscii([[0x010f, 'SolaceDemo'], [0x0110, 'Example Phone (sample EXIF)'], [0x0131, 'Adobe Photoshop 25.0 (sample EXIF)']])]);
  const enc = jpeg.encode({ data: Buffer.from(metaScene.rgba()), width: W, height: H, exifBuffer: exif } as unknown as jpeg.RawImageData<Buffer>, 90);
  fs.writeFileSync(path.join(OUT, 'demo-camera-edited-exif.jpg'), enc.data);
}

/* ---------- write catalogues ---------- */

fs.writeFileSync(path.join(ROOT, 'src', 'engine', 'data', 'known-fakes.json'), JSON.stringify({
  description: 'Bundled DEMONSTRATION dataset: dHashes of Solace sample images that were deliberately manipulated for this project. Not a database of real-world debunked images.',
  entries: known,
}, null, 2));

fs.writeFileSync(path.join(ROOT, 'src', 'game', 'quiz-catalog.json'), JSON.stringify(outputs.map((o) => ({
  id: o.id, src: `samples/${o.file}`, label: o.label, title: o.title, cue: o.cue, explanation: o.explanation,
  provenance: 'Procedurally drawn by the Solace asset script (scripts/gen-assets.ts). No third-party images. Free to redistribute with Solace.',
  initialRating: o.initialRating,
})), null, 2));

/* Icons are made from assets/logo-source.png (the Solace robot) and live in public/icons; this script does not touch them. */

console.log(`Wrote ${outputs.length} game images, ${known.length} demo hashes, 2 metadata samples.`);
