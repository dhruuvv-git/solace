/**
 * Shield 2 - hurtfulness scoring.
 *
 *   S = Σ_k w_k · m_k          Toxicity = 1 − e^(−S)
 *
 * m_k is the product of the modifiers that apply to match k, each applied
 * AT MOST ONCE per match:
 *   aimed at "you" (within 4 words)          × 1.5
 *   negated ("not stupid", within 3 before)  × 0.3
 *   emphasis (mostly CAPS, or "!!")           × 1.2
 *   reported speech / asking about abuse      × 0.4   (Solace addition,
 *        so "someone called me stupid, what do I do?" is not flagged as bullying)
 * Overlapping matches are resolved longest-phrase-first so one span is
 * never counted twice.
 */
import { TOXICITY } from '../shared/constants';
import type { HarmCategory, LexiconEntry, ToxicityLevel, ToxicityMatch, ToxicityResult } from '../shared/types';
import { LEXICON, NEGATION_WORDS, REPORTED_SPEECH, TARGET_WORDS } from './data/lexicon';
import { uid } from './math';

const B = '[^\\p{L}\\p{M}\\p{N}]';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Compiled { entry: LexiconEntry; re: RegExp }

const cache = new WeakMap<LexiconEntry[], Compiled[]>();
function compile(lex: LexiconEntry[]): Compiled[] {
  let c = cache.get(lex);
  if (!c) {
    c = [...lex]
      .sort((a, b) => b.term.length - a.term.length)
      .map((entry) => ({ entry, re: new RegExp(`(?<=^|${B})${escapeRe(entry.term.toLowerCase()).replace(/ /g, '\\s+')}(?=$|${B})`, 'gu') }));
    cache.set(lex, c);
  }
  return c;
}

/**
 * Undo common ways people disguise swear words and threats:
 * f*ck / f**k / fu*k / fck / fuk / phuck → fuck, sh*t → shit, b!tch → bitch,
 * "ill fuck / ill kill" → "i'll …", mf / mofo → motherfucker.
 */
