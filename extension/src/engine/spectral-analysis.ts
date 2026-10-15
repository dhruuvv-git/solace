/**
 * Signal 3 - spectral slope.
 *
 * Natural photographs have a power spectrum that falls roughly as
 *   P(f) ∝ 1 / f^α,   α ≈ 2.
 * We take a centred grayscale crop, apply a Hann window (to suppress edge
 * leakage), compute the 2-D FFT, average power over rings of equal radial
 * frequency, and fit   log P = c − α · log f   by least squares inside a
 * mid-frequency band. signal = |α − 2|.
 *
 * Heuristic only: blur, heavy compression, text/graphics, macro shots and
 * night photos all move α away from 2 without any manipulation.
 */
import { IMAGE } from '../shared/constants';
import type { SpectralData } from '../shared/types';
import { clamp, linearRegression } from './math';
import { resizeGray, type GrayImage } from './pixels';

/** In-place iterative radix-2 complex FFT. n must be a power of two. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error('FFT length must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** 2-D FFT on an n×n row-major array. */
export function fft2d(re: Float64Array, im: Float64Array, n: number, inverse = false): void {
  const rr = new Float64Array(n), ri = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) { rr[x] = re[y * n + x]; ri[x] = im[y * n + x]; }
    fft(rr, ri, inverse);
    for (let x = 0; x < n; x++) { re[y * n + x] = rr[x]; im[y * n + x] = ri[x]; }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x]; }
    fft(rr, ri, inverse);
    for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y]; }
  }
}

/** Centre crop of size n (or area-resample when the image is smaller). */
export function centerCrop(g: GrayImage, n: number): { img: GrayImage; resampled: boolean } {
  if (g.width >= n && g.height >= n) {
    const x0 = Math.floor((g.width - n) / 2), y0 = Math.floor((g.height - n) / 2);
    const out = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = g.data[(y0 + y) * g.width + x0 + x];
    return { img: { width: n, height: n, data: out }, resampled: false };
  }
  return { img: resizeGray(g, n, n), resampled: true };
}

export function radialPowerSpectrum(img: GrayImage): number[] {
  const n = img.width;
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  let m = 0;
  for (let i = 0; i < n * n; i++) m += img.data[i];
  m /= n * n;
  for (let y = 0; y < n; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (n - 1));
    for (let x = 0; x < n; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (n - 1));
      re[y * n + x] = (img.data[y * n + x] - m) * wx * wy;
    }
  }
  fft2d(re, im, n);
  const half = n / 2;
  const sums = new Float64Array(half + 1), counts = new Float64Array(half + 1);
  for (let v = 0; v < n; v++) {
    const fy = v <= half ? v : v - n;
    for (let u = 0; u < n; u++) {
      const fx = u <= half ? u : u - n;
      const r = Math.round(Math.sqrt(fx * fx + fy * fy));
      if (r < 1 || r > half) continue;
      const p = re[v * n + u] ** 2 + im[v * n + u] ** 2;
      sums[r] += p; counts[r]++;
    }
  }
  const out: number[] = [];
  for (let r = 0; r <= half; r++) out.push(counts[r] > 0 ? sums[r] / counts[r] : 0);
  return out;
}

export function analyzeSpectrum(gray: GrayImage): SpectralData | null {
  const p = IMAGE.spectral;
  const { img, resampled } = centerCrop(gray, p.size);
  const spectrum = radialPowerSpectrum(img);
  const xs: number[] = [], ys: number[] = [];
  const allPoints: SpectralData['allPoints'] = [];
  for (let f = 1; f < spectrum.length; f++) {
    const pw = spectrum[f];
    if (!(pw > 0)) continue;
    const lf = Math.log10(f), lp = Math.log10(pw);
    const inFit = f >= p.fMin && f <= p.fMax;
    allPoints.push({ logF: lf, logP: lp, inFit });
    if (inFit) { xs.push(lf); ys.push(lp); }
  }
  if (xs.length < 8) return null; // flat image: no measurable spectrum
  const fit = linearRegression(xs, ys);
  if (!fit) return null;
  const alpha = -fit.slope;
  return {
    alpha,
    intercept: fit.intercept,
    r2: fit.r2,
    deviation: Math.abs(alpha - p.reference),
    points: xs.map((x, i) => ({ logF: x, logP: ys[i] })),
    allPoints,
    cropSize: p.size,
    resampled,
  };
}

export function spectralLogLR(d: SpectralData): number {
  const p = IMAGE.spectral;
  const raw = clamp(p.k * (d.deviation - p.dev0), p.lo, p.hi);
  // A poor straight-line fit means the power-law model itself does not hold: shrink toward 0.
  const fitQuality = clamp((d.r2 - p.minR2) / (1 - p.minR2), 0, 1);
  return raw * fitQuality;
}
