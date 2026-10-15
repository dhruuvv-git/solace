/**
 * Shared TypeScript types for the Solace engine, extension and landing page.
 * Every analysis result carries an id, a kind discriminant, a timestamp,
 * explanations and limitations, so the UI never has to invent wording.
 */

export type Lang = 'en' | 'hi';

/* ------------------------------------------------------------------ */
/* Shield 1 - Is it real?                                              */
/* ------------------------------------------------------------------ */

export type SignalId = 'metadata' | 'ela' | 'spectral' | 'noise' | 'knownFake' | 'text' | 'shape';

/**
 * supports-real: evidence pushes toward "real" (negative log LR)
 * suspicious:    evidence pushes toward "fake" (positive log LR)
 * neutral:       signal ran but is close to zero
 * unavailable:   signal could not run; it contributes NOTHING to fusion
 */
export type SignalStatus = 'supports-real' | 'suspicious' | 'neutral' | 'unavailable';

interface SignalBase {
  name: string;
  status: SignalStatus;
  /** Heuristic log likelihood ratio, null when unavailable. */
  logLR: number | null;
  /** Reliability weight w_i used in fusion. */
  weight: number;
  /** w_i * log LR_i, null when unavailable. */
  contribution: number | null;
  /** Primary measured value (CV, alpha, distance ...) for display. */
  value?: number;
  valueLabel?: string;
  summary: string;
  details: string[];
  limitations: string[];
  unavailableReason?: string;
}

export interface MetadataFinding {
  key: string;
  value: string;
  /** Why this finding matters. */
  note?: string;
  flag?: 'ai-tool' | 'ai-prompt' | 'editor' | 'camera' | 'info';
}

export interface MetadataData {
  format: ImageFormat;
  hasExif: boolean;
  hasPngText: boolean;
  findings: MetadataFinding[];
  /** Estimated JPEG quality (1-100) from the luminance quantisation table, null if not a JPEG. */
  jpegQuality: number | null;
  /** Camera make or model present in EXIF. */
  hasCamera: boolean;
  /** Number of camera capture fields found (exposure, f-number, ISO, focal length, lens, capture time). */
  captureFields: number;
  hasGps: boolean;
  /** A C2PA / Content Credentials manifest is embedded (contents not cryptographically verified). */
  hasC2pa: boolean;
}

export interface ElaData {
  cols: number;
  rows: number;
  blockSize: number;
  /** Mean absolute error per block, row-major. */
  blocks: number[];
  mean: number;
  std: number;
  cv: number;
  originalWasJpeg: boolean;
}

export interface SpectralData {
  alpha: number;
  intercept: number;
  r2: number;
  deviation: number;
  /** Points of the log-log radial spectrum used for the fit. */
  points: { logF: number; logP: number }[];
  /** All radial bins (for the chart), including those outside the fit band. */
  allPoints: { logF: number; logP: number; inFit: boolean }[];
  cropSize: number;
  resampled: boolean;
}

export interface NoiseData {
  cols: number;
  rows: number;
  blockSize: number;
  /** Residual variance per block, NaN where block was excluded (saturated). */
  variances: number[];
  mean: number;
  std: number;
  inconsistency: number;
  usedBlocks: number;
}

export interface HashMatch {
  id: string;
  label: string;
  dataset: 'bundled-demo' | 'user-local';
  distance: number;
  note?: string;
}

export interface KnownFakeData {
  hash: string;
  matches: HashMatch[];
  bundledCount: number;
  userCount: number;
  datasetAvailable: boolean;
}

export type SignalResult =
  | (SignalBase & { id: 'metadata'; data?: MetadataData })
  | (SignalBase & { id: 'ela'; data?: ElaData })
  | (SignalBase & { id: 'spectral'; data?: SpectralData })
  | (SignalBase & { id: 'noise'; data?: NoiseData })
  | (SignalBase & { id: 'knownFake'; data?: KnownFakeData })
  | (SignalBase & { id: 'text'; data?: MisinformationResult })
  | (SignalBase & { id: 'shape'; data?: ShapeData });

export interface ShapeData {
  width: number;
  height: number;
  aspect: number;
  fileName: string;
  findings: { label: string; logLR: number }[];
}

export type RealVerdict = 'likely-real' | 'likely-fake';
export type Confidence = 'high' | 'medium' | 'low';