export function deobfuscate(s: string): string {
  return s
    .replace(/\bf[*#@!._-]{1,3}c?k/g, 'fuck')
    .replace(/\bfu[*#@!._-]{1,2}k/g, 'fuck')
    .replace(/\b(fck|fuk|fuq|phuck|phuk|fcuk|fawk)(ing|in|er|ed)?\b/g, 'fuck$2')
    .replace(/\bf(king|kin)\b/g, 'fucking')
    .replace(/\bsh[*#@!]t\b/g, 'shit')
    .replace(/\bb[*#@!1i]tch/g, 'bitch')
    .replace(/\b(mf|mofo|mfer)\b/g, 'motherfucker')
    .replace(/\b(ill|il)\s+(fuck|kill|rape|beat|hurt|leak|post|share|send|find|come|make|destroy|expose|ruin|break|slap|show|tell|upload)\b/g, "i'll $2")
    .replace(/\b(imma|ima|i'?m gonna|im gonna)\s+/g, "i'll ");
}

/** Lower-case, NFC, collapse letter runs of 3+ ("stuuupid" → "stupid"), undo disguised spellings. */
export function normalizeText(s: string): string {
  return deobfuscate(s.normalize('NFC').toLowerCase().replace(/([a-z])\1{2,}/g, '$1').replace(/[’‘]/g, "'"));
}

interface Tok { t: string; start: number; end: number }
function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /[\p{L}\p{M}\p{N}']+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push({ t: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

export function hasEmphasis(original: string): boolean {
  if (/!{2,}|！{2,}/.test(original)) return true;
  const letters = original.match(/[A-Za-z]/g) ?? [];
  if (letters.length < 4) return false;
  const upper = original.match(/[A-Z]/g) ?? [];
  return upper.length / letters.length > 0.7;
}

export function isReportedSpeech(original: string): boolean {
  return REPORTED_SPEECH.some((r) => r.test(original));
}

const CATEGORY_RANK: HarmCategory[] = ['threat', 'sexual-harassment', 'identity-hate', 'body-shaming', 'insult', 'profanity'];

const TEMPLATES: Record<HarmCategory, string> = {
  insult: "I'm really upset about this. Can we talk about it calmly?",
  profanity: "I'm really angry about this, but I'd rather talk it out than swear at you.",
  'body-shaming': "Let's not comment on how anyone looks.",
  threat: "I'm very angry right now and need some time before we talk.",
  'identity-hate': "I disagree with you, but I don't want to attack anyone for who they are.",
  'sexual-harassment': 'Consider not sending this. Unwanted sexual messages hurt people and can be illegal.',
};

export function levelFor(tox: number): ToxicityLevel {
  const L = TOXICITY.levels;
  return tox >= L.severe ? 'severe' : tox >= L.hurtful ? 'hurtful' : tox >= L.mild ? 'mild' : 'none';
}

export function analyzeToxicity(text: string, lexicon: LexiconEntry[] = LEXICON): ToxicityResult {
  const norm = normalizeText(text);
  const toks = tokenize(norm);
  const emphasis = hasEmphasis(text);
  const reported = isReportedSpeech(text);
  const claimed: [number, number][] = [];
  const matches: ToxicityMatch[] = [];
  const M = TOXICITY.modifiers;

  for (const { entry, re } of compile(lexicon)) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm))) {
      const s = m.index, e = s + m[0].length;
      if (claimed.some(([a, b]) => s < b && e > a)) continue;
      claimed.push([s, e]);
      const ti0 = toks.findIndex((t) => t.end > s);
      let ti1 = ti0;
      while (ti1 + 1 < toks.length && toks[ti1 + 1].start < e) ti1++;
      const near = toks.slice(Math.max(0, ti0 - TOXICITY.targetWindow), Math.min(toks.length, ti1 + 1 + TOXICITY.targetWindow));
      const before = toks.slice(Math.max(0, ti0 - TOXICITY.negationWindow), Math.max(0, ti0));
      const phraseHasYou = /\byou\b|\byour\b/.test(entry.term);
      const targeted = phraseHasYou || near.some((t) => TARGET_WORDS.has(t.t));
      const negated = before.some((t) => NEGATION_WORDS.has(t.t));
      let mult = 1;
      if (targeted && !phraseHasYou) mult *= M.targeted; // phrases that already contain "you" are weighted for it
      if (!targeted && entry.category === 'profanity') mult *= M.untargetedProfanity;
      if (negated) mult *= M.negated;
      if (emphasis) mult *= M.emphasis;
      if (reported) mult *= M.reported;
      matches.push({
        term: entry.term, matchedText: m[0], index: s, category: entry.category, weight: entry.weight,
        modifiers: { targeted, negated, emphasis, reported }, multiplier: mult, contribution: entry.weight * mult,
      });
    }
  }
  matches.sort((a, b) => a.index - b.index);
  const S = matches.reduce((a, x) => a + x.contribution, 0);
  const toxicity = 1 - Math.exp(-S);
  const level = levelFor(toxicity);
  const categories = CATEGORY_RANK.filter((c) => matches.some((x) => x.category === c && x.contribution > 0.05));
  const primaryCategory = categories[0] ?? null;

  let suggestion: string | null = null;
  if (level !== 'none' && primaryCategory) {
    let soft = norm;
    for (const x of [...matches].sort((a, b) => b.index - a.index)) {
      const entry = lexicon.find((l) => l.term === x.term);
      soft = soft.slice(0, x.index) + (entry?.softer ?? '') + soft.slice(x.index + x.matchedText.length);
    }
    soft = soft.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/!{2,}/g, '!').trim();
    const stillBad = analyzeToxicityScoreOnly(soft, lexicon) >= TOXICITY.levels.mild;
    const words = soft.split(/\s+/).filter(Boolean).length;
    // Only offer an edited version when every hurtful phrase has a gentler replacement;
    // deleting words usually leaves broken sentences, so otherwise use a calm template.
    const allSoftened = matches.filter((x) => x.contribution > 0.05).every((x) => lexicon.find((l) => l.term === x.term)?.softer);
    suggestion = allSoftened && !stillBad && words >= 3 && primaryCategory !== 'sexual-harassment' && primaryCategory !== 'threat'
      ? soft.charAt(0).toUpperCase() + soft.slice(1)
      : TEMPLATES[primaryCategory];
  }

  const explanation =
    level === 'none'
      ? matches.length
        ? `Possible harmful words were found but softened by context (${describeModifiers(matches)}), so the score stays low.`
        : 'No hurtful language from the local word list was found.'
      : `${capital(level)} language: ${matches.filter((x) => x.contribution > 0.05).slice(0, 4).map((x) => `“${x.matchedText}” (${x.category.replace('-', ' ')})`).join(', ')}.${reported ? ' It looks like you are reporting or asking about this, so the score was reduced.' : ''}`;

  return {
    kind: 'toxicity',
    id: uid('tox'),
    timestamp: new Date().toISOString(),
    S, toxicity, level, categories, primaryCategory, matches, reportedSpeech: reported, suggestion, explanation,
    limitations: [
      'Uses a local word list: it misses new slang, sarcasm and coded insults, and can misread jokes between friends.',
      'One hurtful message is not bullying. Bullying is repeated targeting (see Pattern Detector).',
    ],
  };
}

function analyzeToxicityScoreOnly(text: string, lex: LexiconEntry[]): number {
  const norm = normalizeText(text);
  let S = 0;
  for (const { entry, re } of compile(lex)) {
    re.lastIndex = 0;
    if (re.test(norm)) S += entry.weight;
  }
  return 1 - Math.exp(-S);
}

function describeModifiers(ms: ToxicityMatch[]): string {
  const parts = new Set<string>();
  for (const m of ms) {
    if (m.modifiers.negated) parts.add('negation');
    if (m.modifiers.reported) parts.add('reporting/asking context');
  }
  return [...parts].join(', ') || 'low weights';
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
