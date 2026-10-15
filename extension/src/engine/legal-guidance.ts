/**
 * Legal and technical analysis for SERIOUS threats only (sextortion, physical
 * or sexual-violence threats, stalking, scams). Ordinary abuse gets practical
 * help instead (see abuseHelp) — no legal lecture for an insult.
 *
 * Law references are to Indian statutes in force in 2026: Bharatiya Nyaya
 * Sanhita 2023 (BNS, replaced the IPC on 1 July 2024), Information Technology
 * Act 2000 and POCSO Act 2012. They are offered as "may apply" pointers, not
 * legal advice; the police and courts decide what applies.
 */
import type { ThreatCategory, WarningSign } from '../shared/types';

export interface LawRef { law: string; section: string; covers: string; why: string }
export interface TechPoint { title: string; detail: string }
export interface Guidance {
  laws: LawRef[];
  technical: TechPoint[];
  report: { label: string; href: string; when: string }[];
  disclaimer: string;
}
export interface AbuseHelp {
  meaning: string;
  options: { title: string; detail: string }[];
  replies: string[];
}

const DISCLAIMER = 'Solace is not a lawyer. These are sections commonly used for such cases; the police decide which apply. Free legal aid: NALSA helpline 15100.';

export const LAW = {
  intimidation: { law: 'BNS 2023', section: '351(2)', covers: 'Criminal intimidation: threatening injury to a person, their reputation or property to cause alarm', why: 'The message threatens you to scare you or make you do something.' },
  intimidationGrave: { law: 'BNS 2023', section: '351(3)', covers: 'Criminal intimidation with a threat of death, grievous hurt or of imputing unchastity to a woman (up to 7 years)', why: 'The threat is of serious physical or sexual harm.' },
  anonymous: { law: 'BNS 2023', section: '351(4)', covers: 'Intimidation by anonymous communication or while hiding identity (up to 2 extra years)', why: 'The sender is unknown or hiding who they are.' },
  extortion: { law: 'BNS 2023', section: '308', covers: 'Extortion: putting someone in fear to make them hand over money or property', why: 'Money or something else is demanded under threat.' },
  privacy: { law: 'IT Act 2000', section: '66E', covers: 'Capturing, publishing or sending images of a person’s private body without consent', why: 'Private images are being threatened to be shared.' },
  obscene: { law: 'IT Act 2000', section: '67 / 67A', covers: 'Publishing or sending obscene / sexually explicit material electronically', why: 'Sharing intimate images online would fall here.' },
  voyeurism: { law: 'BNS 2023', section: '77', covers: 'Voyeurism, including spreading a woman’s private images she did not agree to share', why: 'Applies if the images show a woman and were shared without consent.' },
  sexualHarassment: { law: 'BNS 2023', section: '75', covers: 'Sexual harassment, including sexually coloured remarks', why: 'The message contains sexual remarks or threats.' },
  stalking: { law: 'BNS 2023', section: '78', covers: 'Stalking: following, contacting or monitoring a woman’s online activity despite clear disinterest', why: 'Repeated unwanted contact or watching you.' },
  cheating: { law: 'BNS 2023', section: '318 / 319', covers: 'Cheating, and cheating by pretending to be someone else', why: 'You are being tricked into paying or sharing details.' },
  identityTheft: { law: 'IT Act 2000', section: '66C / 66D', covers: 'Misusing someone’s password/OTP/identity, and cheating by personation using a computer or phone', why: 'OTP, password or impersonation is involved.' },
  pocso: { law: 'POCSO Act 2012', section: '11–15', covers: 'Sexual harassment of a child and any use of a child in sexual material', why: 'Applies if the person targeted is under 18 — the strictest law; report immediately.' },
};

