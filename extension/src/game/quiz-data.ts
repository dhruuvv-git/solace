/**
 * Train Your Eye catalogue. All images are procedurally drawn by
 * scripts/gen-assets.ts (no third-party content). "real" means the unedited
 * original render; "fake" means a deliberately manipulated copy.
 */
import type { GameItem } from '../shared/types';
import catalog from './quiz-catalog.json';

export const QUIZ_ITEMS: GameItem[] = catalog as GameItem[];

export const QUIZ_NOTE =
  'These practice images are drawings made for Solace, not photos. “Real” means the untouched original drawing; “Fake” means a copy that was deliberately edited (cloned, pasted, smoothed or relit). The clues you learn — impossible lighting, repeated objects, mismatched texture — are the same ones to look for in photos.';
