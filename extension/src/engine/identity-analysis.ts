/**
 * Shield 3 - Is it really them?
 *
 * Lookalike usernames:
 *   1. normalise: trim, drop leading "@", NFKC, lower-case, map common
 *      Cyrillic/Greek homoglyphs, then the confusable rules
 *      rn → m, vv → w, 0 → o, 1 → l
 *   2. sim = 1 − Levenshtein(a, b) / max(|a|, |b|)
 *   3. flag when sim ≥ 0.85 and the usernames are not identical
 *
 * Profile risk (logistic):
 *   p = σ(β0 + β1·new + β2·min(following/(followers+1), 10) + β3·fewPosts + β4·asksMoneyOrOtp)
 * Missing-data policy: an unavailable input contributes 0 (it is NOT assumed
 * risky or safe) and the result states how many of the 4 inputs were known.
 */
import { IDENTITY } from '../shared/constants';
import type { DiffOp, ProfileFeature, ProfileInputs, ProfileRiskResult, UsernameSimilarity } from '../shared/types';
import { sigmoid, uid } from './math';

const HOMOGLYPHS: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l',
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'τ': 't', 'κ': 'k',
};

export const CONFUSABLE_RULES: [RegExp, string, string][] = [
  [/rn/g, 'm', 'rn → m'],
  [/vv/g, 'w', 'vv → w'],
  [/0/g, 'o', '0 → o'],
  [/1/g, 'l', '1 → l'],
];

export function basicClean(s: string): string {
  return s.trim().replace(/^@+/, '').normalize('NFKC').toLowerCase();
}

export function normalizeUsername(s: string): { norm: string; applied: string[] } {
  let t = [...basicClean(s)].map((ch) => HOMOGLYPHS[ch] ?? ch).join('');
  const applied: string[] = [];
  if (t !== basicClean(s)) applied.push('look-alike letters from another alphabet');
  for (const [re, rep, label] of CONFUSABLE_RULES) {
    re.lastIndex = 0;
    if (re.test(t)) { applied.push(label); t = t.replace(re, rep); }
  }
  return { norm: t, applied };
}

/** Levenshtein distance over Unicode code points. */
export function levenshtein(a: string, b: string): number {
  const A = [...a], B = [...b];
  if (A.length === 0) return B.length;
  if (B.length === 0) return A.length;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

export function similarity(a: string, b: string): number {
  const m = Math.max([...a].length, [...b].length);
  if (m === 0) return 1; // two empty strings are identical
  return 1 - levenshtein(a, b) / m;
}

/** Character alignment for highlighting differences. */
export function diffChars(a: string, b: string): DiffOp[] {
  const A = [...a], B = [...b];
  const d: number[][] = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  }
  const ops: DiffOp[] = [];
  let i = A.length, j = B.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)) {
      ops.push({ op: A[i - 1] === B[j - 1] ? 'equal' : 'sub', a: A[i - 1], b: B[j - 1] }); i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'del', a: A[i - 1], b: '' }); i--; }
    else { ops.push({ op: 'ins', a: '', b: B[j - 1] }); j--; }
  }
  return ops.reverse();
}

export function compareUsernames(a: string, b: string, threshold: number = IDENTITY.simThreshold): UsernameSimilarity {
  const ca = basicClean(a), cb = basicClean(b);
  const na = normalizeUsername(a), nb = normalizeUsername(b);
  const identical = ca === cb && ca.length > 0;
  const empty = ca.length === 0 || cb.length === 0;
  const distance = levenshtein(na.norm, nb.norm);
  const sim = empty ? 0 : similarity(na.norm, nb.norm);
  const flagged = !identical && !empty && sim >= threshold;
  const substitutions = [...na.applied.map((x) => `${x} (first name)`), ...nb.applied.map((x) => `${x} (second name)`)];
  let explanation: string;
  if (empty) explanation = 'Enter two usernames to compare.';
  else if (identical) explanation = 'These are the same username, so this is not a lookalike.';
  else if (flagged) explanation = `These look very alike (similarity ${(sim * 100).toFixed(0)}%${substitutions.length ? `, after undoing ${[...new Set([...na.applied, ...nb.applied])].join(', ')}` : ''}). A lookalike can be used to impersonate someone — but it can also be a coincidence. Check through a channel you already trust.`;
  else explanation = `Similarity ${(sim * 100).toFixed(0)}% is below the ${(threshold * 100).toFixed(0)}% lookalike threshold.`;
  return { kind: 'username', a, b, normA: na.norm, normB: nb.norm, distance, sim, identical, flagged, threshold, diff: diffChars(ca, cb), substitutions, explanation };
}

