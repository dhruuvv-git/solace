import { describe, expect, it } from 'vitest';
import jpeg from 'jpeg-js';
import { confidenceFor, costThreshold, decideVerdict, fuse } from '../src/engine/bayesian-fusion';
import { analyzeShape } from '../src/engine/shape-analysis';
import { computeEla } from '../src/engine/ela-analysis';
import { analyzeImage } from '../src/engine/image-analysis';
import { BUNDLED_KNOWN_FAKES, dHash, findMatches, hammingDistance, isMatch } from '../src/engine/known-fakes';
import { analyzeMetadata, sniffFormat } from '../src/engine/metadata-analysis';
import { analyzeMisinformation } from '../src/engine/misinformation';
import { analyzeNoise } from '../src/engine/noise-analysis';
import { toGray } from '../src/engine/pixels';
import { analyzeSpectrum, fft, fft2d } from '../src/engine/spectral-analysis';
import { FUSION } from '../src/shared/constants';
import { decodeJpeg, jpegWithExif, pngWithChunks, readSample, recompressNode, solid, tEXt } from './helpers';

describe('format sniffing and metadata', () => {
  it('recognises JPEG, PNG and rejects other data', () => {
    expect(sniffFormat(readSample('scene1-original.jpg'))).toBe('jpeg');
    expect(sniffFormat(readSample('demo-ai-metadata.png'))).toBe('png');
    expect(sniffFormat(new TextEncoder().encode('hello world'))).toBe('unknown');
  });

  it('parses EXIF camera + editor tags from a JPEG', async () => {
    const m = await analyzeMetadata(jpegWithExif([[0x010f, 'Canon'], [0x0110, 'EOS 200D'], [0x0131, 'Adobe Photoshop 25.0']]));
    expect(m.data.hasExif).toBe(true);
    const keys = m.data.findings.map((f) => f.key);
    expect(keys).toContain('EXIF Make');
    expect(m.data.findings.find((f) => f.key === 'EXIF Software')?.flag).toBe('editor');
    expect(m.logLR).toBeCloseTo(0); // camera (−0.6) offset by editing software (+0.6)
  });

  it('camera-only EXIF mildly supports real', async () => {
    const m = await analyzeMetadata(jpegWithExif([[0x010f, 'Canon'], [0x0110, 'EOS 200D']]));
    expect(m.logLR).toBeLessThan(0);
  });

  it('detects Stable-Diffusion-style parameters in PNG tEXt', async () => {
    const png = pngWithChunks([tEXt('parameters', 'a cat\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 42')]);
    const m = await analyzeMetadata(png);
    expect(m.data.findings[0].flag).toBe('ai-prompt');
    expect(m.logLR).toBeGreaterThan(2);
  });

  it('detects an AI tool name and the IPTC AI marker', async () => {
    expect((await analyzeMetadata(pngWithChunks([tEXt('Software', 'Midjourney v6')]))).logLR).toBeGreaterThan(2);
    const xmp = new TextEncoder().encode('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></x:xmpmeta>');
    const m = await analyzeMetadata(pngWithChunks([{ type: 'iTXt', data: xmp }]));
    expect(m.data.findings.some((f) => f.flag === 'ai-tool')).toBe(true);
  });

  it('missing metadata is neutral, not suspicious', async () => {
    const m = await analyzeMetadata(readSample('scene1-original.jpg'));
    expect(m.logLR).toBe(0);
    expect(m.summary).toMatch(/No readable metadata/);
  });

  it('survives truncated / garbage input', async () => {
    const b = readSample('demo-ai-metadata.png').slice(0, 60);
    const m = await analyzeMetadata(b);
    expect(Number.isFinite(m.logLR)).toBe(true);
    const g = await analyzeMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]));
    expect(g.logLR).toBe(0);
  });

  it('reads the bundled sample files', async () => {
    expect((await analyzeMetadata(readSample('demo-ai-metadata.png'))).logLR).toBeGreaterThan(2);
    const e = await analyzeMetadata(readSample('demo-camera-edited-exif.jpg'));
    expect(e.data.findings.some((f) => f.flag === 'editor')).toBe(true);
  });
});

describe('error level analysis', () => {
  it('computes block CV from a real JPEG round trip', async () => {
    const img = decodeJpeg(readSample('scene3-edited.jpg'));
    const ela = computeEla(img, await recompressNode(img))!;
    expect(ela.cols).toBe(80);
    expect(ela.rows).toBe(60);
    expect(ela.cv).toBeGreaterThan(0);
    expect(ela.blocks.every(Number.isFinite)).toBe(true);
  });

  it('returns null (unavailable) for identical images and mismatched sizes', () => {
    const a = solid(64, 64);
    expect(computeEla(a, a)).toBeNull(); // zero mean -> CV undefined
    expect(computeEla(a, solid(32, 32))).toBeNull();
  });
});

