/**
 * Train Your Eye - Elo ratings. Player and every image are rated.
 *
 *   E = 1 / (1 + 10^((R_img − R_user)/400))      expected score of the player
 *   R'_user = R_user + K (S − E)                  S = 1 correct, 0 wrong, K = 32
 *   R'_img  = R_img  + K ((1 − S) − (1 − E))      complementary update
 *
 * Next question: unanswered (or least recently answered) image whose rating
 * is closest to the player's rating, with a tiny random tie-break.
 */
import { ELO } from '../shared/constants';
import type { GameItem, GameState } from '../shared/types';

export function expectedScore(rUser: number, rImg: number): number {
  return 1 / (1 + Math.pow(10, (rImg - rUser) / 400));
}

export function updateRatings(rUser: number, rImg: number, correct: boolean, K: number = ELO.K): { user: number; img: number; expected: number } {
  const E = expectedScore(rUser, rImg);
  const S = correct ? 1 : 0;
  return { user: rUser + K * (S - E), img: rImg + K * ((1 - S) - (1 - E)), expected: E };
}

export function initialState(items: GameItem[]): GameState {
  return {
    userRating: ELO.startRating,
    itemRatings: Object.fromEntries(items.map((i) => [i.id, i.initialRating])),
    answered: {},
    score: 0,
    played: 0,
    streak: 0,
    bestStreak: 0,
  };
}

export function applyAnswer(state: GameState, item: GameItem, guess: 'real' | 'fake', now = Date.now()): { state: GameState; correct: boolean; expected: number; delta: number } {
  const correct = guess === item.label;
  const rImg = state.itemRatings[item.id] ?? item.initialRating;
  const u = updateRatings(state.userRating, rImg, correct);
  const streak = correct ? state.streak + 1 : 0;
  return {
    correct,
    expected: u.expected,
    delta: u.user - state.userRating,
    state: {
      ...state,
      userRating: u.user,
      itemRatings: { ...state.itemRatings, [item.id]: u.img },
      answered: { ...state.answered, [item.id]: now },
      score: state.score + (correct ? 1 : 0),
      played: state.played + 1,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
    },
  };
}

export function nextItem(state: GameState, items: GameItem[], excludeId?: string, rng: () => number = Math.random): GameItem | null {
  const pool = items.filter((i) => i.id !== excludeId);
  if (pool.length === 0) return items[0] ?? null;
  const unanswered = pool.filter((i) => !(i.id in state.answered));
  let candidates = unanswered;
  if (candidates.length === 0) {
    // everything seen: prefer the least recently answered half
    const sorted = [...pool].sort((a, b) => (state.answered[a.id] ?? 0) - (state.answered[b.id] ?? 0));
    candidates = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  }
  const scored = candidates.map((i) => ({ i, d: Math.abs((state.itemRatings[i.id] ?? i.initialRating) - state.userRating) + rng() * 1e-3 }));
  scored.sort((a, b) => a.d - b.d);
  return scored[0].i;
}
