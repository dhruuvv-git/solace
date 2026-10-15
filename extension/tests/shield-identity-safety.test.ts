import { describe, expect, it } from 'vitest';
import { compareUsernames, levenshtein, normalizeUsername, profileRisk, similarity } from '../src/engine/identity-analysis';
import { dHash, hammingDistance, isMatch } from '../src/engine/known-fakes';
import { actionPlan, analyzeThreat, countOtherSenderLines, levelForRisk } from '../src/engine/threat-analysis';
import { IDENTITY } from '../src/shared/constants';
import { decodeJpeg, readSample } from './helpers';

describe('usernames', () => {
  it('normalises confusables rn→m, vv→w, 0→o, 1→l', () => {
    expect(normalizeUsername('rahul_sharrna').norm).toBe('rahul_sharma');
    expect(normalizeUsername('@VVipro').norm).toBe('wipro');
    expect(normalizeUsername('r0hit').norm).toBe('rohit');
    expect(normalizeUsername('pa1').norm).toBe('pal');
    expect(normalizeUsername('rаhul').norm).toBe('rahul'); // Cyrillic а
  });

  it('Levenshtein distance is correct', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('नमस्ते', 'नमस्त')).toBe(1);
  });

  it('similarity = 1 - d / max length, with safe empty handling', () => {
    expect(similarity('abcd', 'abce')).toBeCloseTo(0.75);
    expect(similarity('', '')).toBe(1);
    expect(compareUsernames('', 'abc').flagged).toBe(false);
    expect(Number.isFinite(compareUsernames('', '').sim)).toBe(true);
  });

  it('identical usernames are not flagged; case/@ differences are identical', () => {
    expect(compareUsernames('priya.k', 'priya.k').flagged).toBe(false);
    expect(compareUsernames('@Priya.K', 'priya.k').identical).toBe(true);
  });

  it('flags lookalikes at the 0.85 boundary', () => {
    const r = compareUsernames('rahul_sharma', 'rahul_sharrna');
    expect(r.sim).toBe(1);
    expect(r.flagged).toBe(true);
    // 20 chars, 3 edits -> 0.85 exactly
    const a = 'abcdefghijklmnopqrst', b = 'abcdefghijklmnopqXYZ';
    expect(similarity(a, b)).toBeCloseTo(0.85, 10);
    expect(compareUsernames(a, b).flagged).toBe(true);
    const c = 'abcdefghijklmnopWXYZ'; // 4 edits -> 0.80
    expect(compareUsernames(a, c).flagged).toBe(false);
    expect(IDENTITY.simThreshold).toBe(0.85);
  });

  it('produces a character diff', () => {
    const r = compareUsernames('anita', 'anlta');
    expect(r.diff.filter((d) => d.op !== 'equal')).toHaveLength(1);
  });
});

describe('profile photos (shared dHash)', () => {
  it('same image matches, different image does not', () => {
    const a = dHash(decodeJpeg(readSample('scene1-original.jpg')));
    const b = dHash(decodeJpeg(readSample('scene1-edited.jpg')));
    const c = dHash(decodeJpeg(readSample('scene2-original.jpg')));
    expect(isMatch(hammingDistance(a, b))).toBe(true); // near-duplicate
    expect(isMatch(hammingDistance(a, c))).toBe(false);
  });
});

describe('profile risk', () => {
  it('missing data contributes 0 and is reported', () => {
    const r = profileRisk({});
    expect(r.availableCount).toBe(0);
    expect(r.logit).toBeCloseTo(IDENTITY.profile.beta0, 10);
    expect(r.features.every((f) => f.contribution === 0)).toBe(true);
    expect(r.missingPolicy).toMatch(/contribute 0/);
  });

  it('money / OTP requests raise the risk strongly', () => {
    const base = profileRisk({ followers: 100, following: 120, posts: 20, newAccount: false, asksMoneyOrOtp: false });
    const otp = profileRisk({ followers: 100, following: 120, posts: 20, newAccount: false, asksMoneyOrOtp: true });
    expect(otp.p - base.p).toBeGreaterThan(0.3);
    expect(otp.logit - base.logit).toBeCloseTo(IDENTITY.profile.betaMoney, 10);
  });

  it('ratio uses following/(followers+1), capped', () => {
    const r = profileRisk({ followers: 0, following: 5000 });
    expect(r.features.find((f) => f.id === 'ratio')!.value).toBe(IDENTITY.profile.ratioCap);
    const s = profileRisk({ followers: 9, following: 5 });
    expect(s.features.find((f) => f.id === 'ratio')!.value).toBeCloseTo(0.5);
  });
});

