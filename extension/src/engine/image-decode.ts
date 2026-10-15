/**
 * Browser-only image codec helpers (work in pages and Web Workers).
 * Decoding uses createImageBitmap; JPEG-90 re-encoding uses OffscreenCanvas.
 */
import { IMAGE } from '../shared/constants';
import type { RGBAImage } from './pixels';

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function ctx2d(c: OffscreenCanvas | HTMLCanvasElement) {
  const ctx = (c as OffscreenCanvas).getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas is not available');
  return ctx;
}

export interface Decoded {
  pixels: RGBAImage;
  originalWidth: number;
  originalHeight: number;
}

/** Decode bytes to RGBA, flatten transparency onto white, downscale to maxAnalysisSide. */
export async function decodeImage(bytes: Uint8Array, maxSide: number = IMAGE.maxAnalysisSide): Promise<Decoded> {
  const blob = new Blob([bytes]);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions);
  } catch {
    throw new Error('This file could not be decoded as an image (unsupported or corrupted).');
  }
  const ow = bmp.width, oh = bmp.height;
  if (ow < IMAGE.minSide || oh < IMAGE.minSide) {
    bmp.close();
    throw new Error(`Image is too small to analyse (${ow}×${oh}; minimum ${IMAGE.minSide}px).`);
  }
  const scale = Math.min(1, maxSide / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * scale)), h = Math.max(1, Math.round(oh * scale));
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const data = ctx.getImageData(0, 0, w, h).data;
  return { pixels: { width: w, height: h, data }, originalWidth: ow, originalHeight: oh };
}

/** JPEG(quality 0.9) round trip used by ELA. */
export async function recompressJpeg90(img: RGBAImage): Promise<RGBAImage | null> {
  try {
    const c = makeCanvas(img.width, img.height);
    const ctx = ctx2d(c);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    let blob: Blob;
    if ('convertToBlob' in c) blob = await c.convertToBlob({ type: 'image/jpeg', quality: IMAGE.ela.quality });
    else {
      blob = await new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', IMAGE.ela.quality));
    }
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions);
    const c2 = makeCanvas(img.width, img.height);
    const ctx2 = ctx2d(c2);
    ctx2.drawImage(bmp, 0, 0);
    bmp.close();
    return { width: img.width, height: img.height, data: ctx2.getImageData(0, 0, img.width, img.height).data };
  } catch {
    return null;
  }
}
