/** Pixel-buffer helpers. Pure functions so they run in workers, pages and Node tests. */

export interface RGBAImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface GrayImage {
  width: number;
  height: number;
  data: Float64Array;
}

/** ITU-R BT.601 luma. */
export function toGray(img: RGBAImage): GrayImage {
  const { width, height, data } = img;
  const out = new Float64Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { width, height, data: out };
}

/** Area-average resample of a grayscale image (used by dHash and small crops). */
export function resizeGray(src: GrayImage, w: number, h: number): GrayImage {
  const out = new Float64Array(w * h);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy, y1 = (y + 1) * sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx, x1 = (x + 1) * sx;
      let sum = 0, area = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        if (yy < 0 || yy >= src.height) continue;
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        if (wy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          if (xx < 0 || xx >= src.width) continue;
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          if (wx <= 0) continue;
          const a = wx * wy;
          sum += src.data[yy * src.width + xx] * a;
          area += a;
        }
      }
      out[y * w + x] = area > 0 ? sum / area : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** 3x3 box blur with edge replication. */
export function boxBlur3(src: GrayImage): GrayImage {
  const { width: w, height: h, data } = src;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          s += data[yy * w + xx];
        }
      }
      out[y * w + x] = s / 9;
    }
  }
  return { width: w, height: h, data: out };
}
