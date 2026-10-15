/**
 * Signal 2 - Error Level Analysis.
 *
 *   E = |I - JPEG90(I)|           per pixel, averaged over R, G, B
 *   per-block error  e_b = mean(E over an 8x8 block)
 *   CV = sigma(e_b) / mu(e_b)
 *
 * The JPEG re-encode is done by an injected codec (OffscreenCanvas in the
 * browser, jpeg-js in tests) so this file stays pure and testable.
 */
import { IMAGE } from '../shared/constants';
import type { ElaData } from '../shared/types';
import { clamp, coefficientOfVariation } from './math';
import type { RGBAImage } from './pixels';

export function computeEla(original: RGBAImage, recompressed: RGBAImage, blockSize: number = IMAGE.ela.blockSize): ElaData | null {
  if (original.width !== recompressed.width || original.height !== recompressed.height) return null;
  const { width: w, height: h } = original;
  const cols = Math.floor(w / blockSize);
  const rows = Math.floor(h / blockSize);
  if (cols < 2 || rows < 2) return null;
  const blocks = new Array<number>(cols * rows).fill(0);
  const a = original.data;
  const b = recompressed.data;
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      for (let y = by * blockSize; y < (by + 1) * blockSize; y++) {
        let p = (y * w + bx * blockSize) * 4;
        for (let x = 0; x < blockSize; x++, p += 4) {
          sum += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
        }
      }
      blocks[by * cols + bx] = sum / (blockSize * blockSize * 3);
    }
  }
  const { mean, std, cv } = coefficientOfVariation(blocks);
  if (cv === null) return null;
  return { cols, rows, blockSize, blocks, mean, std, cv, originalWasJpeg: false };
}

export function elaLogLR(cv: number): number {
  const p = IMAGE.ela;
  return clamp(p.k * (cv - p.cv0), p.lo, p.hi);
}
