/**
 * Shield 1 orchestrator: runs the seven signals and fuses them.
 * Decoding / JPEG re-encoding is injected (see image-decode.ts for the
 * browser implementation) so this module stays pure and testable.
 */
import { FUSION, IMAGE, MISINFO } from '../shared/constants';
import type { ImageAnalysisResult, SignalResult } from '../shared/types';
import { fuse, statusFromContribution } from './bayesian-fusion';
import { computeEla, elaLogLR } from './ela-analysis';
import { BUNDLED_KNOWN_FAKES, dHashGray, findMatches, knownFakeLogLR, type HashEntry } from './known-fakes';
import { fmt, uid } from './math';
import { analyzeMetadata, sniffFormat } from './metadata-analysis';
import { analyzeMisinformation } from './misinformation';
import { analyzeNoise, noiseLogLR } from './noise-analysis';
import { toGray, type RGBAImage } from './pixels';
import { analyzeShape } from './shape-analysis';
import { analyzeSpectrum, spectralLogLR } from './spectral-analysis';

export interface ImageAnalysisInput {
  bytes: Uint8Array;
  name: string;
  /** Decoded pixels, already downscaled to ≤ maxAnalysisSide. */
  pixels: RGBAImage;
  /** P(fake) at or above this is called "likely fake" (default FUSION.threshold). */
  threshold?: number;
  originalWidth: number;
  originalHeight: number;
  /** Re-encode as JPEG quality 0.9 and decode again; null if not possible. */
  recompress: (img: RGBAImage) => Promise<RGBAImage | null>;
  caption?: string;
  userHashes?: HashEntry[] | null;
  bundledHashes?: HashEntry[] | null;
  onProgress?: (step: string, fraction: number) => void;
}

function finish<T extends SignalResult>(s: T): T {
  if (s.logLR === null) {
    s.contribution = null;
    s.status = 'unavailable';
  } else {
    s.contribution = s.weight * Math.max(-FUSION.maxAbsLogLR, Math.min(FUSION.maxAbsLogLR, s.logLR));
    s.status = statusFromContribution(s.contribution);
  }
  return s;
}

function unavailable<T extends SignalResult['id']>(id: T, name: string, weight: number, reason: string, limitations: string[] = []): SignalResult {
  return {
    id, name, weight, status: 'unavailable', logLR: null, contribution: null,
    summary: 'Unavailable', details: [], limitations, unavailableReason: reason,
  } as SignalResult;
}

