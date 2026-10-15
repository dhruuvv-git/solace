/**
 * Optional Groq answer for message checks ("Am I safe?" and "Is it kind?").
 *
 * - OFF by default. When on, the message text (and the local Solace
 *   findings as hints) is sent to Groq's API using the user's own key.
 * - Groq must reply with JSON matching AiAnswer; everything is validated and
 *   length-limited before display. Law references are ONLY accepted from the
 *   verified list in legal-guidance.ts — anything else the model cites is
 *   dropped, so the AI cannot invent sections.
 * - The local analysis is always computed first and stays visible. Local
 *   emergency detection can never be downgraded by the AI.
 */
import { LAW } from '../engine/legal-guidance';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
export const GROQ_MODEL_CHOICES = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

export type AiCategory = 'safe' | 'abuse' | 'threat_violence' | 'sexual_threat' | 'sextortion' | 'stalking' | 'scam' | 'self_harm' | 'other';
export type AiRisk = 'none' | 'low' | 'medium' | 'high' | 'emergency';

export interface AiAnswer {
  category: AiCategory;
  serious: boolean;
  risk: AiRisk;
  summary: string;
  why: string[];
  do: string[];
  dont: string[];
  technical: string[];
  legal: { law: string; section: string; why: string }[];
  replies: string[];
  rewrite: string | null;
  droppedLegal: number;
  model: string;
}

export interface AiRequest {
  mode: 'safety' | 'received' | 'draft';
  text: string;
  local: Record<string, unknown>;
  anonymous?: boolean;
  minor?: boolean;
}

const ALLOWED_LAWS = Object.values(LAW).map((l) => ({ law: l.law, section: l.section, covers: l.covers }));
const CATS: AiCategory[] = ['safe', 'abuse', 'threat_violence', 'sexual_threat', 'sextortion', 'stalking', 'scam', 'self_harm', 'other'];
const RISKS: AiRisk[] = ['none', 'low', 'medium', 'high', 'emergency'];

export function systemPrompt(mode: AiRequest['mode']): string {
  return [
    'You are Solace, a calm digital-safety assistant for students and families in India. You analyse ONE message or chat that the user received (or, in draft mode, is about to send).',
    'The text may be English, Hindi or Hinglish and may use disguised spellings (f*ck, ill = I will).',
    'Reply with ONE JSON object only, no markdown, with exactly these keys:',
    '{"category": one of ' + CATS.map((c) => `"${c}"`).join('|') + ',',
    ' "serious": boolean (true only for threats of violence or sexual violence, sextortion/blackmail, stalking, scams, self-harm risk),',
    ' "risk": one of "none"|"low"|"medium"|"high"|"emergency" (emergency only if the person may be in physical danger now),',
    ' "summary": string (max 2 sentences, plain words, speak to the user as "you"),',
    ' "why": string[] (max 4, quote the exact words that matter),',
    ' "do": string[] (max 6 concrete steps), "dont": string[] (max 4),',
    ' "technical": string[] (max 5; ONLY if serious: what the sender can realistically do and how to cut it off, e.g. bluff vs real images, morphed fakes, tracking via location tags, OTP misuse, traceability of Indian vs foreign numbers; else []),',
    ' "legal": array of {"law","section","why"} (ONLY if serious; choose ONLY from the allowed list below, copy law and section exactly; else []),',
    ' "replies": string[] (max 2 short, calm replies the user could send, or [] if replying is unsafe e.g. sextortion),',
    ' "rewrite": string|null (draft mode only: a kinder version of the user\'s draft; otherwise null)}',
    'Rules: Ordinary insults or swearing are "abuse", serious=false, and must get NO legal list — give practical help (ignore, block, restrict, report, talk to someone).',
    'Never tell the user to pay, send images, meet the sender or confront them. For danger now say call 112. Money fraud: call 1930. Report online: cybercrime.gov.in. Intimate images: StopNCII.org. Under 18: Childline 1098.',
    'Do not claim certainty about the law; laws "may apply". Do not invent facts about the sender.',
    `Mode: ${mode}.`,
    'Allowed legal list: ' + JSON.stringify(ALLOWED_LAWS),
  ].join('\n');
}

function strArr(v: unknown, max: number, len = 400): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, max).map((x) => x.trim().slice(0, len)) : [];
}

