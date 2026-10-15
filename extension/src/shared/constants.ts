/**
 * Every tunable number in Solace lives here, with the reason it was chosen.
 * None of these values were fitted on a labelled evaluation set: they are
 * documented engineering defaults. Calibrate them before relying on scores.
 */

/* ---------------- Shield 1: Bayesian fusion ---------------- */

export const FUSION = {
  /**
   * Prior probability pi that an image is manipulated/AI-generated.
   * 0.5 = neutral: we have no base-rate data, so the verdict is driven by
   * evidence only. log(pi/(1-pi)) = 0.
   */
  prior: 0.5,
  /**
   * Binary decision: P(fake) >= threshold -> "Likely fake", else "Likely real".
   * 0.5 = equal costs. (Cost-based rule: t = C_FP / (C_FP + C_FN); with equal
   * costs t = 0.5. Raise it in Settings if false accusations matter more.)
   */
  threshold: 0.5,
  costFalsePositive: 1,
  costFalseNegative: 1,
  /** Confidence from distance to 0.5: |P - 0.5| >= high -> high, >= medium -> medium, else low. */
  confidence: { high: 0.3, medium: 0.15 },
  /** Each log-LR is clamped to this range so no single heuristic dominates. */
  maxAbsLogLR: 3,
  /** |contribution| below this is shown as "neutral". */
  neutralBand: 0.15,
  /**
   * Messenger recompression (WhatsApp, Instagram, Telegram ...) re-encodes the
   * JPEG at quality ~70-85 and strips metadata. That wipes out the compression
   * traces ELA relies on and makes phone processing (portrait blur, HDR) look
   * like inconsistent noise. When a JPEG has no camera metadata and an
   * estimated quality at or below `recompressedMaxQuality`, the ELA and noise
   * weights are multiplied by `recompressedPixelWeight`.
   */
  recompressedMaxQuality: 85,
  recompressedPixelWeight: 0.35,
  /** Reliability weights w_i. */
  weights: {
    metadata: 1.0,
    ela: 0.6,
    spectral: 0.5,
    noise: 0.6,
    knownFake: 1.0,
    text: 0.5,
    shape: 0.8,
  },
} as const;

/* ---------------- Shield 1: signal parameters ---------------- */

export const IMAGE = {
  maxBytes: 15 * 1024 * 1024,
  /** Images larger than this (long side) are downscaled before pixel analysis. */
  maxAnalysisSide: 2048,
  minSide: 32,
  ela: {
    quality: 0.9,
    blockSize: 8,
    /**
     * logLR = clamp(k * (CV - cv0), lo, hi). cv0 is the CV at which ELA is
     * treated as uninformative. Values below suggest uniform compression.
     * Defaults were sanity-checked on 13 public-domain test photos (scikit-image
     * sample data) where block CV ranged 0.24-0.96; they are NOT a trained fit.
     * The negative side is capped at -0.3: even error is weak evidence of authenticity.
     */
    cv0: 1.0,
    k: 1.0,
    lo: -0.3,
    hi: 1.5,
  },
  spectral: {
    size: 256,
    /** Fit band in cycles per crop (radial frequency). */
    fMin: 4,
    fMax: 96,
    /** Reference slope for natural images (power spectrum ~ 1/f^2). */
    reference: 2,
    /** Test photos measured alpha 1.3-3.9, so only deviations above 1.0 count as suspicious. */
    dev0: 1.0,
    k: 0.8,
    lo: -0.3,
    hi: 1.5,
    minR2: 0.6,
  },
  noise: {
    blockSize: 32,
    /** Blocks whose mean luminance is outside [lo,hi] are skipped (clipping hides noise). */
    lumaLo: 12,
    lumaHi: 243,
    minBlocks: 6,
    /**
     * Test photos ranged 0.1-3.4 on the smooth-block statistic, and a real
     * WhatsApp-forwarded phone photo (portrait blur + screen glare) measured 2.8,
     * so only values above 3.0 vote "manipulated".
     */
    inc0: 3.0,
    k: 0.6,
    lo: -0.3,
    hi: 1.2,
  },
  dhash: {
    matchDistance: 10,
    /** log LR for a near-duplicate of a known fake. No match contributes 0. */
    matchLogLR: 3,
  },
} as const;

/* ---------------- Shield 1: misinformation logistic model ---------------- */