export interface FusionTerm {
  id: SignalId;
  name: string;
  contribution: number;
}

export interface FusionResult {
  prior: number;
  priorLogOdds: number;
  terms: FusionTerm[];
  logOdds: number;
  pFake: number;
  verdict: RealVerdict;
  confidence: Confidence;
  /** Decision threshold on P(fake). */
  threshold: number;
  /** Theoretical single cost-based threshold t = C_FP/(C_FP+C_FN). */
  costThreshold: number;
  availableCount: number;
  /** Sum of |contribution| - how much evidence there was at all. */
  evidenceStrength: number;
  reasons: string[];
}

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown';

export interface ImageAnalysisResult {
  kind: 'image';
  id: string;
  timestamp: string;
  file: {
    name: string;
    size: number;
    format: ImageFormat;
    width: number;
    height: number;
    analyzedWidth: number;
    analyzedHeight: number;
    downscaled: boolean;
  };
  hash: string | null;
  /** Detected processing context that changes how much pixel signals are trusted. */
  context: { recompressed: boolean; jpegQuality: number | null; pixelWeightFactor: number; note: string | null };
  signals: SignalResult[];
  fusion: FusionResult;
  explanation: string;
  limitations: string[];
  nextActions: string[];
}

export interface FeatureContribution {
  id: string;
  label: string;
  value: number;
  beta: number;
  contribution: number;
  evidence: string[];
}

export interface MisinformationResult {
  kind: 'misinformation';
  id: string;
  timestamp: string;
  p: number;
  logit: number;
  intercept: number;
  level: 'low' | 'medium' | 'high';
  features: FeatureContribution[];
  explanation: string;
  limitations: string[];
  correction: { en: string; hi: string };
}

/* ------------------------------------------------------------------ */
/* Shield 2 - Is it kind?                                              */
/* ------------------------------------------------------------------ */

export type HarmCategory = 'insult' | 'profanity' | 'threat' | 'body-shaming' | 'identity-hate' | 'sexual-harassment';

export interface LexiconEntry {
  /** Lower-case term or phrase; matched on word boundaries. */
  term: string;
  category: HarmCategory;
  weight: number;
  lang: 'en' | 'hi' | 'hinglish';
  /** Optional kinder replacement used by "Think Before You Send". */
  softer?: string;
}

export interface ToxicityMatch {
  term: string;
  matchedText: string;
  index: number;
  category: HarmCategory;
  weight: number;
  modifiers: { targeted: boolean; negated: boolean; emphasis: boolean; reported: boolean };
  multiplier: number;
  contribution: number;
}

export type ToxicityLevel = 'none' | 'mild' | 'hurtful' | 'severe';

export interface ToxicityResult {
  kind: 'toxicity';
  id: string;
  timestamp: string;
  S: number;
  toxicity: number;
  level: ToxicityLevel;
  categories: HarmCategory[];
  primaryCategory: HarmCategory | null;
  matches: ToxicityMatch[];
  reportedSpeech: boolean;
  suggestion: string | null;
  explanation: string;
  limitations: string[];
}

export interface SenderEvent {
  ts: number;
  severity: number;
  category: HarmCategory | null;
  /** SHA-256 of the message text, used only to avoid double-counting. */
  msgHash: string;
}

export interface SenderPattern {
  /** Hashed, locally-salted sender key. */
  senderKey: string;
  /** Display label as seen by the user (stored locally only). */
  label: string;
  platform: string;
  score: number;
  lastTs: number;
  events: SenderEvent[];
}

export interface PatternAssessment {
  score: number;
  threshold: number;
  alert: boolean;
  eventCount: number;
  slopePerDay: number | null;
  escalating: boolean;
  explanation: string;
}

/* ------------------------------------------------------------------ */
/* Shield 3 - Is it really them?                                       */
/* ------------------------------------------------------------------ */

export interface DiffOp {
  op: 'equal' | 'sub' | 'ins' | 'del';
  a: string;
  b: string;
}

export interface UsernameSimilarity {
  kind: 'username';
  a: string;
  b: string;
  normA: string;
  normB: string;
  distance: number;
  sim: number;
  identical: boolean;
  flagged: boolean;
  threshold: number;
  diff: DiffOp[];
  substitutions: string[];
  explanation: string;
}

