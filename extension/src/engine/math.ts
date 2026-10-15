/** Small, defensive numeric helpers shared by every model. */

export const EPS = 1e-9;

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return x > 0 ? hi : lo;
  return Math.min(hi, Math.max(lo, x));
}

/** Logistic sigmoid, numerically stable for large |x|. */
export function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** log(p/(1-p)) with p clamped away from 0 and 1. */
export function logit(p: number): number {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
}

/** log of a positive number; returns null instead of -Infinity/NaN. */
export function safeLog(x: number): number | null {
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.log(x);
}

export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (Number.isFinite(v)) {
      s += v;
      n++;
    }
  }
  return n === 0 ? NaN : s / n;
}

/** Population standard deviation over finite values. */
export function std(xs: ArrayLike<number>, m = mean(xs)): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (Number.isFinite(v)) {
      s += (v - m) * (v - m);
      n++;
    }
  }
  return n === 0 ? NaN : Math.sqrt(s / n);
}

/** Coefficient of variation sigma/mu; null when mean is ~0 or undefined. */
export function coefficientOfVariation(xs: ArrayLike<number>): { mean: number; std: number; cv: number | null } {
  const m = mean(xs);
  const s = std(xs, m);
  if (!Number.isFinite(m) || Math.abs(m) < EPS || !Number.isFinite(s)) return { mean: m, std: s, cv: null };
  return { mean: m, std: s, cv: s / m };
}

/**
 * Ordinary least squares y = a + b x.
 * Returns null when fewer than 2 points or x has no spread.
 */
export function linearRegression(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx < EPS) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy < EPS ? 1 : (sxy * sxy) / (sxx * syy);
  return { intercept, slope, r2 };
}

export function round(x: number, digits = 2): number {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Format for UI; never prints NaN/Infinity. */
export function fmt(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  const rnd = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${rnd}`;
}

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}
