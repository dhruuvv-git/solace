/**
 * Incident report builder: turns what a person describes into a formal complaint
 * for the police / cyber cell. Everything here runs in the browser — the draft is
 * kept in this browser's localStorage (text only) and photos never leave the page.
 */
import { CONCERNS } from './concerns';
import { formatSize, istStamp } from './vault';

export const REPORT_TYPES = [
  ...CONCERNS.filter((c) => c.id !== 'exploring').map((c) => ({ id: c.id, title: c.title })),
  { id: 'fraud', title: 'Online fraud or financial scam' },
  { id: 'other', title: 'Something else' },
];
const typeTitle = (id) => REPORT_TYPES.find((t) => t.id === id)?.title ?? 'An incident';

export const AUTHORITIES = [
  { id: 'police', title: 'Local police station', hint: 'Addressed to the Station House Officer (SHO). Print two copies — keep the stamped one.' },
  { id: 'cyber-cell', title: 'Cyber Crime Cell', hint: 'Addressed to the district / city Cyber Crime Cell.' },
  { id: 'portal', title: 'cybercrime.gov.in', hint: 'Text formatted to paste into the National Cyber Crime Reporting Portal.' },
];

export const DESCRIBE_PROMPTS = [
  'What happened, in the order it happened?',
  'Who did it? Names, usernames, phone numbers, profile links.',
  'When and where — which app, website, chat or place?',
  'The exact words of any threat or demand (quote them).',
  'Has anyone asked for or received money? How much, how was it paid?',
  'How has it affected you (fear, loss, reputation, safety)?',
  'Who else knows or saw it?',
];

export const emptyDraft = (user) => ({
  type: user?.incident?.type && user.incident.type !== 'exploring' ? user.incident.type : (user?.onboarding?.concern && user.onboarding.concern !== 'exploring' ? user.onboarding.concern : ''),
  occurredAt: '', discoveredAt: user?.incident?.discoveredAt ? toLocalInput(user.incident.discoveredAt) : '',
  platform: '', location: '', description: '',
  ongoing: false, threats: false, moneyDemanded: false, moneyPaid: false, amount: '', contentShared: false,
  suspect: 'unknown', suspectName: '', suspectHandles: '', suspectRelation: '', suspectOther: '',
  links: '', witnesses: '',
  name: user?.name ?? '', guardian: '', age: '', phone: '', email: user?.email ?? '', address: '', city: '', state: '',
  authority: 'police', stationName: '', includeVault: true, confidential: true,
});