describe('spectral slope', () => {
  it('FFT round-trips', () => {
    const re = Float64Array.from({ length: 16 }, (_, i) => Math.sin(i));
    const im = new Float64Array(16);
    const orig = re.slice();
    fft(re, im); fft(re, im, true);
    re.forEach((v, i) => expect(v).toBeCloseTo(orig[i], 9));
  });

  it('recovers alpha from synthetic 1/f^alpha noise', () => {
    for (const target of [1.5, 2, 3]) {
      const n = 256;
      const re = new Float64Array(n * n), im = new Float64Array(n * n);
      let s = 7;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
        const fx = u <= n / 2 ? u : u - n, fy = v <= n / 2 ? v : v - n;
        const f = Math.hypot(fx, fy);
        if (f === 0) continue;
        const amp = Math.pow(f, -target / 2), ph = rnd() * 2 * Math.PI;
        re[v * n + u] = amp * Math.cos(ph); im[v * n + u] = amp * Math.sin(ph);
      }
      fft2d(re, im, n, true);
      let lo = Infinity, hi = -Infinity;
      for (const x of re) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      const data = Float64Array.from(re, (x) => ((x - lo) / (hi - lo)) * 255);
      const sp = analyzeSpectrum({ width: n, height: n, data })!;
      expect(Math.abs(sp.alpha - target)).toBeLessThan(0.35);
      expect(sp.r2).toBeGreaterThan(0.8);
    }
  });

  it('flat image gives no spectrum', () => {
    expect(analyzeSpectrum(toGray(solid(300, 300)))).toBeNull();
  });
});

describe('noise consistency', () => {
  it('computes block statistics and handles tiny / flat images', () => {
    const nz = analyzeNoise(toGray(decodeJpeg(readSample('scene1-original.jpg'))))!;
    expect(nz.usedBlocks).toBeGreaterThan(10);
    expect(Number.isFinite(nz.inconsistency)).toBe(true);
    expect(analyzeNoise(toGray(solid(40, 40)))).toBeNull(); // < 2 blocks per side
    expect(analyzeNoise(toGray(solid(256, 256, 0)))).toBeNull(); // all saturated
  });

  it('a smoothed region raises inconsistency', () => {
    const a = analyzeNoise(toGray(decodeJpeg(readSample('scene4-original.jpg'))))!;
    const b = analyzeNoise(toGray(decodeJpeg(readSample('scene4-edited.jpg'))))!;
    expect(b.inconsistency).toBeGreaterThan(a.inconsistency);
  });
});

describe('dHash and Hamming distance', () => {
  it('popcount distance is correct', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hammingDistance('000000000000000f', '0000000000000001')).toBe(3);
    expect(() => hammingDistance('xyz', '0000000000000000')).toThrow();
  });

  it('threshold boundary: d = 10 matches, d = 11 does not', () => {
    expect(isMatch(10)).toBe(true);
    expect(isMatch(11)).toBe(false);
    const base = '0000000000000000';
    const ten = '00000000000003ff'; // 10 bits
    const eleven = '00000000000007ff';
    expect(hammingDistance(base, ten)).toBe(10);
    expect(findMatches(base, [{ id: 'a', label: 'A', hash: ten }], null).matches).toHaveLength(1);
    expect(findMatches(base, [{ id: 'a', label: 'A', hash: eleven }], null).matches).toHaveLength(0);
  });

  it('a recompressed + resized copy of a debunked demo image still matches', () => {
    const img = decodeJpeg(readSample('debunked-demo-2.jpg'));
    // downscale by 2 (box average) and recompress at quality 75, like a messenger would
    const w = img.width / 2, h = img.height / 2;
    const small = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) {
      const at = (yy: number, xx: number) => img.data[(yy * img.width + xx) * 4 + k];
      small[(y * w + x) * 4 + k] = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) / 4;
    }
    const enc = jpeg.encode({ data: Buffer.from(small), width: w, height: h }, 75);
    const k = findMatches(dHash(decodeJpeg(new Uint8Array(enc.data))), BUNDLED_KNOWN_FAKES, null);
    expect(k.matches[0]?.id).toBe('debunked-demo-2');
    expect(k.matches[0].dataset).toBe('bundled-demo');
  });

  it('unrelated images do not match and user datasets are labelled', () => {
    const h = dHash(decodeJpeg(readSample('scene2-original.jpg')));
    expect(findMatches(h, BUNDLED_KNOWN_FAKES, null).matches).toHaveLength(0);
    const u = findMatches(h, [], [{ id: 'u', label: 'mine', hash: h }]);
    expect(u.matches[0].dataset).toBe('user-local');
    expect(findMatches(h, [], []).datasetAvailable).toBe(false);
  });
});