export async function analyzeImage(input: ImageAnalysisInput): Promise<ImageAnalysisResult> {
  const progress = input.onProgress ?? (() => {});
  const W = FUSION.weights;
  const format = sniffFormat(input.bytes);
  const signals: SignalResult[] = [];
  const context: ImageAnalysisResult['context'] = { recompressed: false, jpegQuality: null, pixelWeightFactor: 1, note: null };

  /* 1. metadata */
  progress('Reading metadata', 0.05);
  try {
    const m = await analyzeMetadata(input.bytes);
    context.jpegQuality = m.data.jpegQuality;
    // Messenger-style recompression: JPEG, no camera metadata, low-ish quality.
    if (format === 'jpeg' && !m.data.hasCamera && m.data.jpegQuality !== null && m.data.jpegQuality <= FUSION.recompressedMaxQuality) {
      context.recompressed = true;
      context.pixelWeightFactor = FUSION.recompressedPixelWeight;
      context.note = `This looks like a re-saved copy (JPEG quality ≈ ${m.data.jpegQuality}, no camera data), as WhatsApp and Instagram produce. Re-saving erases editing traces and phone effects like portrait blur look uneven, so error-level and noise signals count only ${Math.round(FUSION.recompressedPixelWeight * 100)}% here.`;
    }
    const qualityLine = m.data.jpegQuality !== null ? [`Estimated JPEG quality ≈ ${m.data.jpegQuality} (from the quantisation table).`] : [];
    signals.push(finish({
      id: 'metadata', name: 'Metadata', weight: W.metadata, status: 'neutral', logLR: m.logLR, contribution: null,
      summary: m.summary, details: [...m.details, ...qualityLine], data: m.data,
      limitations: ['Missing metadata does not mean fake — messengers strip it.', 'Metadata can be edited, removed or copied from another file.', 'A software name alone is not proof of AI generation.'],
    }));
  } catch (e) {
    signals.push(unavailable('metadata', 'Metadata', W.metadata, `Could not parse metadata: ${(e as Error).message}`));
  }

  const gray = toGray(input.pixels);

  /* 2. ELA */
  progress('Error level analysis', 0.25);
  try {
    const re = await input.recompress(input.pixels);
    const ela = re ? computeEla(input.pixels, re) : null;
    if (!ela) {
      signals.push(unavailable('ela', 'Error level analysis', W.ela, re ? 'Image too small or uniform for block statistics.' : 'JPEG re-encoding is not available in this browser context.'));
    } else {
      ela.originalWasJpeg = format === 'jpeg';
      // ELA is designed for JPEG; for PNG/WebP the signal is weaker, so halve it.
      const lr = elaLogLR(ela.cv) * (ela.originalWasJpeg ? 1 : 0.5);
      signals.push(finish({
        id: 'ela', name: 'Error level analysis', weight: W.ela * context.pixelWeightFactor, status: 'neutral', logLR: lr, contribution: null,
        value: ela.cv, valueLabel: `CV = ${fmt(ela.cv)}`,
        summary: ela.cv > IMAGE.ela.cv0 ? 'Compression error is uneven across the image.' : 'Compression error is fairly even across the image.',
        details: [
          `Mean block error μ = ${fmt(ela.mean)}, spread σ = ${fmt(ela.std)}, CV = σ/μ = ${fmt(ela.cv)} (neutral point ${IMAGE.ela.cv0}).`,
          'Bright areas in the heatmap changed most when re-saved at quality 90. A pasted region often re-compresses differently from its surroundings.',
          ...(ela.originalWasJpeg ? [] : ['Input is not a JPEG, so this signal counts half.']),
          ...(context.recompressed ? [`Weight reduced to ${(W.ela * context.pixelWeightFactor).toFixed(2)}: the image was re-saved by an app, which hides editing traces.`] : []),
        ],
        data: ela,
        limitations: ['Edges, fine texture and repeated re-saving naturally raise error levels.', 'Uneven error is a hint to look closer, not proof of editing.'],
      }));
    }
  } catch (e) {
    signals.push(unavailable('ela', 'Error level analysis', W.ela, `ELA failed: ${(e as Error).message}`));
  }

  /* 3. spectral slope */
  progress('Frequency spectrum', 0.5);
  try {
    const sp = analyzeSpectrum(gray);
    if (!sp) signals.push(unavailable('spectral', 'Spectral slope', W.spectral, 'Image is too flat to measure a frequency spectrum.'));
    else {
      signals.push(finish({
        id: 'spectral', name: 'Spectral slope', weight: W.spectral, status: 'neutral', logLR: spectralLogLR(sp), contribution: null,
        value: sp.alpha, valueLabel: `α = ${fmt(sp.alpha)}`,
        summary: sp.deviation <= IMAGE.spectral.dev0 ? `Slope α = ${fmt(sp.alpha)} is close to the natural-image reference of 2.` : `Slope α = ${fmt(sp.alpha)} is ${fmt(sp.deviation)} away from the reference of 2.`,
        details: [
          `Fitted log P = ${fmt(sp.intercept)} − ${fmt(sp.alpha)}·log f over f = ${IMAGE.spectral.fMin}…${IMAGE.spectral.fMax} cycles (R² = ${fmt(sp.r2)}).`,
          'Generated or heavily processed images can have too much or too little fine detail compared with camera photos.',
          ...(sp.resampled ? ['Image is smaller than 256 px, so it was resampled; the estimate is less reliable.'] : []),
          ...(sp.r2 < IMAGE.spectral.minR2 ? ['The power law fits poorly here, so this signal was shrunk toward zero.'] : []),
        ],
        data: sp,
        limitations: ['α ≈ 2 is a statistical tendency of natural scenes, not a law.', 'Blur, noise reduction, screenshots, text and graphics all change α.'],
      }));
    }
  } catch (e) {
    signals.push(unavailable('spectral', 'Spectral slope', W.spectral, `Spectral analysis failed: ${(e as Error).message}`));
  }

  /* 4. noise consistency */
  progress('Noise consistency', 0.7);
  try {
    const nz = analyzeNoise(gray);
    if (!nz) signals.push(unavailable('noise', 'Noise consistency', W.noise, 'Not enough usable (non-saturated) 32×32 blocks.'));
    else {
      signals.push(finish({
        id: 'noise', name: 'Noise consistency', weight: W.noise * context.pixelWeightFactor, status: 'neutral', logLR: noiseLogLR(nz.inconsistency), contribution: null,
        value: nz.inconsistency, valueLabel: `σ/μ = ${fmt(nz.inconsistency)}`,
        summary: nz.inconsistency > IMAGE.noise.inc0 ? 'Fine-grain noise differs a lot between regions.' : 'Fine-grain noise is fairly consistent.',
        details: [
          `Residual R = I − blur(I) over ${nz.usedBlocks} blocks: μ(var) = ${fmt(nz.mean)}, σ(var) = ${fmt(nz.std)}, inconsistency = ${fmt(nz.inconsistency)} (neutral point ${IMAGE.noise.inc0}).`,
          'Parts taken from different photos or generated separately often carry different grain.',
          ...(context.recompressed ? [`Weight reduced to ${(W.noise * context.pixelWeightFactor).toFixed(2)}: app re-compression and portrait/HDR effects make grain uneven in genuine photos.`] : []),
        ],
        data: nz,
        limitations: ['Smooth sky next to textured grass naturally differs in residual noise.', 'Denoising, beauty filters and compression change noise patterns.'],
      }));
    }
  } catch (e) {
    signals.push(unavailable('noise', 'Noise consistency', W.noise, `Noise analysis failed: ${(e as Error).message}`));
  }

  /* 5. known-fake matching */
  progress('Matching known fakes', 0.85);
  let hash: string | null = null;
  try {
    hash = dHashGray(gray);
    const bundled = input.bundledHashes === undefined ? BUNDLED_KNOWN_FAKES : input.bundledHashes;
    const k = findMatches(hash, bundled, input.userHashes ?? null);
    if (!k.datasetAvailable) {
      signals.push({ ...unavailable('knownFake', 'Known-fake match', W.knownFake, 'No reference dataset is available.'), data: k } as SignalResult);
    } else {
      const best = k.matches[0]?.distance ?? null;
      const lr = knownFakeLogLR(best);
      const m = k.matches[0];
      signals.push(finish({
        id: 'knownFake', name: 'Known-fake match', weight: W.knownFake, status: 'neutral', logLR: lr, contribution: null,
        value: best ?? undefined, valueLabel: best === null ? 'no match' : `d = ${best}`,
        summary: m
          ? `Near-duplicate of “${m.label}” in the ${m.dataset === 'bundled-demo' ? 'bundled demonstration dataset' : 'your local reference list'} (distance ${m.distance}).`
          : `No match in ${k.bundledCount} bundled demo + ${k.userCount} local reference hashes.`,
        details: [
          `dHash = ${hash}. Match rule: Hamming distance d ≤ ${IMAGE.dhash.matchDistance}.`,
          'Only the bundled demonstration set and images you added locally are searched — not the internet.',
        ],
        data: k,
        limitations: ['No match is not evidence of authenticity.', 'Heavy crops, rotations or mirrored copies can defeat dHash.'],
      }));
    }
  } catch (e) {
    signals.push(unavailable('knownFake', 'Known-fake match', W.knownFake, `Hashing failed: ${(e as Error).message}`));
  }

  /* 6. caption / forward text */
  progress('Checking caption text', 0.92);
  const caption = input.caption?.trim();
  if (!caption) {
    signals.push(unavailable('text', 'Forward text', W.text, 'No caption or forwarded text was provided with this image.'));
  } else {
    const mi = analyzeMisinformation(caption);
    signals.push(finish({
      id: 'text', name: 'Forward text', weight: W.text, status: 'neutral', logLR: mi.logit * MISINFO.fusionScale, contribution: null,
      value: mi.p, valueLabel: `p = ${fmt(mi.p)}`,
      summary: mi.explanation, details: mi.features.filter((f) => f.contribution > 0).map((f) => `${f.label}: +${fmt(f.contribution)}`),
      data: mi, limitations: mi.limitations,
    }));
  }

  /* 7. size, shape and file name */
  const sh = analyzeShape(input.originalWidth, input.originalHeight, input.name);
  signals.push(finish({
    id: 'shape', name: 'Size & file name', weight: W.shape, status: 'neutral', logLR: sh.logLR, contribution: null,
    value: sh.data.aspect, valueLabel: `${sh.data.width}×${sh.data.height}`,
    summary: sh.summary, details: sh.details, data: sh.data,
    limitations: ['Images can be cropped to any size and renamed.', 'Right-clicked images from websites often have no meaningful file name.'],
  }));

  /* fusion */
  progress('Combining evidence', 0.97);
  const fusion = fuse(signals.map((s) => ({ id: s.id, name: s.name, logLR: s.logLR, weight: s.weight })), { threshold: input.threshold });
  const top = [...fusion.terms].sort((a, b) => (fusion.verdict === 'likely-fake' ? b.contribution - a.contribution : a.contribution - b.contribution))[0];
  const lead = top && Math.abs(top.contribution) > 0.15 ? ` Strongest evidence: ${top.name.toLowerCase()}.` : '';
  const conf = fusion.confidence === 'high' ? 'High confidence' : fusion.confidence === 'medium' ? 'Medium confidence' : 'Low confidence';
  const explanation =
    fusion.verdict === 'likely-fake'
      ? `${conf}: the evidence points to an edited or AI-made image (P = ${fmt(fusion.pFake)}).${lead}${fusion.confidence === 'low' ? ' The lean is slight, so treat it as a warning, not proof.' : ''}`
      : `${conf}: the evidence points to a genuine photo (P = ${fmt(fusion.pFake)}).${lead}${fusion.confidence === 'low' ? (context.recompressed ? ' This is an app-compressed copy with little evidence left, so the lean is slight.' : ' The lean is slight; very new AI images can slip through.') : ''}`;

  const downscaled = input.pixels.width !== input.originalWidth || input.pixels.height !== input.originalHeight;
  progress('Done', 1);
  return {
    kind: 'image',
    id: uid('img'),
    timestamp: new Date().toISOString(),
    file: {
      name: input.name, size: input.bytes.length, format,
      width: input.originalWidth, height: input.originalHeight,
      analyzedWidth: input.pixels.width, analyzedHeight: input.pixels.height, downscaled,
    },
    hash,
    context,
    signals,
    fusion,
    explanation,
    limitations: [
      ...(context.note ? [context.note] : []),
      'All seven signals are hand-tuned heuristics, not a trained detector. Weights are not calibrated on a labelled dataset.',
      'Modern AI generators can pass every signal; screenshots and messenger compression can trip them.',
      ...(downscaled ? [`Image was downscaled from ${input.originalWidth}×${input.originalHeight} to ${input.pixels.width}×${input.pixels.height} for analysis.`] : []),
    ],
    nextActions:
      fusion.verdict === 'likely-real'
        ? ['Still check who first posted it and when.', 'Look for the same image on a trusted news site.']
        : ['Do a reverse image search (Google Lens, TinEye) to find the original.', 'Check a fact-checker such as PIB Fact Check, Alt News or BOOM.', 'Ask the sender where it came from before forwarding.'],
  };
}