const REPORT = {
  portal: { label: 'cybercrime.gov.in', href: 'https://cybercrime.gov.in/', when: 'File a complaint online (has a separate women & children section, can be anonymous for sexual content).' },
  helpline: { label: 'Call 1930', href: 'tel:1930', when: 'Money lost or demanded — call within hours so banks can freeze it.' },
  emergency: { label: 'Call 112', href: 'tel:112', when: 'You feel in physical danger right now.' },
  stopncii: { label: 'StopNCII.org', href: 'https://stopncii.org/', when: 'Creates a fingerprint of your private image on your own device so partner platforms (Instagram, Facebook and others) can block uploads — the image itself is never uploaded.' },
  chakshu: { label: 'Sanchar Saathi – Chakshu', href: 'https://sancharsaathi.gov.in/', when: 'Report the fraud number/WhatsApp message to the Department of Telecom (no money lost yet).' },
  ncw: { label: 'NCW complaint', href: 'https://ncwapps.nic.in/', when: 'Women can also complain to the National Commission for Women.' },
  childline: { label: 'Call 1098', href: 'tel:1098', when: 'Childline, if the person targeted is under 18.' },
};

/** Extracts phone numbers in a pasted chat and reports foreign country codes. */
export function numberInsights(text: string): TechPoint[] {
  const nums = [...new Set((text.match(/\+\d{1,3}[\s-]?\d[\d\s-]{6,14}\d/g) ?? []).map((n) => n.replace(/[\s-]/g, '')))].slice(0, 5);
  const out: TechPoint[] = [];
  const foreign = nums.filter((n) => !n.startsWith('+91'));
  if (foreign.length) {
    out.push({
      title: `Foreign number${foreign.length > 1 ? 's' : ''}: ${foreign.join(', ')}`,
      detail: 'Mass sextortion and scam gangs often use foreign or virtual WhatsApp numbers. It means the sender is probably a stranger running a script, not someone who knows you — but still report it; Indian police can act on complaints involving foreign numbers.',
    });
  } else if (nums.length) {
    out.push({ title: `Indian number: ${nums.join(', ')}`, detail: 'Indian numbers are tied to an ID (KYC). Police can trace the subscriber through the telecom operator once you file a complaint — keep the number in your evidence.' });
  }
  return out;
}

