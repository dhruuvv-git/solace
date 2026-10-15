/// <reference lib="webworker" />
/** Web Worker: decodes and analyses an image off the UI thread. */
import { analyzeImage } from './image-analysis';
import { decodeImage, recompressJpeg90 } from './image-decode';
import type { HashEntry } from './known-fakes';

export interface WorkerRequest {
  bytes: ArrayBuffer;
  name: string;
  caption?: string;
  userHashes?: HashEntry[];
  threshold?: number;
}

export type WorkerMessage =
  | { type: 'progress'; step: string; fraction: number }
  | { type: 'result'; result: Awaited<ReturnType<typeof analyzeImage>>; pixelsPreview?: undefined }
  | { type: 'error'; message: string };

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
  try {
    const bytes = new Uint8Array(ev.data.bytes);
    post({ type: 'progress', step: 'Decoding image', fraction: 0.02 });
    const decoded = await decodeImage(bytes);
    const result = await analyzeImage({
      bytes,
      name: ev.data.name,
      pixels: decoded.pixels,
      originalWidth: decoded.originalWidth,
      originalHeight: decoded.originalHeight,
      recompress: recompressJpeg90,
      caption: ev.data.caption,
      userHashes: ev.data.userHashes ?? null,
      threshold: ev.data.threshold,
      onProgress: (step, fraction) => post({ type: 'progress', step, fraction }),
    });
    post({ type: 'result', result });
  } catch (e) {
    post({ type: 'error', message: (e as Error).message || 'Image analysis failed.' });
  }
};