export const MISINFO = {
  beta0: -2.0,
  /** per urgency phrase, counted up to `urgencyCap` */
  betaUrgency: 0.9,
  urgencyCap: 3,
  /** times the share of upper-case letters (0..1); only when >= 20 Latin letters */
  betaCaps: 3.0,
  capsMinLetters: 20,
  /** per '!' up to `exclaimCap` */
  betaExclaim: 0.35,
  exclaimCap: 5,
  /** 1 when no link and no attribution phrase found */
  betaNoSource: 1.0,
  levels: { medium: 0.35, high: 0.65 },
  /** In image fusion, text log-odds are multiplied by this before the weight. */
  fusionScale: 0.5,
} as const;

/* ---------------- Shield 2: toxicity & patterns ---------------- */

export const TOXICITY = {
  /** untargetedProfanity: swearing not aimed at anyone ("this movie was fucking good") counts half. */
  modifiers: { targeted: 1.5, negated: 0.3, emphasis: 1.2, reported: 0.4, untargetedProfanity: 0.5 },
  /** words around a match inspected for "you"/negation */
  targetWindow: 4,
  negationWindow: 3,
  levels: { mild: 0.25, hurtful: 0.5, severe: 0.8 },
} as const;

export const PATTERN = {
  /** daily decay factor lambda */
  lambda: 0.8,
  /** alert when S_sender > theta. One message can add at most 1, so one message never alerts. */
  theta: 2.0,
  /** severity regression needs at least this many events */
  minEventsForSlope: 3,
  /** slope (toxicity per day) above which we say "escalating" */
  escalationSlope: 0.02,
  /** events older than this are dropped from storage */
  retentionDays: 60,
  /** a message must reach this toxicity to be recorded as an event */
  minSeverity: 0.25,
} as const;

/* ---------------- Shield 3: identity ---------------- */

export const IDENTITY = {
  simThreshold: 0.85,
  profile: {
    beta0: -2.2,
    betaNew: 1.2,
    /** following/(followers+1), capped at ratioCap before multiplying */
    betaRatio: 0.25,
    ratioCap: 10,
    betaFewPosts: 0.9,
    fewPostsBelow: 3,
    betaMoney: 2.5,
    levels: { medium: 0.35, high: 0.65 },
  },
} as const;

/* ---------------- Shield 4: threats ---------------- */

export const THREAT = {
  severity: { abuse: 2, scam: 3, stalking: 4, sextortion: 4, physical: 5 },
  levels: [
    { max: 4, level: 'low' },
    { max: 9, level: 'medium' },
    { max: 16, level: 'high' },
    { max: 25, level: 'emergency' },
  ],
  /** lines from the other person at or above this count as "repeated contact" */
  repeatedLines: 5,
} as const;

/* ---------------- Game ---------------- */

export const ELO = { K: 32, startRating: 1200 } as const;

/* ---------------- India help lines ---------------- */

export const HELP = {
  emergency: { label: 'Emergency (police, ambulance)', value: '112', href: 'tel:112' },
  cyberHelpline: { label: 'Cyber Crime Helpline', value: '1930', href: 'tel:1930' },
  cyberPortal: {
    label: 'National Cyber Crime Reporting Portal',
    value: 'cybercrime.gov.in',
    href: 'https://cybercrime.gov.in/',
  },
} as const;

/* ---------------- Shield 1: size & file-name signal ---------------- */

export const SHAPE = {
  /** Output sizes of popular generators (either orientation). */
  generatorSizes: [
    [256, 256], [512, 512], [768, 768], [1024, 1024], [2048, 2048],
    [1024, 1792], [1024, 1536], [896, 1152], [832, 1216], [768, 1344], [640, 1536], [768, 1024], [1152, 2048],
    [1536, 2688], [1216, 832], [1344, 768], [1536, 640], [1408, 1408], [1792, 2304],
    // Midjourney defaults (16:9, 4:3, 3:2) and other common generator presets
    [1456, 816], [1232, 928], [1344, 896], [1312, 816], [1664, 928], [2912, 1632], [2464, 1856], [1152, 896],
  ] as [number, number][],
  logLR: {
    aiFileName: 2.5,
    exactGeneratorSize: 1.4,
    squareMultipleOf64: 1.0,
    multipleOf64: 0.5,
    cameraAspect: -0.9,
    cameraFileName: -0.8,
    screenshotName: 0.0,
  },
  /** Camera aspect ratios: 4:3, 3:2, 16:9, 1:1.33 etc. (tolerance 1.5%) */
  cameraAspects: [4 / 3, 3 / 2, 16 / 9, 19.5 / 9, 20 / 9],
  range: [-1.5, 3] as [number, number],
} as const;