describe('misinformation model', () => {
  it('each documented feature raises the score', () => {
    const base = analyzeMisinformation('The meeting is at 5 pm according to the school notice.');
    expect(base.level).toBe('low');
    const urgent = analyzeMisinformation('Forward this to everyone before it is deleted, urgent');
    expect(urgent.p).toBeGreaterThan(base.p);
    expect(urgent.features.find((f) => f.id === 'urgency')!.value).toBeGreaterThan(0);
    const caps = analyzeMisinformation('THE GOVERNMENT WILL CLOSE ALL BANKS TOMORROW MORNING');
    expect(caps.features.find((f) => f.id === 'caps')!.value).toBeGreaterThan(0.9);
    const ex = analyzeMisinformation('Banks close tomorrow!!!!!!!!');
    expect(ex.features.find((f) => f.id === 'exclaim')!.value).toBe(5); // capped
  });

  it('logit equals beta0 + sum of contributions and p = sigmoid(logit)', () => {
    const r = analyzeMisinformation('SHARE WITH EVERYONE!!! Breaking news');
    const sum = r.intercept + r.features.reduce((s, f) => s + f.contribution, 0);
    expect(r.logit).toBeCloseTo(sum, 10);
    expect(r.p).toBeCloseTo(1 / (1 + Math.exp(-sum)), 10);
    expect(r.level).toBe('high');
  });

  it('handles Hindi and Hinglish urgency phrases', () => {
    expect(analyzeMisinformation('यह खबर सबको भेजें, जल्दी!').features[0].value).toBeGreaterThan(0);
    expect(analyzeMisinformation('ye message sabko bhejo jaldi').features[0].value).toBeGreaterThan(0);
  });

  it('a link counts as a source', () => {
    expect(analyzeMisinformation('see https://pib.gov.in for details').features.find((f) => f.id === 'noSource')!.value).toBe(0);
  });

  it('provides Hindi and English correction text', () => {
    const r = analyzeMisinformation('x');
    expect(r.correction.en).toMatch(/reliable source/);
    expect(r.correction.hi).toMatch(/विश्वसनीय/);
  });
});

describe('Bayesian fusion', () => {
  it('implements L = logit(prior) + sum w*logLR and skips unavailable signals', () => {
    const r = fuse([
      { id: 'metadata', name: 'M', logLR: 2, weight: 1 },
      { id: 'ela', name: 'E', logLR: null, weight: 0.6 },
      { id: 'noise', name: 'N', logLR: -0.5, weight: 0.6 },
    ], { prior: 0.5 });
    expect(r.logOdds).toBeCloseTo(2 - 0.3, 10);
    expect(r.pFake).toBeCloseTo(1 / (1 + Math.exp(-1.7)), 10);
    expect(r.terms.map((t) => t.id)).toEqual(['metadata', 'noise']);
    expect(r.availableCount).toBe(2);
  });

  it('never returns NaN/Infinity and clamps extreme log LRs', () => {
    const r = fuse([{ id: 'metadata', name: 'M', logLR: Infinity, weight: 1 }, { id: 'ela', name: 'E', logLR: NaN, weight: 1 }]);
    expect(Number.isFinite(r.pFake)).toBe(true);
    const c = fuse([{ id: 'metadata', name: 'M', logLR: 1e9, weight: 1 }]);
    expect(c.terms[0].contribution).toBe(FUSION.maxAbsLogLR);
    expect(fuse([]).pFake).toBeCloseTo(0.5);
  });

  it('binary verdict at the threshold, never "not sure"', () => {
    expect(decideVerdict(0.5)).toBe('likely-fake');
    expect(decideVerdict(0.4999)).toBe('likely-real');
    expect(decideVerdict(0.6, 0.65)).toBe('likely-real');
    expect(decideVerdict(0.65, 0.65)).toBe('likely-fake');
    expect(fuse([]).verdict).toBe('likely-fake'); // P = 0.5 exactly with no evidence
    expect(fuse([]).confidence).toBe('low');
  });

  it('confidence boundaries', () => {
    expect(confidenceFor(0.8)).toBe('high');
    expect(confidenceFor(0.2)).toBe('high');
    expect(confidenceFor(0.79)).toBe('medium');
    expect(confidenceFor(0.65)).toBe('medium');
    expect(confidenceFor(0.64)).toBe('low');
    expect(confidenceFor(0.36)).toBe('low');
  });

  it('cost threshold t = C_FP / (C_FP + C_FN)', () => {
    expect(costThreshold(2, 1)).toBeCloseTo(2 / 3);
    expect(costThreshold(1, 1)).toBe(0.5);
    expect(costThreshold(0, 0)).toBe(0.5);
    expect(fuse([], { threshold: 2 }).threshold).toBe(0.95); // clamped
  });
});