export function profileRisk(inp: ProfileInputs): ProfileRiskResult {
  const P = IDENTITY.profile;
  const src = inp.source ?? {};
  const has = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'number' && !Number.isFinite(v));
  const ratioKnown = has(inp.followers) && has(inp.following) && (inp.followers as number) >= 0 && (inp.following as number) >= 0;
  const ratio = ratioKnown ? Math.min(P.ratioCap, (inp.following as number) / ((inp.followers as number) + 1)) : null;
  const fewPosts = has(inp.posts) ? ((inp.posts as number) < P.fewPostsBelow ? 1 : 0) : null;
  const features: ProfileFeature[] = [
    { id: 'newAccount', label: 'Account appears new', available: has(inp.newAccount), value: has(inp.newAccount) ? (inp.newAccount ? 1 : 0) : null, display: has(inp.newAccount) ? (inp.newAccount ? 'Yes' : 'No') : 'Unavailable (not visible)', beta: P.betaNew, contribution: 0, source: src.newAccount },
    { id: 'ratio', label: 'Following ÷ (followers + 1)', available: ratio !== null, value: ratio, display: ratio !== null ? `${inp.following} ÷ ${(inp.followers as number) + 1} = ${ratio.toFixed(2)}${ratio >= P.ratioCap ? ' (capped)' : ''}` : 'Unavailable', beta: P.betaRatio, contribution: 0, source: src.followers },
    { id: 'fewPosts', label: `Fewer than ${P.fewPostsBelow} posts`, available: fewPosts !== null, value: fewPosts, display: fewPosts !== null ? `${inp.posts} posts` : 'Unavailable', beta: P.betaFewPosts, contribution: 0, source: src.posts },
    { id: 'asksMoneyOrOtp', label: 'Asks for money, password or OTP', available: has(inp.asksMoneyOrOtp), value: has(inp.asksMoneyOrOtp) ? (inp.asksMoneyOrOtp ? 1 : 0) : null, display: has(inp.asksMoneyOrOtp) ? (inp.asksMoneyOrOtp ? 'Yes' : 'No') : 'Unknown', beta: P.betaMoney, contribution: 0, source: src.asksMoneyOrOtp },
  ];
  for (const f of features) f.contribution = f.available && f.value !== null ? f.beta * f.value : 0;
  const logit = P.beta0 + features.reduce((s, f) => s + f.contribution, 0);
  const p = sigmoid(logit);
  const availableCount = features.filter((f) => f.available).length;
  const level = p >= P.levels.high ? 'high' : p >= P.levels.medium ? 'medium' : 'low';
  const drivers = features.filter((f) => f.contribution > 0.2).map((f) => f.label.toLowerCase());
  const explanation =
    `${level === 'high' ? 'High' : level === 'medium' ? 'Some' : 'Low'} risk indicators (p = ${p.toFixed(2)})${drivers.length ? `, driven by: ${drivers.join(', ')}` : ''}. ` +
    `Based on ${availableCount} of 4 indicators. ` +
    (inp.asksMoneyOrOtp ? 'Genuine friends and banks never need your OTP. ' : '') +
    'This is a risk estimate, not proof that the account is fake.';
  return {
    kind: 'profile-risk', id: uid('profile'), timestamp: new Date().toISOString(), p, logit, level, features, availableCount, explanation,
    missingPolicy: 'Unavailable indicators contribute 0 to the score; they are not assumed risky or safe.',
  };
}
