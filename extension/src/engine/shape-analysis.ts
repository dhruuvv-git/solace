/**
 * Signal 7 - image size, shape and file name.
 *
 * AI generators output a small set of fixed sizes (1024×1024, 1024×1792,
 * 832×1216 …) whose sides are multiples of 64, and apps name downloads like
 * "ChatGPT Image …", "DALL·E …" or "Gemini_Generated_Image_…". Phone cameras
 * shoot 4:3 / 16:9 frames (4032×3024, or 1600×1200 after WhatsApp) and name
 * files IMG_1234, PXL_20261012_…, DSC_0042. Unlike metadata, the pixel size
 * survives WhatsApp re-saving (it only shrinks large photos, keeping the shape).
 *
 * Each finding has a documented log LR (constants SHAPE.logLR); the total is
 * clamped to SHAPE.range. Heuristic: images can be cropped or renamed.
 */
import { SHAPE } from '../shared/constants';
import type { ShapeData } from '../shared/types';
import { clamp } from './math';

const AI_NAME = /(chatgpt[ _-]?image|dall[·_ .-]?e|gpt[-_ ]?image|gemini[_ -]generated|imagen|midjourney|^mj[_-]|firefly|leonardo|stable[-_ ]?diffusion|sdxl|comfyui|flux[_ -]|ideogram|bing[_ -]?image|designer|copilot[_ -]?image|ai[_ -]?generated|generated[_ -]?image|_upscaled|nightcafe|playground[_ -]?ai|meta[_ -]?ai|grok[_ -]?image)/i;
const CAMERA_NAME = /^(img_\d{3,}|img\d{8}_\d{6}|pxl_\d{8}_\d+|dsc[_f]?\d{3,}|dscn\d{3,}|_dsc\d{3,}|p\d{7,}|\d{8}_\d{6}(_\d+)?|photo_\d{4}-\d{2}-\d{2}|cimg\d{3,}|gopr\d{3,}|mvimg_\d{8})/i;
const WHATSAPP_NAME = /^img-\d{8}-wa\d+/i;
const SCREENSHOT_NAME = /(screenshot|screen shot|scr_|snip)/i;

export interface ShapeAnalysis { data: ShapeData; logLR: number; summary: string; details: string[] }

export function analyzeShape(width: number, height: number, fileName: string): ShapeAnalysis {
  const L = SHAPE.logLR;
  const findings: ShapeData['findings'] = [];
  const name = (fileName || '').trim().split(/[\\/]/).pop() ?? '';
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const long = Math.max(w, h), short = Math.min(w, h);
  const aspect = long / short;

  if (AI_NAME.test(name)) findings.push({ label: `File name “${name.slice(0, 60)}” matches an AI image app’s download name`, logLR: L.aiFileName });
  else if (CAMERA_NAME.test(name)) findings.push({ label: `File name “${name.slice(0, 60)}” follows a camera/phone naming pattern`, logLR: L.cameraFileName });
  else if (WHATSAPP_NAME.test(name)) findings.push({ label: 'WhatsApp file name: says how it was shared, not how it was made', logLR: 0 });
  else if (SCREENSHOT_NAME.test(name)) findings.push({ label: 'Screenshot: a picture of a screen, judged on its other signals', logLR: L.screenshotName });

  const exact = SHAPE.generatorSizes.some(([a, b]) => (a === w && b === h) || (a === h && b === w));
  const m64 = w % 64 === 0 && h % 64 === 0;
  const cam = SHAPE.cameraAspects.find((r) => Math.abs(aspect - r) / r < 0.015);
  // Order matters: known generator presets first, then generator-style squares,
  // then camera frame shapes (phones and WhatsApp keep 4:3 / 16:9, e.g. 1600×1200,
  // 2560×1920), and only then the weaker "multiples of 64" hint.
  if (exact) findings.push({ label: `${w}×${h} is a standard AI-generator output size`, logLR: L.exactGeneratorSize });
  else if (m64 && w === h) findings.push({ label: `Square ${w}×${h} with sides in multiples of 64 (typical of generators)`, logLR: L.squareMultipleOf64 });
  else if (cam) findings.push({ label: `${w}×${h} has a camera frame shape (${cam === 4 / 3 ? '4:3' : cam === 3 / 2 ? '3:2' : cam === 16 / 9 ? '16:9' : 'phone screen'})`, logLR: L.cameraAspect });
  else if (m64) findings.push({ label: `Both sides are multiples of 64 (${w}×${h}), common for generators`, logLR: L.multipleOf64 });

  const raw = findings.reduce((s, f) => s + f.logLR, 0);
  const logLR = clamp(raw, SHAPE.range[0], SHAPE.range[1]);
  const summary = findings.length
    ? (logLR > 0.15 ? 'Size or name looks like an AI generator’s output.' : logLR < -0.15 ? 'Size and name look like a camera photo.' : 'Size and name give no clear hint.')
    : `${w}×${h}: not a camera frame shape and not a generator size.`;
  return {
    data: { width: w, height: h, aspect, fileName: name, findings },
    logLR,
    summary,
    details: findings.map((f) => `${f.label} (${f.logLR > 0 ? '+' : ''}${f.logLR.toFixed(1)}).`),
  };
}
