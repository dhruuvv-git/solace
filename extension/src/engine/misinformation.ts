/**
 * Signal 6 - suspicious-forward checker.
 *
 *   p = σ(β0 + Σ βj · xj)
 *
 * Features (all transparent):
 *   x1 urgency      number of urgency / "forward this" phrases (capped)
 *   x2 caps         share of upper-case Latin letters (only if ≥ 20 letters)
 *   x3 exclaim      number of "!" (capped)
 *   x4 noSource     1 when the text has no link and no attribution phrase
 *
 * A high score means the message is written the way viral hoaxes usually
 * are. It does NOT mean the claim has been fact-checked or disproved.
 */
import { MISINFO } from '../shared/constants';
import type { FeatureContribution, MisinformationResult } from '../shared/types';
import { sigmoid, uid } from './math';

export const URGENCY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /forward (this|it)? ?(to|with) (all|everyone|every)/gi, label: 'forward to everyone' },
  { re: /share (this|it)? ?(with|to) (all|everyone|every)/gi, label: 'share with everyone' },
  { re: /(before|until) (it'?s|it is|they) (deleted|removed|taken down)/gi, label: 'before it is deleted' },
  { re: /\b(urgent|urgently)\b/gi, label: 'urgent' },
  { re: /\bbreaking( news)?\b/gi, label: 'breaking' },
  { re: /\b(must|please) (share|forward|read)\b/gi, label: 'must share' },
  { re: /\bas many (people|groups) as possible\b/gi, label: 'as many as possible' },
  { re: /\bdon'?t ignore\b/gi, label: "don't ignore" },
  { re: /\b(viral karo|sabko bhejo|sab ko bhejo|aage bhejo|share karo|forward karo|jaldi share|turant share)\b/gi, label: 'Hinglish: share/forward to all' },
  { re: /\b(jaldi|turant)\b/gi, label: 'Hinglish: hurry' },
  { re: /(सबको भेजें|सब को भेजें|आगे भेजें|शेयर करें|फॉरवर्ड करें|जल्दी|तुरंत|ज़रूर शेयर|जरूर शेयर)/g, label: 'Hindi: share/forward/hurry' },
];

export const SOURCE_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/i,
  /\bwww\.\S+\.\S+/i,
  /\baccording to\b/i,
  /\b(source|sources)\s*[:\-]/i,
  /\breported by\b/i,
  /\b(PIB|press information bureau|reuters|PTI|ANI|AP)\b/,
  /\bofficial (statement|notice|website)\b/i,
  /(स्रोत|के अनुसार)/,
];

export function extractFeatures(text: string) {
  const urgencyHits: string[] = [];
  for (const { re, label } of URGENCY_PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) for (const hit of m) urgencyHits.push(`${label}: “${hit.trim()}”`);
  }
  const letters = text.match(/[A-Za-z]/g) ?? [];
  const upper = text.match(/[A-Z]/g) ?? [];
  const capsRatio = letters.length >= MISINFO.capsMinLetters ? upper.length / letters.length : 0;
  const exclaim = (text.match(/[!！]/g) ?? []).length;
  const sourceFound = SOURCE_PATTERNS.some((r) => r.test(text));
  return {
    urgency: Math.min(urgencyHits.length, MISINFO.urgencyCap),
    urgencyHits,
    capsRatio,
    letterCount: letters.length,
    exclaim: Math.min(exclaim, MISINFO.exclaimCap),
    exclaimRaw: exclaim,
    noSource: sourceFound ? 0 : 1,
  };
}

export const CORRECTION = {
  en: "I'm not sure this is verified yet. Let's check a reliable source before forwarding it further.",
  hi: 'मुझे अभी इसकी पुष्टि नहीं मिली है। आगे भेजने से पहले किसी विश्वसनीय स्रोत से जाँच लेते हैं।',
} as const;

export function analyzeMisinformation(text: string): MisinformationResult {
  const f = extractFeatures(text);
  const features: FeatureContribution[] = [
    {
      id: 'urgency', label: 'Urgency / "forward to all" phrases', value: f.urgency, beta: MISINFO.betaUrgency,
      contribution: MISINFO.betaUrgency * f.urgency, evidence: f.urgencyHits.slice(0, 6),
    },
    {
      id: 'caps', label: 'Share of CAPITAL letters', value: f.capsRatio, beta: MISINFO.betaCaps,
      contribution: MISINFO.betaCaps * f.capsRatio,
      evidence: f.letterCount < MISINFO.capsMinLetters ? ['Too few Latin letters to judge capitalisation (feature set to 0).'] : [`${Math.round(f.capsRatio * 100)}% of letters are capitals.`],
    },
    {
      id: 'exclaim', label: 'Exclamation marks', value: f.exclaim, beta: MISINFO.betaExclaim,
      contribution: MISINFO.betaExclaim * f.exclaim,
      evidence: f.exclaimRaw > 0 ? [`${f.exclaimRaw} “!” found${f.exclaimRaw > MISINFO.exclaimCap ? ` (counted up to ${MISINFO.exclaimCap})` : ''}.`] : [],
    },
    {
      id: 'noSource', label: 'No source or link', value: f.noSource, beta: MISINFO.betaNoSource,
      contribution: MISINFO.betaNoSource * f.noSource,
      evidence: f.noSource ? ['No link, outlet or “according to …” attribution found.'] : ['A link or attribution is present (not checked for reliability).'],
    },
  ];
  const lo = MISINFO.beta0 + features.reduce((s, x) => s + x.contribution, 0);
  const p = sigmoid(lo);
  const level = p >= MISINFO.levels.high ? 'high' : p >= MISINFO.levels.medium ? 'medium' : 'low';
  const top = [...features].filter((x) => x.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 2).map((x) => x.label.toLowerCase());
  const explanation =
    level === 'high'
      ? `This message has many traits of viral hoaxes (${top.join(', ')}). Verify before forwarding.`
      : level === 'medium'
        ? `Some hoax-like traits (${top.join(', ') || 'few signals'}). Worth a quick check before forwarding.`
        : 'Few hoax-like writing traits. That does not make the claim true — it simply was not written like a typical hoax.';
  return {
    kind: 'misinformation',
    id: uid('misinfo'),
    timestamp: new Date().toISOString(),
    p,
    logit: lo,
    intercept: MISINFO.beta0,
    level,
    features,
    explanation,
    limitations: [
      'Judges writing style only. It does not fact-check the claim against any source.',
      'Coefficients are hand-set defaults, not trained on a labelled dataset.',
      'Real news can be urgent and hoaxes can be written calmly.',
    ],
    correction: { ...CORRECTION },
  };
}
