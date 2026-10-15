/**
 * Settings and small key/value state. Uses chrome.storage.local inside the
 * extension and localStorage on the landing page (same API either way).
 */
import { FUSION, PATTERN } from './constants';
import type { LexiconEntry } from './types';

export interface Settings {
  whatsappEnabled: boolean;
  instagramEnabled: boolean;
  /** Blur visible messages/comments that match the hurtful-language rules. */
  abuseShieldBlur: boolean;
  /** Warn while typing in supported WhatsApp/Instagram composers. */
  composerWarnings: boolean;
  /** Show the small floating Solace button on WhatsApp/Instagram. */
  floatingButton: boolean;
  /** Record hashed sender + score for the Pattern Detector (Abuse Shield & Kind checks). */
  patternTracking: boolean;
  /** Keep a local list of scan summaries (never message content). */
  scanHistory: boolean;
  /** Save Safety Copilot analyses to the Evidence Locker automatically (user-initiated analyses only). */
  autoSaveSafetyEvidence: boolean;
  safetyIntroSeen: boolean;
  /** Include a screenshot when saving evidence from a page. */
  includeScreenshots: boolean;
  /** Call an image "Likely fake" when P(fake) is at least this value. */
  threshold: number;
  patternTheta: number;
  customLexicon: LexiconEntry[];
  /** Optional: let Groq (cloud AI) answer message checks. Off by default; sends the message to Groq. */
  aiEnabled: boolean;
  /** User's own Groq API key, stored only in this browser. */
  groqApiKey: string;
  groqModel: string;
  /** Your website (overrides solace.config.json appUrl when set). */
  websiteUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  whatsappEnabled: true,
  instagramEnabled: true,
  abuseShieldBlur: true,
  composerWarnings: true,
  floatingButton: true,
  patternTracking: false,
  scanHistory: true,
  autoSaveSafetyEvidence: true,
  safetyIntroSeen: false,
  includeScreenshots: true,
  threshold: FUSION.threshold,
  patternTheta: PATTERN.theta,
  customLexicon: [],
  aiEnabled: false,
  groqApiKey: '',
  groqModel: 'openai/gpt-oss-120b',
  websiteUrl: '',
};

const hasChromeStorage = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try {
    if (hasChromeStorage()) {
      const r = await chrome.storage.local.get(key);
      return (r[key] as T) ?? fallback;
    }
    const raw = localStorage.getItem(`trustlens:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(`trustlens:${key}`, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('trustlens-kv', { detail: { key } }));
}

export async function kvRemove(key: string): Promise<void> {
  if (hasChromeStorage()) await chrome.storage.local.remove(key);
  else localStorage.removeItem(`trustlens:${key}`);
}

export function sanitizeSettings(s: Partial<Settings>): Settings {
  const out = { ...DEFAULT_SETTINGS, ...s };
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  out.threshold = num(out.threshold, 0.2, 0.8, DEFAULT_SETTINGS.threshold);
  delete (out as unknown as Record<string, unknown>).tLow;
  delete (out as unknown as Record<string, unknown>).tHigh;
  out.patternTheta = num(out.patternTheta, 1.01, 10, DEFAULT_SETTINGS.patternTheta);
  out.customLexicon = Array.isArray(out.customLexicon)
    ? out.customLexicon.filter((e) => e && typeof e.term === 'string' && e.term.trim().length >= 2 && e.term.length <= 60 && Number.isFinite(e.weight)).slice(0, 300)
    : [];
  out.websiteUrl = typeof out.websiteUrl === 'string' && /^https?:\/\/\S{3,300}$/.test(out.websiteUrl.trim()) ? out.websiteUrl.trim() : '';
  out.groqApiKey = typeof out.groqApiKey === 'string' ? out.groqApiKey.trim().slice(0, 200) : '';
  out.groqModel = typeof out.groqModel === 'string' && /^[\w./:-]{2,80}$/.test(out.groqModel) ? out.groqModel : DEFAULT_SETTINGS.groqModel;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof DEFAULT_SETTINGS[k] === 'boolean' && typeof out[k] !== 'boolean') (out as unknown as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
  }
  return out;
}

export async function getSettings(): Promise<Settings> {
  return sanitizeSettings(await kvGet<Partial<Settings>>('settings', {}));
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch });
  await kvSet('settings', next);
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  if (hasChromeStorage()) {
    const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings) cb(sanitizeSettings(changes.settings.newValue ?? {}));
    };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }
  const h = (e: Event) => { if ((e as CustomEvent).detail?.key === 'settings') getSettings().then(cb); };
  window.addEventListener('trustlens-kv', h);
  return () => window.removeEventListener('trustlens-kv', h);
}

/** Per-install random salt for hashing sender identifiers. */
export async function getSalt(): Promise<string> {
  let salt = await kvGet<string>('salt', '');
  if (!salt) {
    salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    await kvSet('salt', salt);
  }
  return salt;
}