export function toLocalInput(ms) {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const fromLocalInput = (s) => (s ? new Date(s).getTime() : null);
const when = (s) => (s ? istStamp(fromLocalInput(s)) : null);
const blank = (label) => `[${label}]`;
const lines = (s) => String(s || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);

const draftKey = (userId) => `solace-report-draft:${userId}`;
export function loadDraft(user) {
  try { const raw = localStorage.getItem(draftKey(user.id)); if (raw) return { ...emptyDraft(user), ...JSON.parse(raw) }; } catch { /* storage blocked */ }
  return emptyDraft(user);
}
export function saveDraft(userId, d) { try { localStorage.setItem(draftKey(userId), JSON.stringify(d)); } catch { /* storage blocked */ } }
export function clearDraft(userId) { try { localStorage.removeItem(draftKey(userId)); } catch { /* storage blocked */ } }

/** Provisions the complainant can point to. The officer decides the final sections. */
export function provisions(d) {
  const p = new Map();
  const add = (k, v) => p.set(k, v);
  const sexual = d.type === 'intimate-images' || (d.type === 'deepfake' && d.contentShared);
  if (d.type === 'intimate-images') { add('it66e', 'Section 66E, IT Act 2000 — violation of privacy (capturing or publishing private images)'); add('bns77', 'Section 77, BNS 2023 — voyeurism, including sharing images of a private act'); }
  if (sexual) { add('it67', 'Section 67, IT Act 2000 — publishing or transmitting obscene material electronically'); add('it67a', 'Section 67A, IT Act 2000 — publishing or transmitting sexually explicit material'); }
  if (d.type === 'deepfake' || d.type === 'impersonation') { add('it66c', 'Section 66C, IT Act 2000 — identity theft (use of another person’s identity features)'); add('it66d', 'Section 66D, IT Act 2000 — cheating by personation using a computer resource'); add('bns356', 'Section 356, BNS 2023 — defamation'); }
  if (d.type === 'impersonation') add('bns319', 'Section 319, BNS 2023 — cheating by personation');
  if (d.type === 'harassment') { add('bns78', 'Section 78, BNS 2023 — stalking, including monitoring a person’s electronic communication'); add('bns79', 'Section 79, BNS 2023 — words, gestures or acts intended to insult the modesty of a woman'); }
  if (d.type === 'extortion' || d.moneyDemanded) add('bns308', 'Section 308, BNS 2023 — extortion');
  if (d.type === 'extortion' || d.threats) add('bns351', 'Section 351, BNS 2023 — criminal intimidation');
  if (d.type === 'fraud' || d.moneyPaid) { add('bns318', 'Section 318, BNS 2023 — cheating'); add('it66d', 'Section 66D, IT Act 2000 — cheating by personation using a computer resource'); }
  return [...p.values()];
}

/** What is still missing, most important first. */
export function gaps(d, photos) {
  const g = [];
  if (!d.occurredAt && !d.discoveredAt) g.push(['bad', 'Enter the date it happened or the date you found out.']);
  if (!d.type) g.push(['warn', 'Choose an incident type if you know it; otherwise the report will use a general description.']);
  if (!d.description.trim()) g.push(['warn', 'Add a short description if you can. Words like “about” or “I think” are fine; don’t guess.']);
  if (!d.platform && !d.location) g.push(['warn', 'Add where it happened (app, website or place).']);
  if (!photos.length) g.push(['bad', 'Add at least one photo, screenshot, or other proof file before making the report.']);
  if (d.suspect !== 'unknown' && !d.suspectName && !d.suspectHandles) g.push(['warn', 'Add the name, username or number of the person responsible.']);
  if (['impersonation', 'deepfake', 'intimate-images', 'harassment'].includes(d.type) && !lines(d.links).length) g.push(['warn', 'Paste the links (URLs) to the posts, profiles or chats.']);
  if (d.moneyDemanded && !d.amount) g.push(['warn', 'Add the amount demanded or paid.']);
  if (!d.name.trim()) g.push(['bad', 'Add your name.']);
  if (!d.phone.trim() && !d.email.trim()) g.push(['bad', 'Add a phone number or email so the police can reach you.']);
  if (d.authority !== 'portal' && !d.address.trim()) g.push(['warn', 'Add your address (needed for a police complaint).']);
  return g;
}

/** The structured report used by both the on-screen/print document and the text export. */
export function buildReport(d, photos, vaultRecords, now = Date.now()) {
  const place = [d.city, d.state].filter(Boolean).join(', ');
  const to = d.authority === 'portal'
    ? ['National Cyber Crime Reporting Portal (cybercrime.gov.in)', 'Ministry of Home Affairs, Government of India']
    : d.authority === 'cyber-cell'
      ? ['The Officer-in-Charge', 'Cyber Crime Cell', place || blank('city / district')]
      : ['The Station House Officer', d.stationName || blank('name of police station'), place || blank('city / district')];

  const what = typeTitle(d.type).toLowerCase();
  const where = d.platform ? `on ${d.platform}` : d.location ? `at ${d.location}` : '';
  const subject = `Complaint regarding ${what}${d.platform ? ` on ${d.platform}` : ''} — request to register an FIR and take action`;

  const who = [`I, ${d.name || blank('your full name')}`];
  if (d.age) who.push(`aged ${d.age}`);
  if (d.guardian) who.push(`child of / ward of ${d.guardian}`);
  who.push(`residing at ${d.address || blank('your address')}${place ? `, ${place}` : ''}`);

  const statement = [];
  statement.push(`${who.join(', ')}, respectfully submit this complaint about ${what}${where ? ` ${where}` : ''}.`);
  const timing = [];
  if (d.occurredAt) timing.push(`The incident took place on or about ${when(d.occurredAt)}`);
  if (d.discoveredAt) timing.push(`${timing.length ? 'I' : 'I first'} became aware of it on ${when(d.discoveredAt)}`);
  if (timing.length) statement.push(`${timing.join(', and ')}.`);
  const description = lines(d.description);
  statement.push(...(description.length ? description : ['I am reporting this incident and request that the attached evidence be reviewed. I am unable to provide further details at this time.']));
  const facts = [];
  if (d.threats) facts.push('I have been threatened by the person(s) responsible.');
  if (d.moneyDemanded) facts.push(`Money was demanded from me${d.amount ? ` (amount: ₹${d.amount})` : ''}.`);
  if (d.moneyPaid) facts.push(`I have paid money as a result${d.amount && !d.moneyDemanded ? ` (amount: ₹${d.amount})` : ''}.`);
  if (d.contentShared) facts.push('The content has already been shared or published to others.');
  if (d.ongoing) facts.push('This is still continuing at the time of writing this complaint.');
  if (facts.length) statement.push(facts.join(' '));
  if (d.witnesses.trim()) statement.push(`The following people are aware of or witnessed these events: ${d.witnesses.trim()}.`);
  statement.push(photos.length
    ? `I have attached ${photos.length} evidence file(s) as Annexure A. Each file’s SHA-256 fingerprint was computed on my device when this complaint was prepared, so it can be shown that the files have not been altered. I am preserving the original files and the device(s) they are on.`
    : 'I am preserving all messages, screenshots and the device(s) involved and will produce them when asked.');

  const accused = d.suspect === 'unknown'
    ? [['Identity', 'Unknown to me']]
    : [
      ['Name', d.suspectName || (d.suspect === 'suspect' ? 'Suspected, not confirmed' : blank('name if known'))],
      ['Usernames / phone / IDs', lines(d.suspectHandles).join(', ') || '—'],
      ['Relationship to me', d.suspectRelation || '—'],
      ['Other details', d.suspectOther || '—'],
    ].map(([k, v], i) => (i === 0 && d.suspect === 'suspect' && d.suspectName ? [k, `${v} (suspected)`] : [k, v]));

  const requests = [
    'Register an FIR on this complaint and investigate the matter.',
    'Direct the platform(s) concerned to remove or disable access to the content, and to preserve the account, IP and log records for the investigation.',
    'Trace and identify the person(s) operating the account(s) / number(s) listed above.',
  ];
  if (d.moneyPaid || d.type === 'fraud') requests.push('Take steps to freeze or recover the money transferred.');
  if (d.threats || d.ongoing) requests.push('Take measures for my safety and stop further harassment or threats.');
  if (d.confidential) requests.push('Keep my identity confidential and avoid disclosing the images or my personal details in any public record.');

  return {
    title: d.authority === 'portal' ? 'Cyber crime complaint' : 'Complaint / First Information',
    date: istStamp(now), place: place || blank('place'),
    to, subject, statement, accused, requests,
    complainant: [
      ['Name', d.name || blank('your full name')],
      ...(d.age ? [['Age', d.age]] : []),
      ...(d.guardian ? [['Parent / guardian', d.guardian]] : []),
      ['Address', [d.address, place].filter(Boolean).join(', ') || blank('your address')],
      ['Phone', d.phone || '—'],
      ['Email', d.email || '—'],
    ],
    summary: [
      ['Nature of incident', typeTitle(d.type)],
      ['Date / time of incident', when(d.occurredAt) || '—'],
      ['Date / time discovered', when(d.discoveredAt) || '—'],
      ['Platform / place', [d.platform, d.location].filter(Boolean).join(' · ') || '—'],
      ['Still ongoing', d.ongoing ? 'Yes' : 'No'],
      ...(d.moneyDemanded || d.moneyPaid ? [['Money demanded / paid', d.amount ? `₹${d.amount}` : 'Yes']] : []),
    ],
    links: lines(d.links),
    provisions: provisions(d),
    photos: photos.map((p, i) => ({ ...p, label: `A-${i + 1}`, meta: `${p.name} · ${formatSize(p.size)}${p.lastModified ? ` · file date ${istStamp(p.lastModified)}` : ''}` })),
    vault: d.includeVault ? vaultRecords.filter((r) => !photos.some((p) => p.hash === r.hash)) : [],
    signName: d.name || blank('your full name'),
  };
}

/** Plain text, for pasting into cybercrime.gov.in or an email. */
export function reportText(r) {
  const out = [];
  const table = (rows) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  out.push(r.title.toUpperCase(), '', `Date: ${r.date}`, '', 'To,', ...r.to, '', `Subject: ${r.subject}`, '', 'Respected Sir / Madam,', '');
  out.push(r.statement.join('\n\n'), '');
  out.push('INCIDENT SUMMARY', table(r.summary), '');
  out.push('DETAILS OF THE PERSON(S) RESPONSIBLE', table(r.accused), '');
  if (r.links.length) out.push('LINKS TO THE CONTENT / ACCOUNTS', ...r.links.map((l, i) => `${i + 1}. ${l}`), '');
  if (r.provisions.length) out.push('PROVISIONS THAT MAY APPLY (for the officer to determine)', ...r.provisions.map((p) => `- ${p}`), '');
  out.push('I REQUEST YOU TO', ...r.requests.map((q, i) => `${i + 1}. ${q}`), '');
  if (r.photos.length) out.push('ANNEXURE A — PHOTOGRAPHS / SCREENSHOTS', ...r.photos.map((p) => `${p.label}. ${p.caption || p.name}\n    ${p.meta}\n    SHA-256: ${p.hash}`), '');
  if (r.vault.length) out.push('ANNEXURE B — OTHER SEALED EVIDENCE (Solace Evidence Vault)', ...r.vault.map((v, i) => `B-${i + 1}. ${v.name} · sealed ${istStamp(v.sealedAt)}\n    SHA-256: ${v.hash}`), '');
  out.push('COMPLAINANT', table(r.complainant), '');
  out.push('I declare that the information given above is true and correct to the best of my knowledge and belief.', '', `Place: ${r.place}`, `Date: ${r.date}`, '', `Signature: ____________________`, `Name: ${r.signName}`);
  return out.join('\n');
}