export function legalGuidance(category: ThreatCategory | null, text: string, signs: WarningSign[], opts: { anonymous: boolean; minor: boolean; sexual: boolean; moneyDemanded: boolean }): Guidance | null {
  if (!category || category === 'abuse') return null;
  const laws: LawRef[] = [];
  const technical: TechPoint[] = [];
  const report: Guidance['report'] = [];
  const has = (id: WarningSign['id']) => signs.some((s) => s.id === id);

  switch (category) {
    case 'sextortion':
      laws.push(LAW.extortion, LAW.intimidationGrave, LAW.privacy, LAW.obscene, LAW.voyeurism);
      technical.push(
        { title: 'Do they actually have anything?', detail: 'Most sextortion messages from unknown numbers are bluffs sent to thousands of people. If you never shared intimate images with this person, they almost certainly have none. If you did, they may have it — act calmly, don’t pay.' },
        { title: 'Morphed or AI images', detail: 'Scammers often paste a face from your public profile photo onto explicit images. Such fakes are also illegal to share. Report them the same way; you can say the image is fake.' },
        { title: 'Paying does not delete anything', detail: 'There is no technical way for you to confirm deletion. Payment shows you are scared and usually leads to more demands.' },
        { title: 'Blocking spread before it happens', detail: 'StopNCII.org fingerprints the image on your own phone and partner platforms block matching uploads. WhatsApp cannot scan private chats, so report the account there too.' },
        { title: 'Lock down your contacts', detail: 'They threaten to send to your family by scraping your followers list. Make your Instagram account private and hide your following/followers list temporarily.' },
      );
      report.push(REPORT.portal, REPORT.stopncii);
      if (opts.moneyDemanded) report.push(REPORT.helpline);
      break;
    case 'physical':
      laws.push(LAW.intimidationGrave);
      if (opts.sexual) laws.push(LAW.sexualHarassment);
      technical.push(
        { title: 'How much do they know?', detail: has('personalDetails') ? 'The message mentions your home, school or family. Check what is public: Instagram location tags, school or college in your bio, tagged photos at your house, live location shared on WhatsApp/Google Maps.' : 'The message does not show they know where you are. Keep it that way: remove location tags and turn off live location sharing.' },
        { title: 'Is it a real person you know?', detail: 'Threats from unknown numbers are often from someone you have argued with using a second number. Note writing style, timing and any details only a few people know — this helps police trace them.' },
      );
      report.push(REPORT.emergency, REPORT.portal);
      if (opts.sexual) report.push(REPORT.ncw);
      break;
    case 'stalking':
      laws.push(LAW.stalking, LAW.intimidation);
      technical.push(
        { title: 'How could they be tracking you?', detail: 'Common ways: live location shared earlier, Instagram stories with location stickers, “Snap Map”-style features, tagged photos, a shared Google account, or an app installed on your phone. Check Google Maps → Location sharing and your phone’s list of installed apps.' },
        { title: 'Secure your accounts', detail: 'Change passwords, turn on two-step verification on WhatsApp and Instagram, and log out of other devices (Instagram: Settings → Accounts Centre → Password and security → Where you’re logged in).' },
      );
      report.push(REPORT.portal, REPORT.emergency);
      break;
    case 'scam':
      laws.push(LAW.cheating, LAW.identityTheft);
      technical.push(
        { title: 'What the scammer can do with an OTP', detail: 'An OTP lets them log into your account, approve a UPI payment or take over your WhatsApp. Banks, KYC teams and police never ask for one.' },
        { title: 'Check the request independently', detail: 'Call the bank or company using the number on their official website or your card — never a number from the message.' },
      );
      report.push(REPORT.helpline, REPORT.chakshu, REPORT.portal);
      break;
  }
  if (opts.moneyDemanded && category !== 'sextortion' && category !== 'scam') laws.push(LAW.extortion);
  if (opts.anonymous) laws.push(LAW.anonymous);
  if (opts.minor) { laws.push(LAW.pocso); report.unshift(REPORT.childline); }
  technical.push(...numberInsights(text));
  technical.push({ title: 'Keep the evidence intact', detail: 'Screenshot the chat including the number/username and time, export the WhatsApp chat (⋮ → More → Export chat), and save it in the Evidence Locker before blocking. Deleted chats are hard to recover.' });
  return { laws: dedupe(laws), technical, report, disclaimer: DISCLAIMER };
}

function dedupe(l: LawRef[]): LawRef[] {
  const seen = new Set<string>();
  return l.filter((x) => (seen.has(x.law + x.section) ? false : (seen.add(x.law + x.section), true)));
}

/** Practical help for ordinary abusive messages — no legal sections. */
export function abuseHelp(categories: string[], profanityOnly: boolean): AbuseHelp {
  const meaning = profanityOnly
    ? 'This is swearing / abusive language aimed at you. It is hurtful, but on its own it is usually handled by blocking and reporting rather than the police.'
    : `This message is abusive (${categories.join(', ')}). One message like this is usually best handled by blocking and reporting; if it keeps happening it becomes harassment.`;
  return {
    meaning,
    options: [
      { title: 'Don’t reply in anger', detail: 'Abusers often want a reaction. Silence or one calm line ends most of these.' },
      { title: 'Mute or block', detail: 'WhatsApp: open chat → ⋮ → More → Block (choose “Block and report” for strangers). Instagram: profile → ⋯ → Restrict (they won’t know) or Block.' },
      { title: 'Report it to the app', detail: 'Reporting lets WhatsApp/Instagram ban repeat abusers. Instagram also lets you hide comments with offensive words (Settings → Hidden words).' },
      { title: 'Watch for a pattern', detail: 'Add the sender in “Is it kind?” → Pattern Detector. If it keeps happening, Solace will flag repeated targeting and you can escalate.' },
      { title: 'Talk to someone', detail: 'Words like this can sting even when you know they are not true. Tell a friend, parent or teacher.' },
    ],
    replies: [
      'I’m not going to continue this conversation.',
      'Please stop messaging me like this. If it continues I will report it.',
    ],
  };
}
