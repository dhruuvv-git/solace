/**
 * Signal 5 - known-fake matching with a perceptual difference hash.
 *
 * dHash: shrink luma to 9×8, then for each row bit = I(x,y) > I(x+1,y)
 * giving 64 bits (16 hex chars). Distance d = popcount(h1 XOR h2).
 * A match is d ≤ 10.
 *
 * Solace only searches the bundled DEMONSTRATION dataset plus any images
 * the user has added locally. It does not search the internet. No match is
 * NOT evidence that an image is authentic.
 */
import { IMAGE } from '../shared/constants';
import type { HashMatch, KnownFakeData } from '../shared/types';
import bundled from './data/known-fakes.json';
import { resizeGray, toGray, type GrayImage, type RGBAImage } from './pixels';

export interface HashEntry {
  id: string;
  label: string;
  hash: string;
  note?: string;
}

export const BUNDLED_KNOWN_FAKES: HashEntry[] = (bundled as { entries: HashEntry[] }).entries;

export function dHashGray(g: GrayImage): string {
  const s = resizeGray(g, 9, 8);
  let hex = '';
  let nibble = 0, bits = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const bit = s.data[y * 9 + x] > s.data[y * 9 + x + 1] ? 1 : 0;
      nibble = (nibble << 1) | bit;
      bits++;
      if (bits === 4) { hex += nibble.toString(16); nibble = 0; bits = 0; }
    }
  }
  return hex;
}

export function dHash(img: RGBAImage): string {
  return dHashGray(toGray(img));
}

export function isValidHash(h: unknown): h is string {
  return typeof h === 'string' && /^[0-9a-f]{16}$/.test(h);
}

const POP4 = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** d = popcount(h1 XOR h2) over two 64-bit hex hashes. */
export function hammingDistance(h1: string, h2: string): number {
  if (!isValidHash(h1) || !isValidHash(h2)) throw new Error('Invalid 64-bit hex hash');
  let d = 0;
  for (let i = 0; i < 16; i++) d += POP4[parseInt(h1[i], 16) ^ parseInt(h2[i], 16)];
  return d;
}

export function isMatch(distance: number): boolean {
  return distance <= IMAGE.dhash.matchDistance;
}

export function findMatches(hash: string, bundledSet: HashEntry[] | null, userSet: HashEntry[] | null): KnownFakeData {
  const matches: HashMatch[] = [];
  const scan = (set: HashEntry[] | null, dataset: HashMatch['dataset']) => {
    for (const e of set ?? []) {
      if (!isValidHash(e.hash)) continue;
      const d = hammingDistance(hash, e.hash);
      if (isMatch(d)) matches.push({ id: e.id, label: e.label, dataset, distance: d, note: e.note });
    }
  };
  scan(bundledSet, 'bundled-demo');
  scan(userSet, 'user-local');
  matches.sort((a, b) => a.distance - b.distance);
  return {
    hash,
    matches,
    bundledCount: bundledSet?.length ?? 0,
    userCount: userSet?.length ?? 0,
    datasetAvailable: (bundledSet?.length ?? 0) + (userSet?.length ?? 0) > 0,
  };
}

/** log LR scales from matchLogLR at d=0 down to ~matchLogLR/2 at the threshold. */
export function knownFakeLogLR(best: number | null): number {
  if (best === null) return 0;
  const t = IMAGE.dhash.matchDistance;
  return IMAGE.dhash.matchLogLR * (1 - best / (2 * (t + 1)));
}
