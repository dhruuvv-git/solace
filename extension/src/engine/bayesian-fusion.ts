/**
 * Bayesian evidence fusion (naive-Bayes log-odds form).
 *
 *   L = log(π / (1 − π)) + Σ w_i · log LR_i
 *   P(fake) = 1 / (1 + e^(−L))
 *
 * Unavailable signals (logLR === null) are skipped entirely — they are never
 * replaced with a made-up value. Each log LR is clamped to ±maxAbsLogLR.
 *
 * Verdict (binary): P ≥ t → "likely fake", otherwise "likely real".
 * t defaults to the cost rule t = C_FP / (C_FP + C_FN) = 0.5 (equal costs).
 * Confidence = distance from 0.5: |P − 0.5| ≥ 0.30 high, ≥ 0.15 medium, else low,
 * so a verdict reached on thin evidence is clearly labelled as such.
 */
import { FUSION } from '../shared/constants';
import type { Confidence, FusionResult, RealVerdict, SignalId, SignalStatus } from '../shared/types';
import { clamp, logit, sigmoid } from './math';

export interface FusionInput {
  id: SignalId;
  name: string;
  logLR: number | null;
  weight: number;
}

export interface FusionOptions {
  prior?: number;
  threshold?: number;
  costFalsePositive?: number;
  costFalseNegative?: number;
}

export function costThreshold(cFP: number, cFN: number): number {
  if (!(cFP >= 0) || !(cFN >= 0) || cFP + cFN <= 0) return 0.5;
  return cFP / (cFP + cFN);
}

export function decideVerdict(p: number, threshold: number = FUSION.threshold): RealVerdict {
  return p >= threshold ? 'likely-fake' : 'likely-real';
}

export function confidenceFor(p: number): Confidence {
  const d = Math.abs(p - 0.5);
  return d >= FUSION.confidence.high ? 'high' : d >= FUSION.confidence.medium ? 'medium' : 'low';
}

export function statusFromContribution(c: number | null): SignalStatus {
  if (c === null || !Number.isFinite(c)) return 'unavailable';
  if (c > FUSION.neutralBand) return 'suspicious';
  if (c < -FUSION.neutralBand) return 'supports-real';
  return 'neutral';
}

export function fuse(inputs: FusionInput[], opts: FusionOptions = {}): FusionResult {
  const prior = clamp(opts.prior ?? FUSION.prior, 0.01, 0.99);
  const threshold = clamp(opts.threshold ?? FUSION.threshold, 0.05, 0.95);
  const priorLogOdds = logit(prior);

  const terms = [] as FusionResult['terms'];
  let L = priorLogOdds;
  for (const s of inputs) {
    if (s.logLR === null || !Number.isFinite(s.logLR) || !Number.isFinite(s.weight)) continue;
    const c = s.weight * clamp(s.logLR, -FUSION.maxAbsLogLR, FUSION.maxAbsLogLR);
    terms.push({ id: s.id, name: s.name, contribution: c });
    L += c;
  }
  const pFake = clamp(sigmoid(L), 0, 1);
  const verdict = decideVerdict(pFake, threshold);
  const confidence = confidenceFor(pFake);
  const evidenceStrength = terms.reduce((a, t) => a + Math.abs(t.contribution), 0);

  const reasons: string[] = [];
  const sorted = [...terms].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  for (const t of sorted.slice(0, 3)) {
    if (Math.abs(t.contribution) <= FUSION.neutralBand) continue;
    reasons.push(`${t.name} pushes toward ${t.contribution > 0 ? '“fake”' : '“real”'} (${t.contribution > 0 ? '+' : ''}${t.contribution.toFixed(2)}).`);
  }
  if (reasons.length === 0 && terms.length > 0) reasons.push('Every signal was close to neutral, so this verdict is a weak lean, not a finding.');
  if (terms.length === 0) reasons.push('No signal could run on this input.');

  return {
    prior, priorLogOdds, terms, logOdds: L, pFake, verdict, confidence, threshold,
    costThreshold: costThreshold(opts.costFalsePositive ?? FUSION.costFalsePositive, opts.costFalseNegative ?? FUSION.costFalseNegative),
    availableCount: terms.length, evidenceStrength, reasons,
  };
}