describe('threat analysis', () => {
  it('detects each category', () => {
    expect(analyzeThreat('Send 5000 or I will leak your photos to everyone').primary).toBe('sextortion');
    expect(analyzeThreat('Your KYC is pending, share the OTP to avoid account blocked').primary).toBe('scam');
    expect(analyzeThreat('I know where you live. I saw you at the bus stop').primary).toBe('stalking');
    expect(analyzeThreat('I will beat you up').primary).toBe('physical');
    expect(analyzeThreat('you are such a loser, nobody likes you').primary).toBe('abuse');
    expect(analyzeThreat('See you at practice tomorrow').primary).toBeNull();
  });

  it('severity mapping matches the specification', () => {
    expect(analyzeThreat('you are a loser').severity).toBe(2);
    expect(analyzeThreat('share the OTP now').severity).toBe(3);
    expect(analyzeThreat('I am watching you').severity).toBe(4);
    expect(analyzeThreat('photos will go viral').severity).toBe(4);
    expect(analyzeThreat('I will kill you').severity).toBe(5);
  });

  it('likelihood = 1 + distinct warning signs, capped at 5; risk in 1..25', () => {
    const r = analyzeThreat(
      'Pay ₹5000 by tonight or I will leak your photos to your parents and your school. I know your address.\nwhy aren\'t you replying',
      { patternRising: true },
    );
    expect(r.warningSigns.map((s) => s.id).sort()).toEqual(['deadline', 'moneyDemand', 'patternRising', 'personalDetails', 'repeatedContact', 'ultimatum']);
    expect(r.likelihood).toBe(5);
    expect(r.risk).toBe(20);
    expect(r.risk).toBeGreaterThanOrEqual(1);
    expect(r.risk).toBeLessThanOrEqual(25);
    const one = analyzeThreat('you are a loser');
    expect(one.likelihood).toBe(1);
    expect(one.risk).toBe(2);
  });

  it('one phrase counts each warning sign only once', () => {
    const r = analyzeThreat('send money send money send money or I leak your pics');
    expect(r.warningSigns.filter((s) => s.id === 'moneyDemand')).toHaveLength(1);
  });

  it('risk level boundaries', () => {
    expect(levelForRisk(0)).toBe('none');
    expect(levelForRisk(1)).toBe('low');
    expect(levelForRisk(4)).toBe('low');
    expect(levelForRisk(5)).toBe('medium');
    expect(levelForRisk(9)).toBe('medium');
    expect(levelForRisk(10)).toBe('high');
    expect(levelForRisk(16)).toBe('high');
    expect(levelForRisk(17)).toBe('emergency');
    expect(levelForRisk(25)).toBe('emergency');
  });

  it('immediate-danger override (English and Hindi/Hinglish)', () => {
    expect(analyzeThreat("I'm outside your house right now").level).toBe('emergency');
    expect(analyzeThreat('I will hurt you tonight').level).toBe('emergency');
    expect(analyzeThreat('tere ghar ke bahar khada hoon, maar dunga').level).toBe('emergency');
    expect(analyzeThreat('मैं तुम्हारे घर के बाहर खड़ा हूँ').level).toBe('emergency');
    expect(analyzeThreat('आज रात जान से मार दूंगा').level).toBe('emergency');
  });

  it('does not trigger emergency in unrelated contexts', () => {
    expect(analyzeThreat("Let's watch a movie tonight").emergency.triggered).toBe(false);
    expect(analyzeThreat('Your parcel was left outside your house').emergency.triggered).toBe(false);
    expect(analyzeThreat('main aa raha hoon party pe').emergency.triggered).toBe(false);
  });

  it('action plan matches the category', () => {
    expect(analyzeThreat('share the OTP').actionPlan.dont.join(' ')).toMatch(/OTP/);
    expect(analyzeThreat('I will leak your photos').actionPlan.dont.join(' ')).toMatch(/pay/i);
    const e = analyzeThreat("I'm outside your house");
    expect(e.actionPlan.contacts[0].value).toBe('112');
    expect(actionPlan('scam', false).contacts.map((c) => c.value)).toContain('1930');
  });

  it('user can correct the category', () => {
    const r = analyzeThreat('you are a loser', { overrideCategory: 'stalking' });
    expect(r.primary).toBe('stalking');
    expect(r.severity).toBe(4);
    expect(r.categoryOverridden).toBe(true);
  });

  it('counts repeated lines from one sender in pasted chats', () => {
    const chat = Array.from({ length: 6 }, (_, i) => `[10:2${i}, 15/10/2026] Unknown: msg ${i}`).join('\n') + '\n[10:30, 15/10/2026] You: stop';
    expect(countOtherSenderLines(chat)).toBe(6);
    expect(analyzeThreat(`${chat}\nI will leak your pics`).warningSigns.some((s) => s.id === 'repeatedContact')).toBe(true);
  });
});

