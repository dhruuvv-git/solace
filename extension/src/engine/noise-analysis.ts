/**
 * Signal 4 - noise consistency.
 *
 *   R = I − blur(I)                      (3×3 box blur on luma)
 *   var_b = variance of R in each 32×32 block
 *   inconsistency = σ(var_b) / μ(var_b)
 *
 * Because detail (edges, texture) also ends up in R, the statistic is taken
 * over the SMOOTHEST half of the usable blocks (ranked by the variance of
 * blur(I)), where R is mostly sensor/compression noise. In a single camera
 * shot that noise is fairly uniform; pasted, generated or smoothed regions
 * often stand out. Nearly black/white blocks are skipped (clipping hides noise).
 */
import { IMAGE } from '../shared/constants';
import type { NoiseData } from '../shared/types';
import { clamp, coefficientOfVariation } from './math';
import { boxBlur3, type GrayImage } from './pixels';

export function analyzeNoise(gray: GrayImage, blockSize: number = IMAGE.noise.blockSize): NoiseData | null {
  const { width: w, height: h } = gray;
  const cols = Math.floor(w / blockSize), rows = Math.floor(h / blockSize);
  if (cols < 2 || rows < 2) return null;
  const blur = boxBlur3(gray);
  const variances: number[] = new Array(cols * rows).fill(NaN);
  const texture: { i: number; t: number }[] = [];
  const n = blockSize * blockSize;
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let s = 0, s2 = 0, lum = 0, b1 = 0, b2 = 0;
      for (let y = by * blockSize; y < (by + 1) * blockSize; y++) {
        for (let x = bx * blockSize; x < (bx + 1) * blockSize; x++) {
          const i = y * w + x;
          const r = gray.data[i] - blur.data[i];
          s += r; s2 += r * r; lum += gray.data[i];
          b1 += blur.data[i]; b2 += blur.data[i] * blur.data[i];
        }
      }
      const meanLum = lum / n;
      if (meanLum < IMAGE.noise.lumaLo || meanLum > IMAGE.noise.lumaHi) continue;
      const m = s / n;
      const idx = by * cols + bx;
      variances[idx] = Math.max(0, s2 / n - m * m);
      texture.push({ i: idx, t: b2 / n - (b1 / n) ** 2 });
    }
  }
  if (texture.length < IMAGE.noise.minBlocks * 2) return null;
  texture.sort((a, b) => a.t - b.t);
  const smooth = texture.slice(0, Math.ceil(texture.length / 2)).map((x) => variances[x.i]);
  const { mean, std, cv } = coefficientOfVariation(smooth);
  if (cv === null) return null;
  return { cols, rows, blockSize, variances, mean, std, inconsistency: cv, usedBlocks: smooth.length };
}

export function noiseLogLR(inconsistency: number): number {
  const p = IMAGE.noise;
  return clamp(p.k * (inconsistency - p.inc0), p.lo, p.hi);
}
