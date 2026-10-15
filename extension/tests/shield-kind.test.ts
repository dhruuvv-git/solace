import { describe, expect, it } from 'vitest';
import { addEvent, assessPattern, decay, escalationSlope } from '../src/engine/bullying-patterns';
import { analyzeToxicity, levelFor } from '../src/engine/toxicity';
import { PATTERN, TOXICITY } from '../src/shared/constants';
import type { SenderPattern } from '../src/shared/types';

const lex = (term: string, weight = 0.6) => [{ term, category: 'insult' as const, weight, lang: 'en' as const }];

describe('hurtfulness score', () => {
  it('follows S = sum(w*m) and Toxicity = 1 - e^-S', () => {
    const r = analyzeToxicity('he is stupid', lex('stupid', 0.6));
    expect(r.S).toBeCloseTo(0.6, 10);
    expect(r.toxicity).toBeCloseTo(1 - Math.exp(-0.6), 10);
  });

  it('direct targeting multiplies by 1.5', () => {
    const r = analyzeToxicity('you are stupid', lex('stupid', 0.6));
    expect(r.matches[0].modifiers.targeted).toBe(true);
    expect(r.S).toBeCloseTo(0.6 * TOXICITY.modifiers.targeted, 10);
  });

  it('negation multiplies by 0.3', () => {
    const r = analyzeToxicity('he is not stupid', lex('stupid', 0.6));
    expect(r.matches[0].modifiers.negated).toBe(true);
    expect(r.S).toBeCloseTo(0.6 * 0.3, 10);
    expect(r.level).toBe('none');
  });

  it('emphasis (caps or !!) multiplies by 1.2 exactly once per match', () => {
    const r = analyzeToxicity('HE IS STUPID!!!', lex('stupid', 0.6));
    expect(r.matches[0].modifiers.emphasis).toBe(true);
    expect(r.S).toBeCloseTo(0.6 * 1.2, 10);
    const both = analyzeToxicity('YOU ARE STUPID!!', lex('stupid', 0.6));
    expect(both.S).toBeCloseTo(0.6 * 1.5 * 1.2, 10);
  });

  it('modifiers combine multiplicatively and each applies once', () => {
    const r = analyzeToxicity("YOU'RE NOT STUPID!!", lex('stupid', 1));
    expect(r.matches[0].multiplier).toBeCloseTo(1.5 * 0.3 * 1.2, 10);
  });

  it('identifies categories with the default lexicon', () => {
    expect(analyzeToxicity('you are so ugly').categories).toContain('body-shaming');
    expect(analyzeToxicity('I will kill you').primaryCategory).toBe('threat');
    expect(analyzeToxicity('go back to your country').categories).toContain('identity-hate');
    expect(analyzeToxicity('send nudes now').categories).toContain('sexual-harassment');
    expect(analyzeToxicity('you idiot').categories).toContain('insult');
  });

  it('handles Hindi and Hinglish', () => {
    expect(analyzeToxicity('tu pagal hai kya, bewakoof').level).not.toBe('none');
    expect(analyzeToxicity('तुम बेवकूफ हो').level).not.toBe('none');
    expect(analyzeToxicity('tujhe maar dunga').primaryCategory).toBe('threat');
  });

  it('harmless sentences are not flagged', () => {
    for (const t of ['Happy birthday! See you tomorrow', 'Can you send the notes for maths?', 'The stupidity tax joke was funny', 'Classic movie night at 7']) {
      expect(analyzeToxicity(t).level).toBe('none');
    }
  });

  it('reported speech / asking for help is reduced', () => {
    const a = analyzeToxicity('you are a loser');
    const b = analyzeToxicity('Someone called me a loser, how should I respond?');
    expect(b.reportedSpeech).toBe(true);
    expect(b.toxicity).toBeLessThan(a.toxicity);
    expect(b.level).toBe('none');
  });

  it('overlapping phrases are counted once', () => {
    const r = analyzeToxicity('fat pig');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].term).toBe('fat pig');
  });

  it('offers a kinder alternative but never for threats verbatim', () => {
    const r = analyzeToxicity('shut up you idiot, the plan is bad');
    expect(r.suggestion).toBeTruthy();
    expect(r.suggestion!.toLowerCase()).not.toContain('idiot');
    expect(analyzeToxicity('chup kar pagal').suggestion).toBe('Please ruko yaar');
    const t = analyzeToxicity('I will kill you');
    expect(t.suggestion).not.toMatch(/kill/);
  });

  it('level boundaries', () => {
    expect(levelFor(0.249)).toBe('none');
    expect(levelFor(0.25)).toBe('mild');
    expect(levelFor(0.5)).toBe('hurtful');
    expect(levelFor(0.8)).toBe('severe');
  });
});

describe('pattern detector', () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 0, 1);
  const ev = (i: number, sev: number, dayOffset: number) => ({ ts: t0 + dayOffset * DAY, severity: sev, category: 'insult' as const, msgHash: `h${i}` });

  it('decays by lambda per day', () => {
    expect(decay(1, t0, t0 + DAY)).toBeCloseTo(PATTERN.lambda, 10);
    expect(decay(2, t0, t0 + 3 * DAY)).toBeCloseTo(2 * PATTERN.lambda ** 3, 10);
    expect(decay(1, t0 + DAY, t0)).toBe(1); // never negative time
  });

  it('S <- lambda^dt * S + s_new, and one message never alerts', () => {
    let p: SenderPattern | null = null;
    p = addEvent(p, 'k', 'Ravi', 'whatsapp', ev(1, 1, 0)).pattern;
    expect(assessPattern(p, t0).alert).toBe(false);
    p = addEvent(p, 'k', 'Ravi', 'whatsapp', ev(2, 0.9, 1)).pattern;
    expect(p.score).toBeCloseTo(1 * 0.8 + 0.9, 10);
    p = addEvent(p, 'k', 'Ravi', 'whatsapp', ev(3, 0.9, 1.5)).pattern;
    const a = assessPattern(p, t0 + 1.5 * DAY);
    expect(a.score).toBeGreaterThan(PATTERN.theta);
    expect(a.alert).toBe(true);
  });

  it('ignores duplicate messages and low-severity messages', () => {
    let p = addEvent(null, 'k', 'R', 'web', ev(1, 0.9, 0)).pattern;
    const dup = addEvent(p, 'k', 'R', 'web', ev(1, 0.9, 0.1));
    expect(dup.added).toBe(false);
    p = dup.pattern;
    expect(addEvent(p, 'k', 'R', 'web', ev(9, 0.1, 0.2)).added).toBe(false);
  });

  it('escalation slope uses linear regression on severity over time', () => {
    const events = [ev(1, 0.3, 0), ev(2, 0.5, 1), ev(3, 0.7, 2), ev(4, 0.9, 3)];
    expect(escalationSlope(events)).toBeCloseTo(0.2, 10);
    expect(escalationSlope(events.slice(0, 2))).toBeNull();
    let p: SenderPattern | null = null;
    for (const e of events) p = addEvent(p, 'k', 'R', 'web', e).pattern;
    expect(assessPattern(p, t0 + 3 * DAY).escalating).toBe(true);
  });

  it('no history → no alert', () => {
    expect(assessPattern(null).alert).toBe(false);
  });
});