describe('full image pipeline', () => {
  it('runs all signals on a sample and keeps unavailable signals unavailable', async () => {
    const bytes = readSample('scene1-original.jpg');
    const px = decodeJpeg(bytes);
    const r = await analyzeImage({ bytes, name: 'x.jpg', pixels: px, originalWidth: px.width, originalHeight: px.height, recompress: recompressNode });
    expect(r.signals).toHaveLength(7);
    const text = r.signals.find((s) => s.id === 'text')!;
    expect(text.status).toBe('unavailable');
    expect(text.contribution).toBeNull();
    expect(r.fusion.terms.find((t) => t.id === 'text')).toBeUndefined();
    for (const s of r.signals) if (s.contribution !== null) expect(Number.isFinite(s.contribution)).toBe(true);
    expect(Number.isFinite(r.fusion.pFake)).toBe(true);
  });

  it('ELA becomes unavailable (not faked) when re-encoding fails', async () => {
    const bytes = readSample('scene1-original.jpg');
    const px = decodeJpeg(bytes);
    const r = await analyzeImage({ bytes, name: 'x.jpg', pixels: px, originalWidth: px.width, originalHeight: px.height, recompress: async () => null });
    const ela = r.signals.find((s) => s.id === 'ela')!;
    expect(ela.status).toBe('unavailable');
    expect(ela.unavailableReason).toMatch(/not available/);
  });

  it('flags a bundled debunked demo image as likely fake via known-fake match', async () => {
    const bytes = readSample('debunked-demo-1.jpg');
    const px = decodeJpeg(bytes);
    const r = await analyzeImage({ bytes, name: 'd.jpg', pixels: px, originalWidth: px.width, originalHeight: px.height, recompress: recompressNode });
    expect(r.fusion.verdict).toBe('likely-fake');
    expect(r.signals.find((s) => s.id === 'knownFake')!.status).toBe('suspicious');
  });

  it('caption text participates in fusion when provided', async () => {
    const bytes = readSample('scene2-original.jpg');
    const px = decodeJpeg(bytes);
    const r = await analyzeImage({ bytes, name: 'x.jpg', pixels: px, originalWidth: px.width, originalHeight: px.height, recompress: recompressNode, caption: 'FORWARD TO EVERYONE!!! URGENT' });
    expect(r.signals.find((s) => s.id === 'text')!.status).toBe('suspicious');
  });
});

