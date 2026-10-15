/**
 * Shield 4 - Safety Copilot (local, rule-based).
 *
 *   Risk = Likelihood × Severity        both 1..5 → Risk 1..25
 *   Severity: abuse 2, scam 3, stalking 4, sextortion 4, physical 5
 *   Likelihood = min(5, 1 + number of DISTINCT warning signs)
 *   Levels: 1–4 low, 5–9 medium, 10–16 high, 17–25 emergency
 *
 * Immediate-danger override: a stated physical presence near the user
 * ("I'm outside your house") or a time-imminent physical/stalking threat
 * physical threat ("I will hurt you tonight", "aaj raat") sets the level to
 * emergency regardless of the score. For blackmail or scams, "tonight" is
 * treated as a deadline (a warning sign), not as immediate physical danger.
 *
 * If no threat category is detected, severity/risk are 0 and level is "none".
 */
import { HELP, THREAT } from '../shared/constants';
import type { ActionPlan, RiskLevel, ThreatAssessment, ThreatCategory, ThreatCategoryHit, WarningSign, WarningSignId } from '../shared/types';
import { uid } from './math';
import { abuseHelp, legalGuidance } from './legal-guidance';
import { analyzeToxicity, deobfuscate } from './toxicity';

type Rx = RegExp;

export const CATEGORY_PATTERNS: Record<Exclude<ThreatCategory, 'abuse'>, Rx[]> = {
  sextortion: [
    /\b(leak|share|post|send|upload|viral|forward|show|expose)\w*\b[^.\n]{0,40}\b(photos?|pics?|pictures?|videos?|nudes?|private|chats?|screenshots?|images?)\b/i,
    /\b(photos?|pics?|pictures?|videos?|nudes?|images?)\b[^.\n]{0,40}\b(leak|viral|go public|share|post|upload|everyone|your (family|parents|friends|school|college))/i,
    /\b(photo|pic|video|tasveer|tasvir|chat)\w*\b[^.\n]{0,30}\b(viral|leak|bhej dunga|bhej dungi|daal dunga|dikha dunga|post kar)/i,
    /\b(viral kar|leak kar)\w*/i,
    /(फोटो|तस्वीर|वीडियो|चैट)[^।\n]{0,30}(वायरल|लीक|भेज दूंगा|भेज दूँगा|डाल दूंगा)/,
  ],
  scam: [
    /\b(share|send|tell|give|forward)\b[^.\n]{0,25}\b(otp|one[- ]time password|pin|cvv|password)\b/i,
    /\b(otp|cvv|pin)\b[^.\n]{0,25}\b(share|send|tell|batao|bhejo|do)\b/i,
    /\b(kyc|account (will be |is )?(blocked|suspended|closed|frozen)|lottery|you (have )?won|prize money|refund|parcel (is )?(held|seized)|customs duty|electricity (bill|connection)|digital arrest)\b/i,
    /\b(upi|gpay|google pay|paytm|phonepe)\b[^.\n]{0,30}\b(send|pay|transfer|scan)\b/i,
    /\b(otp batao|otp bhejo|inaam|lottery lagi)\b/i,
    /(ओटीपी|लॉटरी|इनाम|खाता बंद|केवाईसी)/,
  ],
  stalking: [
    /\bi know where you (live|stay|study|work|are)\b/i,
    /\b(i'?m|i am|i'?ve been|been) (watching|following|tracking) you\b/i,
    /\bi (saw|see|seen) you (at|in|with|today|yesterday|near)\b/i,
    /\byou can'?t hide\b/i,
    /\bi know your (address|school|college|house|home|office|routine)\b/i,
    /\b(tera|tumhara|teri|tumhari) (ghar|address|school|college|office)\b[^.\n]{0,15}\b(pata|maloom) hai\b/i,
    /\b(tujhe|tumhe) dekh (raha|rahi) (hoon|hu|hun)\b/i,
    /\b(peecha|picha|peechha) kar\w*/i,
    /(मुझे पता है तुम कहाँ|तेरा घर पता|तुम्हारा घर पता|तुझे देख रहा|पीछा कर)/,
  ],
  physical: [
    /\b(kill|murder|stab|shoot|beat|hurt|attack|slap|break)\b[^.\n]{0,20}\b(you|u|your)\b/i,
    /\b(throw|use) acid\b|\bacid attack\b/i,
    /\byou('re| are) dead\b/i,
    /\b(maar dunga|maar dungi|maar daalunga|maar dalunga|jaan se maar|tod dunga|kaat dunga|acid daal)\w*/i,
    /(मार दूंगा|मार दूँगा|मार डालूंगा|मार डालूँगा|जान से मार|तेजाब|तेज़ाब)/,
  ],
};

/** Threats of sexual violence (counted as physical threats, severity 5). Run on de-obfuscated text. */
export const SEXUAL_THREAT: Rx[] = [
  /\b(i'?ll|i will|we'?ll|we will|gonna|going to)\s+(fuck|rape|molest)\b[^.\n]{0,30}\b(you|u|ur|your|ya|ur?\s+\w+)\b/i,
  /\b(rape|molest)\b[^.\n]{0,25}\b(you|u|ur|your)\b/i,
  /\b(you|u|ur|your)\b[^.\n]{0,25}\b(will|gonna|going to) (get|be) (raped|molested)\b/i,
  /\b(teri|tumhari|tere|tumhare)\s+(maa|mummy|behen|behan|bahan|family|ghar\s?wal\w*|biwi|gf)\s+(ko|ki)\s+(chod|pel|utha|rape)\w*\s*(dunga|denge|dungi|lunga|lenge)/i,
  /\b(tujhe|tumhe)\s+(chod|pel)\s*(dunga|denge|dungi)/i,
  /(बलात्कार|रेप कर)/,
];

export const WARNING_PATTERNS: Record<Exclude<WarningSignId, 'repeatedContact' | 'patternRising'>, Rx[]> = {
  ultimatum: [
    /\b(or|else)\s+(i'?ll|i will|we'?ll|we will)\b/i,
    /\bif\s+(you|u)\s+(don'?t|do not|dont|won'?t)\b[^.\n]{0,40}\b(i'?ll|i will)\b/i,
    /\b(warna|varna|nahi to|nahin to|or else|otherwise)\b/i,
    /(वरना|नहीं तो)/,
  ],
  personalDetails: [
    /\b(your|ur)\s+(entire\s+|whole\s+|little\s+)?(address|house|home|school|college|office|hostel|mom|mother|dad|father|sister|brother|parents|family|daughter|son)\b/i,
    /\b(tera|teri|tere|tumhara|tumhari|tumhare)\s+(ghar|address|school|college|maa|mummy|papa|behen|bhai|parivaar|family)\b/i,
    /\bi know where you (live|stay|study)\b/i,
    /(तेरा घर|तेरे घर|तुम्हारा घर|तुम्हारे घर|तुम्हारा स्कूल|तेरी माँ|तुम्हारी माँ|तेरी बहन)/,
  ],
  deadline: [
    /\b(within|in|next) \d+\s*(hours?|hrs?|minutes?|mins?|days?)\b/i,
    /\b(by|before) (tonight|tomorrow|today|morning|evening|midnight|\d{1,2}\s*(am|pm))\b/i,
    /\b(last chance|deadline)\b/i,
    /\b(kal tak|aaj raat tak)\b|\bghante (mein|me)\b/i,
    /(कल तक|आज रात तक|घंटे में)/,
  ],
  moneyDemand: [
    /(₹\s?\d|\brs\.?\s?\d|\binr\s?\d|\b\d+\s?(rupees|rs)\b)/i,
    /\b(send|pay|transfer|give)\b[^.\n]{0,20}\b(money|cash|amount|payment|\d{3,})\b/i,
    /\b(upi|gpay|paytm|phonepe)\b/i,
    /\b(paise|paisa|rupaye|rupay)\b/i,
    /(पैसे|रुपये|रुपए)/,
  ],
};

const REPEATED_PHRASES = /\b(why (are|r) (you|u) not (replying|answering)|why aren'?t you (replying|answering)|answer me|reply (me|now)|pick up (the|my) (phone|call)|jawab de|reply kar|phone utha)\b/i;

const PRESENCE = [
  /\b(i'?m|i am|im|we'?re|we are)\b[^.\n]{0,25}\b(outside|near|at|in front of|downstairs at)\b[^.\n]{0,10}\b(your|ur)\s+(house|home|door|school|college|hostel|office|building|gate|place)\b/i,
  /\b(coming|on my way|reaching) to your (house|home|place|school|college|hostel)\b/i,
  /\b(tere|tumhare) ghar ke (bahar|neeche|niche|saamne)\b[^.\n]{0,20}\b(hoon|hu|hun|khada|aa gaya|pahunch)/i,
  /(घर के बाहर|घर के नीचे|घर के सामने)[^।\n]{0,20}(हूँ|हूं|खड़ा|आ गया)/,
];
/** Weaker presence phrases that only count when a threat is also present. */
const PRESENCE_WITH_THREAT = [
  /\b(main|mai|hum)\b[^.\n]{0,15}\b(aa raha|aa rahi|aa rahe|pahunch gaya|pahuch gaya|khada hoon|khada hu)\b/i,
  /\b(tere|tumhare) ghar ke (bahar|neeche|niche|saamne)\b/i,
  /\b(i'?m|i am) (coming|on my way)\b/i,
];
const OUTSIDE_PLAIN = /\boutside (your|ur) (house|home|door)\b|(घर के बाहर)/i;
const IMMINENT_TIME = /\b(tonight|right now|today itself|in an hour|in \d+ minutes?)\b|\b(aaj raat|abhi ke abhi)\b|(आज रात|अभी के अभी)/i;

const LINE_SENDER = /^\s*(?:\[[^\]]{3,40}\]\s*)?([^:\n]{1,40}):\s+\S/;

function snippet(text: string, m: RegExpExecArray): string {
  const s = Math.max(0, m.index - 20), e = Math.min(text.length, m.index + m[0].length + 20);
  return `${s > 0 ? '…' : ''}${text.slice(s, e).replace(/\s+/g, ' ').trim()}${e < text.length ? '…' : ''}`;
}

function find(text: string, patterns: Rx[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && out.length < 4) {
      out.push(snippet(text, m));
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return [...new Set(out)];
}

/** Counts lines per sender in pasted chats like "[10:21, 15/10/2026] Name: text". */
export function countOtherSenderLines(text: string): number {
  const counts = new Map<string, number>();
  for (const line of text.split(/\n/)) {
    const m = LINE_SENDER.exec(line);
    if (!m) continue;
    const name = m[1].trim().toLowerCase();
    if (['you', 'me', 'main', 'मैं'].includes(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export function levelForRisk(risk: number): RiskLevel {
  if (risk <= 0) return 'none';
  for (const l of THREAT.levels) if (risk <= l.max) return l.level as RiskLevel;
  return 'emergency';
}

export function actionPlan(category: ThreatCategory | null, emergency: boolean): ActionPlan {
  const plan: ActionPlan = { do: [], dont: [], contacts: [] };
  if (emergency) {
    plan.do.push('If you are in danger now, call 112 and move to a safe place with other people around.', 'Tell a trusted adult or friend immediately and stay with them.');
    plan.dont.push('Do not go outside or meet this person.');
    plan.contacts.push({ ...HELP.emergency, note: 'For immediate danger.' });
  }
  switch (category) {
    case 'scam':
      plan.do.push('Verify the request yourself using an official number or website — not the one in the message.', 'Save the messages and payment details as evidence.', 'If money was taken, call 1930 as soon as possible — quick reporting helps freeze funds.');
      plan.dont.push('Do not transfer money.', 'Do not share an OTP, PIN, CVV or password with anyone.', 'Do not click links or install apps sent by this person.');
      plan.contacts.push({ ...HELP.cyberHelpline, note: 'Financial cyber fraud.' }, { ...HELP.cyberPortal, note: 'Report online.' });
      break;
    case 'sextortion':
      plan.do.push('Save the chat, number/profile and any payment demands as evidence.', 'Block and report the account after you have saved evidence.', 'Tell someone you trust. This is a crime against you; you are not to blame.', 'Report on cybercrime.gov.in (there is a dedicated section for women and children).');
      plan.dont.push('Do not pay — paying usually leads to more demands.', 'Do not send more photos or videos.', 'Do not argue or threaten back.', 'Do not delete the chat.');
      plan.contacts.push({ ...HELP.cyberPortal, note: 'Report sextortion / image abuse.' }, { ...HELP.cyberHelpline, note: 'If money was demanded or paid.' });
      break;
    case 'stalking':
      plan.do.push('Prioritise your physical safety: avoid going alone to places this person mentioned.', 'Tell a trusted person and share your location with them.', 'Save messages and note dates, times and places when safe.', 'Review privacy settings and turn off live location sharing.');
      plan.dont.push('Do not reply or agree to meet.', 'Do not post your location or plans publicly.');
      plan.contacts.push({ ...HELP.emergency, note: 'If you feel in danger.' }, { ...HELP.cyberPortal, note: 'Report online stalking.' });
      break;
    case 'physical':
      plan.do.push('Take the threat seriously: tell a trusted adult and the police.', 'Save the messages as evidence when it is safe.', 'Avoid being alone in places the person knows about.');
      plan.dont.push('Do not confront the person or reply with threats.');
      if (!emergency) plan.contacts.push({ ...HELP.emergency, note: 'If danger is imminent.' });
      plan.contacts.push({ ...HELP.cyberPortal, note: 'Report online threats.' });
      break;
    case 'abuse':
      plan.do.push('Save the messages, then block or mute the sender.', 'Tell someone you trust how it is making you feel.', 'Use the platform’s report option for harassment.');
      plan.dont.push('Do not reply in anger — it can escalate.', 'Do not blame yourself.');
      plan.contacts.push({ ...HELP.cyberPortal, note: 'If it continues or becomes threatening.' });
      break;
    default:
      if (!emergency) {
        plan.do.push('Keep the conversation saved in case things change.', 'Trust your instincts — if something feels wrong, talk to someone you trust.');
      }
  }
  // de-duplicate contacts
  const seen = new Set<string>();
  plan.contacts = plan.contacts.filter((c) => (seen.has(c.value) ? false : (seen.add(c.value), true)));
  return plan;
}

export interface ThreatOptions {
  /** Pattern Detector reports rising/repeated severity for this sender. */
  patternRising?: boolean;
  /** User says the person contacted them repeatedly. */
  repeatedContact?: boolean;
  /** User correction of the detected category. */
  overrideCategory?: ThreatCategory | null;
  /** The sender is unknown / anonymous (random number or account). */
  anonymous?: boolean;
  /** The person targeted is under 18. */
  minor?: boolean;
}

export function analyzeThreat(text: string, opts: ThreatOptions = {}): ThreatAssessment {
  // Match on text with disguised spellings undone ("ill f*ck ur" → "i'll fuck ur").
  const t = deobfuscate(text.normalize('NFC').toLowerCase());
  const hits: ThreatCategoryHit[] = [];
  const sexualEv = find(t, SEXUAL_THREAT);
  for (const cat of ['physical', 'sextortion', 'stalking', 'scam'] as const) {
    let ev = find(t, CATEGORY_PATTERNS[cat]);
    if (cat === 'physical' && sexualEv.length) ev = [...sexualEv.map((e) => `Sexual violence threat: ${e}`), ...ev];
    if (ev.length) hits.push({ category: cat, severity: THREAT.severity[cat], evidence: ev });
  }
  const tox = analyzeToxicity(t);
  if (tox.level !== 'none') {
    hits.push({ category: 'abuse', severity: THREAT.severity.abuse, evidence: tox.matches.filter((m) => m.contribution > 0.05).slice(0, 4).map((m) => `“${m.matchedText}” (${m.category.replace('-', ' ')})`) });
  }
  hits.sort((a, b) => b.severity - a.severity);

  const detected = hits[0]?.category ?? null;
  const primary = opts.overrideCategory !== undefined && opts.overrideCategory !== null ? opts.overrideCategory : detected;
  const severity = primary ? THREAT.severity[primary] : 0;

  const signs: WarningSign[] = [];
  const labels: Record<WarningSignId, string> = {
    personalDetails: 'Knows personal details (home, school, family)',
    deadline: 'Imposes a deadline',
    ultimatum: 'Gives an ultimatum (“do this or I will…”)',
    moneyDemand: 'Demands money',
    repeatedContact: 'Repeated contact',
    patternRising: 'Pattern Detector shows rising/repeated hostility',
  };
  for (const id of ['personalDetails', 'deadline', 'ultimatum', 'moneyDemand'] as const) {
    const ev = find(t, WARNING_PATTERNS[id]);
    if (ev.length) signs.push({ id, label: labels[id], evidence: ev.slice(0, 3) });
  }
  const lines = countOtherSenderLines(t);
  const repeatedEv: string[] = [];
  if (lines >= THREAT.repeatedLines) repeatedEv.push(`${lines} messages from the same sender in the pasted chat.`);
  const rp = REPEATED_PHRASES.exec(t);
  if (rp) repeatedEv.push(snippet(t, rp));
  if (opts.repeatedContact) repeatedEv.push('You indicated this person keeps contacting you.');
  if (repeatedEv.length) signs.push({ id: 'repeatedContact', label: labels.repeatedContact, evidence: repeatedEv });
  if (opts.patternRising) signs.push({ id: 'patternRising', label: labels.patternRising, evidence: ['From your local Pattern Detector history for this sender.'] });

  const likelihood = Math.min(5, 1 + signs.length);
  const risk = primary ? likelihood * severity : 0;

  const emergencyEv: string[] = [];
  // Time words ("tonight") only signal immediate PHYSICAL danger; for blackmail/scams they are a deadline (warning sign).
  const physical = hits.some((h) => h.category === 'physical') || primary === 'physical';
  const anyThreat = hits.some((h) => h.category !== 'abuse') || (primary !== null && primary !== 'abuse');
  emergencyEv.push(...find(t, PRESENCE));
  if (anyThreat) emergencyEv.push(...find(t, PRESENCE_WITH_THREAT));
  if (OUTSIDE_PLAIN.test(t) && anyThreat) emergencyEv.push(...find(t, [OUTSIDE_PLAIN]));
  if (physical && IMMINENT_TIME.test(t)) emergencyEv.push(...find(t, [IMMINENT_TIME]).map((s) => `Time-imminent threat: ${s}`));
  const emergency = { triggered: emergencyEv.length > 0, evidence: [...new Set(emergencyEv)] };

  // Serious-threat floor: threats of sexual exposure or of physical/sexual violence are
  // never shown below "high", even when few warning signs push the score up.
  const scored = levelForRisk(risk);
  const floored = (primary === 'sextortion' || primary === 'physical') && (scored === 'low' || scored === 'medium');
  const level: RiskLevel = emergency.triggered ? 'emergency' : floored ? 'high' : scored;
  const name: Record<ThreatCategory, string> = { sextortion: 'blackmail / sextortion', scam: 'scam', stalking: 'stalking', physical: sexualEv.length ? 'threat of sexual violence' : 'physical threat', abuse: 'abusive message' };
  const explanation = emergency.triggered
    ? `Immediate danger signs detected (${emergency.evidence[0]}). Treat this as an emergency.`
    : primary
      ? `Detected ${name[primary]} (severity ${severity}). ${signs.length} warning sign(s) → likelihood ${likelihood}. Risk = ${likelihood} × ${severity} = ${risk}${floored ? ` — shown as high because threats of ${primary === 'sextortion' ? 'leaking intimate images' : 'violence'} are always treated seriously` : ` (${level})`}.`
      : 'No threat pattern from the local rules was found. If something still feels wrong, trust that feeling and talk to someone.';

  return {
    kind: 'threat',
    id: uid('threat'),
    timestamp: new Date().toISOString(),
    hits,
    primary,
    categoryOverridden: primary !== detected,
    severity,
    warningSigns: signs,
    likelihood,
    risk,
    level,
    emergency,
    actionPlan: actionPlan(primary, emergency.triggered),
    sexual: sexualEv.length > 0,
    guidance: legalGuidance(primary, text, signs, {
      anonymous: !!opts.anonymous, minor: !!opts.minor, sexual: sexualEv.length > 0 || hits.some((h) => h.category === 'sextortion'),
      moneyDemanded: signs.some((s) => s.id === 'moneyDemand'),
    }),
    abuse: primary === 'abuse' ? abuseHelp(tox.categories.map((c) => c.replace('-', ' ')), tox.categories.every((c) => c === 'profanity' || c === 'insult')) : null,
    toxicityMatches: tox.matches.filter((m) => m.contribution > 0.05).map((m) => ({ text: m.matchedText, category: m.category })),
    explanation,
    limitations: [
      'Rule-based pattern matching: it can miss threats phrased in unusual ways and misread jokes or quotes.',
      'You can correct the category if Solace misunderstood the context.',
      'Solace never contacts anyone or files reports for you.',
    ],
  };
}