export interface ProfileInputs {
  username?: string;
  newAccount?: boolean | null;
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  asksMoneyOrOtp?: boolean | null;
  /** Where each value came from. */
  source?: Partial<Record<'newAccount' | 'followers' | 'following' | 'posts' | 'asksMoneyOrOtp', 'observed' | 'user'>>;
}

export interface ProfileFeature {
  id: 'newAccount' | 'ratio' | 'fewPosts' | 'asksMoneyOrOtp';
  label: string;
  available: boolean;
  value: number | null;
  display: string;
  beta: number;
  contribution: number;
  source?: 'observed' | 'user';
}

export interface ProfileRiskResult {
  kind: 'profile-risk';
  id: string;
  timestamp: string;
  p: number;
  logit: number;
  level: 'low' | 'medium' | 'high';
  features: ProfileFeature[];
  availableCount: number;
  explanation: string;
  missingPolicy: string;
}

/* ------------------------------------------------------------------ */
/* Shield 4 - Am I safe?                                               */
/* ------------------------------------------------------------------ */

export type ThreatCategory = 'sextortion' | 'scam' | 'stalking' | 'physical' | 'abuse';

export interface ThreatCategoryHit {
  category: ThreatCategory;
  severity: number;
  evidence: string[];
}

export type WarningSignId = 'personalDetails' | 'deadline' | 'ultimatum' | 'moneyDemand' | 'repeatedContact' | 'patternRising';

export interface WarningSign {
  id: WarningSignId;
  label: string;
  evidence: string[];
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'emergency';

export interface ActionPlan {
  do: string[];
  dont: string[];
  contacts: { label: string; value: string; href: string; note: string }[];
}

export interface ThreatAssessment {
  kind: 'threat';
  id: string;
  timestamp: string;
  hits: ThreatCategoryHit[];
  primary: ThreatCategory | null;
  categoryOverridden: boolean;
  severity: number;
  warningSigns: WarningSign[];
  likelihood: number;
  risk: number;
  level: RiskLevel;
  emergency: { triggered: boolean; evidence: string[] };
  actionPlan: ActionPlan;
  /** True when the threat is of sexual violence. */
  sexual: boolean;
  /** Legal + technical analysis — only for serious categories (not ordinary abuse). */
  guidance: import('../engine/legal-guidance').Guidance | null;
  /** Practical help for ordinary abusive messages. */
  abuse: import('../engine/legal-guidance').AbuseHelp | null;
  toxicityMatches: { text: string; category: string }[];
  explanation: string;
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Evidence Locker                                                     */
/* ------------------------------------------------------------------ */

export interface EvidenceRecord {
  id: string;
  createdAt: string;
  /** ISO timestamp included in the fingerprint. */
  timestamp: string;
  url: string;
  platform: 'whatsapp' | 'instagram' | 'web' | 'manual';
  senderLabel?: string;
  text: string;
  /** PNG/JPEG data URL, optional. */
  screenshot?: string;
  category?: string;
  severity?: number;
  riskScore?: number;
  riskLevel?: string;
  note?: string;
  source: 'context-menu' | 'side-panel' | 'safety-copilot' | 'in-page';
  fingerprint: string;
  fingerprintVersion: 1;
}

/* ------------------------------------------------------------------ */
/* Train Your Eye                                                      */
/* ------------------------------------------------------------------ */

export interface GameItem {
  id: string;
  src: string;
  label: 'real' | 'fake';
  title: string;
  explanation: string;
  cue: string;
  provenance: string;
  initialRating: number;
}

export interface GameState {
  userRating: number;
  itemRatings: Record<string, number>;
  answered: Record<string, number>;
  score: number;
  played: number;
  streak: number;
  bestStreak: number;
}

/* ------------------------------------------------------------------ */
/* Scan history (summaries plus a small local image cache for reports) */
/* ------------------------------------------------------------------ */

export interface HistoryEntry {
  id: string;
  ts: number;
  shield: 'real' | 'kind' | 'identity' | 'safety';
  title: string;
  outcome: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  /** Optional local image for a later, explicit report action. Never sent unless requested by the website. */
  imageData?: string;
  /** Optional message text/content for display and report drafting. */
  text?: string;
}

export type AnyResult =
  | ImageAnalysisResult
  | MisinformationResult
  | ToxicityResult
  | UsernameSimilarity
  | ProfileRiskResult
  | ThreatAssessment;