/** Parse + validate the model's JSON. Throws if unusable. */
export function parseAiAnswer(raw: string, model: string): AiAnswer {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) throw new Error('Groq did not return JSON.');
    try { obj = JSON.parse(m[0]); } catch { throw new Error('Groq returned malformed JSON.'); }
  }
  const category = CATS.includes(obj.category as AiCategory) ? (obj.category as AiCategory) : 'other';
  const risk = RISKS.includes(obj.risk as AiRisk) ? (obj.risk as AiRisk) : 'low';
  const summary = typeof obj.summary === 'string' ? obj.summary.trim().slice(0, 500) : '';
  if (!summary) throw new Error('Groq’s answer had no summary.');
  const serious = obj.serious === true;
  const legalIn = Array.isArray(obj.legal) ? obj.legal : [];
  const legal: AiAnswer['legal'] = [];
  let dropped = 0;
  for (const l of legalIn.slice(0, 10)) {
    const o = l as Record<string, unknown>;
    const hit = ALLOWED_LAWS.find((a) => a.law === o.law && a.section === o.section);
    if (hit && serious) legal.push({ law: hit.law, section: hit.section, why: typeof o.why === 'string' ? o.why.slice(0, 300) : hit.covers });
    else dropped++;
  }
  return {
    category, serious, risk, summary,
    why: strArr(obj.why, 4), do: strArr(obj.do, 6), dont: strArr(obj.dont, 4),
    technical: serious ? strArr(obj.technical, 5) : [],
    legal: dedupe(legal), replies: strArr(obj.replies, 2, 250),
    rewrite: typeof obj.rewrite === 'string' && obj.rewrite.trim() ? obj.rewrite.trim().slice(0, 1000) : null,
    droppedLegal: dropped, model,
  };
}

function dedupe(l: AiAnswer['legal']) {
  const s = new Set<string>();
  return l.filter((x) => (s.has(x.law + x.section) ? false : (s.add(x.law + x.section), true)));
}

export function validateKey(key: string): string | null {
  if (!key) return 'Add your Groq API key in Settings first.';
  if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) return 'That doesn’t look like a Groq API key (it should start with “gsk_”).';
  return null;
}

async function call(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal, credentials: 'omit' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Could not reach Groq. Check your internet connection, or allow access to api.groq.com when Solace asks.');
  }
}

function httpError(status: number, body: string): Error {
  if (status === 401) return new Error('Groq rejected the API key (401). Check it in Settings.');
  if (status === 404) return new Error('That Groq model is not available (404). Pick another model in Settings.');
  if (status === 429) return new Error('Groq rate limit reached (429). Wait a minute and try again.');
  let msg = '';
  try { msg = JSON.parse(body)?.error?.message ?? ''; } catch { /* ignore */ }
  return new Error(`Groq error ${status}${msg ? `: ${String(msg).slice(0, 160)}` : ''}.`);
}

export async function askGroq(req: AiRequest, cfg: { apiKey: string; model: string }, signal?: AbortSignal): Promise<AiAnswer> {
  const keyErr = validateKey(cfg.apiKey);
  if (keyErr) throw new Error(keyErr);
  const user = JSON.stringify({
    message: req.text.slice(0, 6000),
    context: { sender_unknown: !!req.anonymous, target_under_18: !!req.minor },
    local_trustlens_findings: req.local,
  });
  const res = await call(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt(req.mode) }, { role: 'user', content: user }],
    }),
  }, signal);
  const body = await res.text();
  if (!res.ok) throw httpError(res.status, body);
  let content = '';
  try { content = JSON.parse(body)?.choices?.[0]?.message?.content ?? ''; } catch { throw new Error('Unexpected response from Groq.'); }
  return parseAiAnswer(content, cfg.model);
}

export async function testGroq(cfg: { apiKey: string; model: string }): Promise<string> {
  const keyErr = validateKey(cfg.apiKey);
  if (keyErr) throw new Error(keyErr);
  const res = await call(GROQ_MODELS_URL, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  const body = await res.text();
  if (!res.ok) throw httpError(res.status, body);
  const ids: string[] = (JSON.parse(body)?.data ?? []).map((m: { id: string }) => m.id);
  if (!ids.includes(cfg.model)) throw new Error(`Key works, but model “${cfg.model}” isn’t available. Available: ${ids.filter((i) => !/whisper|guard|orpheus|tts/.test(i)).slice(0, 8).join(', ')}`);
  return `Connected. Model ${cfg.model} is available.`;
}
