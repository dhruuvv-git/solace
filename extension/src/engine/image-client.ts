/**
 * UI-facing entry point for image analysis. Runs in a Web Worker when
 * possible and falls back to the main thread (same code) otherwise.
 */
import { IMAGE } from '../shared/constants';
import type { ImageAnalysisResult } from '../shared/types';
import { analyzeImage } from './image-analysis';
import { decodeImage, recompressJpeg90 } from './image-decode';
import { dHash, type HashEntry } from './known-fakes';
import { sniffFormat } from './metadata-analysis';
import type { WorkerMessage } from './image-worker';

export interface AnalyzeOptions {
  name: string;
  caption?: string;
  userHashes?: HashEntry[];
  threshold?: number;
  onProgress?: (step: string, fraction: number) => void;
  signal?: AbortSignal;
}

export function validateImageBytes(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'The file is empty.';
  if (bytes.length > IMAGE.maxBytes) return `The file is too large (${(bytes.length / 1048576).toFixed(1)} MB). The limit is ${IMAGE.maxBytes / 1048576} MB.`;
  const f = sniffFormat(bytes);
  if (f === 'unknown') return 'This does not look like a JPEG, PNG, WebP or GIF image.';
  return null;
}

async function onMainThread(bytes: Uint8Array, o: AnalyzeOptions): Promise<ImageAnalysisResult> {
  o.onProgress?.('Decoding image', 0.02);
  const d = await decodeImage(bytes);
  return analyzeImage({
    bytes, name: o.name, pixels: d.pixels, originalWidth: d.originalWidth, originalHeight: d.originalHeight,
    recompress: recompressJpeg90, caption: o.caption, userHashes: o.userHashes ?? null, threshold: o.threshold, onProgress: o.onProgress,
  });
}

export async function analyzeImageBytes(bytes: Uint8Array, o: AnalyzeOptions): Promise<ImageAnalysisResult> {
  const err = validateImageBytes(bytes);
  if (err) throw new Error(err);
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./image-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (!worker) return onMainThread(bytes, o);
  const w = worker;
  return new Promise<ImageAnalysisResult>((resolve, reject) => {
    let settled = false;
    const done = () => { settled = true; w.terminate(); };
    o.signal?.addEventListener('abort', () => { if (!settled) { done(); reject(new Error('Analysis cancelled.')); } });
    w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') o.onProgress?.(m.step, m.fraction);
      else if (m.type === 'result') { done(); resolve(m.result); }
      else { done(); reject(new Error(m.message)); }
    };
    w.onerror = () => {
      // Worker could not start (e.g. blocked by CSP) - run the same code on the main thread.
      if (settled) return;
      done();
      onMainThread(bytes, o).then(resolve, reject);
    };
    const copy = bytes.slice().buffer;
    w.postMessage({ bytes: copy, name: o.name, caption: o.caption, userHashes: o.userHashes, threshold: o.threshold }, [copy]);
  });
}

export async function hashImageBytes(bytes: Uint8Array): Promise<string> {
  const d = await decodeImage(bytes, 512);
  return dHash(d.pixels);
}