describe('messenger recompression context', () => {
  it('estimates JPEG quality from the quantisation table', async () => {
    const { estimateJpegQuality } = await import('../src/engine/metadata-analysis');
    const img = decodeJpeg(readSample('scene1-original.jpg'));
    for (const q of [50, 75, 90]) {
      const enc = new Uint8Array(jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, q).data);
      const m = await analyzeMetadata(enc);
      expect(Math.abs((m.data.jpegQuality ?? 0) - q)).toBeLessThanOrEqual(2);
    }
    expect(estimateJpegQuality(undefined)).toBeNull();
    expect(estimateJpegQuality(new Array(64).fill(1))).toBeGreaterThanOrEqual(99);
  });

  it('a WhatsApp-style re-saved JPEG without camera data down-weights ELA and noise', async () => {
    const img = decodeJpeg(readSample('scene1-original.jpg'));
    const bytes = new Uint8Array(jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, 75).data);
    const px = decodeJpeg(bytes);
    const r = await analyzeImage({ bytes, name: 'wa.jpg', pixels: px, originalWidth: px.width, originalHeight: px.height, recompress: recompressNode });
    expect(r.context.recompressed).toBe(true);
    expect(r.context.jpegQuality).toBeGreaterThanOrEqual(73);
    expect(r.signals.find((s) => s.id === 'ela')!.weight).toBeCloseTo(FUSION.weights.ela * FUSION.recompressedPixelWeight);
    expect(r.signals.find((s) => s.id === 'noise')!.weight).toBeCloseTo(FUSION.weights.noise * FUSION.recompressedPixelWeight);
    expect(r.limitations[0]).toMatch(/re-saved copy/);
  });

  it('camera photos and high-quality saves are not treated as re-saved copies', async () => {
    const withCam = await analyzeMetadata(jpegWithExif([[0x010f, 'Apple'], [0x0110, 'iPhone 13']]));
    expect(withCam.data.hasCamera).toBe(true);
    const bytes = readSample('scene1-original.jpg'); // saved at quality 88
    const px = decodeJpeg(bytes);
    const r = await analyzeImage({ bytes, name: 'x.jpg', pixels: px, originalWidth: px.width, originalHeight: px.height, recompress: recompressNode });
    expect(r.context.recompressed).toBe(false);
    expect(r.context.pixelWeightFactor).toBe(1);
  });

  it('high noise inconsistency typical of portrait-mode phone photos (2.8) no longer votes manipulated', async () => {
    const { noiseLogLR } = await import('../src/engine/noise-analysis');
    expect(noiseLogLR(2.8)).toBeLessThanOrEqual(0);
    expect(noiseLogLR(4.5)).toBeGreaterThan(0.5);
  });
});

describe('size & file name signal', () => {
  it('generator sizes and AI download names push toward fake', () => {
    expect(analyzeShape(1024, 1024, 'image.png').logLR).toBeGreaterThan(1);
    expect(analyzeShape(832, 1216, 'x.png').logLR).toBeGreaterThan(1);
    expect(analyzeShape(1024, 1024, 'ChatGPT Image Oct 12, 2026, 10_02_11 AM.png').logLR).toBe(3);
    expect(analyzeShape(1200, 900, 'Gemini_Generated_Image_abc123.jpeg').logLR).toBeGreaterThan(1);
  });
  it('camera frame shapes and camera file names push toward real', () => {
    expect(analyzeShape(1600, 1200, 'IMG-20261012-WA0003.jpg').logLR).toBeLessThan(-0.5); // WhatsApp keeps 4:3
    expect(analyzeShape(4032, 3024, 'IMG_4821.JPG').logLR).toBeLessThan(-1.2);
    expect(analyzeShape(1080, 1920, 'PXL_20261012_101010123.jpg').logLR).toBeLessThan(-1.2);
  });
  it('unknown shapes are neutral', () => {
    expect(analyzeShape(1000, 700, 'photo.jpg').logLR).toBe(0);
  });
});

describe('richer metadata', () => {
  it('a full camera capture record is strong evidence of a real photo', async () => {
    const m = await analyzeMetadata(jpegWithExif([[0x010f, 'Apple'], [0x0110, 'iPhone 13'], [0x9003, '2026:10:12 12:58:01'], [0xa434, 'iPhone 13 back camera'], [0x9291, '123']]));
    expect(m.data.captureFields).toBeGreaterThanOrEqual(3);
    expect(m.logLR).toBe(-2);
  });
  it('C2PA credentials from an AI generator are detected in PNG caBX', async () => {
    const box = new TextEncoder().encode('jumb....c2pa....claim_generator OpenAI-API c2pa.actions digitalSourceType http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia');
    const m = await analyzeMetadata(pngWithChunks([{ type: 'caBX', data: box }]));
    expect(m.data.hasC2pa).toBe(true);
    expect(m.logLR).toBe(3);
  });
  it('a real photo edited with AI fill (composite) counts as edited, not generated', async () => {
    const box = new TextEncoder().encode('jumb c2pa digitalsourcetype/compositeWithTrainedAlgorithmicMedia');
    const m = await analyzeMetadata(pngWithChunks([{ type: 'caBX', data: box }]));
    expect(m.logLR).toBeCloseTo(0.6);
  });
});

describe('size signal edge cases', () => {
  it('WhatsApp HD 2560×1920 and iPhone 4032×3024 count as camera shapes, Midjourney 1456×816 as generator', () => {
    expect(analyzeShape(2560, 1920, 'a.jpg').logLR).toBeLessThan(0);
    expect(analyzeShape(4032, 3024, 'a.jpg').logLR).toBeLessThan(0);
    expect(analyzeShape(1456, 816, 'a.png').logLR).toBeGreaterThan(1);
  });
});