describe('emergency vs deadline', () => {
  it('"tonight" in blackmail is a deadline, not an emergency', () => {
    const r = analyzeThreat('Send ₹5000 by tonight or I will leak your photos to your parents. I know your school.');
    expect(r.emergency.triggered).toBe(false);
    expect(r.warningSigns.some((s) => s.id === 'deadline')).toBe(true);
    expect(r.level).toBe('emergency'); // by score: 4 × 5 = 20, without the immediate-danger override
    expect(r.risk).toBe(20);
  });
});

describe('abuse vs serious threats', () => {
  it('detects disguised swearing and sexual-violence threats', () => {
    const r = analyzeThreat('ill fuck ur entire family');
    expect(r.primary).toBe('physical');
    expect(r.sexual).toBe(true);
    expect(r.level).toBe('high');
    expect(r.guidance!.laws.map((l) => l.section)).toContain('351(3)');
    expect(r.abuse).toBeNull();
    expect(analyzeThreat('teri maa ko chod dunga').primary).toBe('physical');
  });
  it('ordinary abuse gets practical help and NO legal sections', () => {
    for (const t of ['fuck you bitch', 'f*ck off loser', 'you are such a madarchod', 'chutiya hai tu']) {
      const r = analyzeThreat(t);
      expect(r.primary).toBe('abuse');
      expect(r.guidance).toBeNull();
      expect(r.abuse!.options.length).toBeGreaterThan(2);
    }
  });
  it('casual swearing that targets nobody is not abuse', () => {
    expect(analyzeThreat('This movie was fucking amazing').primary).toBeNull();
  });
  it('sextortion is never shown below high and gets legal + technical analysis', () => {
    const r = analyzeThreat('send nudes or ill leak ur pics to everyone. +92 300 1234567', { anonymous: true });
    expect(r.primary).toBe('sextortion');
    expect(['high', 'emergency']).toContain(r.level);
    const sections = r.guidance!.laws.map((l) => l.section);
    expect(sections).toEqual(expect.arrayContaining(['308', '66E', '351(4)']));
    expect(r.guidance!.technical.some((t) => /Foreign number/.test(t.title))).toBe(true);
    expect(r.guidance!.report.some((x) => /stopncii/i.test(x.href))).toBe(true);
  });
  it('minors get POCSO and Childline', () => {
    const r = analyzeThreat('i will leak your photos', { minor: true });
    expect(r.guidance!.laws.some((l) => l.law.startsWith('POCSO'))).toBe(true);
    expect(r.guidance!.report[0].href).toBe('tel:1098');
  });
});
