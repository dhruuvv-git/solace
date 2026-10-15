/**
 * Signal 1 - metadata forensics on RAW image bytes (canvas strips metadata).
 *
 * Supported: JPEG (APP1 EXIF, APP1 XMP, COM), PNG (tEXt, iTXt, zTXt, eXIf),
 * WebP (EXIF, XMP chunks). Parsing is bounds-checked byte by byte; we never
 * treat arbitrary binary data as text - only payloads of text-typed fields.
 */
import type { ImageFormat, MetadataData, MetadataFinding } from '../shared/types';

export function sniffFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === 'GIF') return 'gif';
  return 'unknown';
}

function ascii(b: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = off; i < off + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Remove control characters and cap length so metadata can be shown safely. */
export function cleanText(s: string, max = 400): string {
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function utf8(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(b);
}

/* ------------------------- TIFF / EXIF ------------------------- */

const TIFF_TAGS: Record<number, string> = {
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x9003: 'DateTimeOriginal',
  0x9286: 'UserComment',
  0xa434: 'LensModel',
  0xa433: 'LensMake',
  0x9291: 'SubSecTimeOriginal',
  0x9011: 'OffsetTimeOriginal',
};

/** Numeric camera-capture tags (RATIONAL / SHORT / LONG). */
const NUMERIC_TAGS: Record<number, string> = {
  0x829a: 'ExposureTime',
  0x829d: 'FNumber',
  0x8827: 'ISO',
  0x920a: 'FocalLength',
  0x9209: 'Flash',
  0xa405: 'FocalLengthIn35mm',
  0xa402: 'ExposureMode',
  0xa403: 'WhiteBalance',
};

/** Parse a TIFF structure (EXIF payload without the "Exif\0\0" header). */
export function parseTiff(t: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (t.length < 8) return out;
  const le = t[0] === 0x49 && t[1] === 0x49;
  const be = t[0] === 0x4d && t[1] === 0x4d;
  if (!le && !be) return out;
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const u16 = (o: number) => (o + 2 <= t.length ? dv.getUint16(o, le) : -1);
  const u32 = (o: number) => (o + 4 <= t.length ? dv.getUint32(o, le) : -1);
  if (u16(2) !== 42) return out;

  const visited = new Set<number>();
  const readIfd = (off: number, depth: number) => {
    if (depth > 2 || off <= 0 || off + 2 > t.length || visited.has(off)) return;
    visited.add(off);
    const count = u16(off);
    if (count < 0 || count > 512) return;
    for (let i = 0; i < count; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > t.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      if (tag === 0x8769) {
        readIfd(u32(e + 8), depth + 1); // Exif sub-IFD
        continue;
      }
      if (tag === 0x8825) {
        out.GPS = 'present'; // GPS sub-IFD pointer (location itself is not read or shown)
        continue;
      }
      const num = NUMERIC_TAGS[tag];
      if (num && n >= 1) {
        if (type === 5 || type === 10) { // RATIONAL / SRATIONAL
          const at = u32(e + 8);
          if (at > 0 && at + 8 <= t.length) {
            const a = u32(at), b = u32(at + 4);
            if (b > 0) out[num] = num === 'ExposureTime' && a < b ? `1/${Math.round(b / Math.max(1, a))} s` : num === 'FNumber' ? `f/${(a / b).toFixed(1)}` : num === 'FocalLength' ? `${(a / b).toFixed(1)} mm` : (a / b).toFixed(2);
          }
        } else if (type === 3) out[num] = String(u16(e + 8)); // SHORT stored inline
        else if (type === 4) out[num] = String(u32(e + 8));
        continue;
      }
      const name = TIFF_TAGS[tag];
      if (!name) continue;
      // type 2 = ASCII, 7 = UNDEFINED (UserComment)
      if ((type === 2 || type === 7) && n > 0 && n < 65536) {
        const start = n <= 4 ? e + 8 : u32(e + 8);
        if (start < 0 || start + n > t.length) continue;
        let raw = t.subarray(start, start + n);
        if (type === 7 && name === 'UserComment' && raw.length >= 8) raw = raw.subarray(8); // charset header
        const text = cleanText(type === 2 ? latin1(raw) : utf8(raw));
        if (text) out[name] = text;
      }
    }
  };
  readIfd(u32(4), 0);
  return out;
}

/* ------------------------- containers ------------------------- */

interface RawMeta {
  exif: Record<string, string>;
  text: { key: string; value: string; compressedSkipped?: boolean }[];
  xmp: string | null;
  /** First luminance (table id 0) quantisation table, if found. */
  lumaQuant?: number[];
  /** Raw bytes of C2PA / JUMBF containers (JPEG APP11, PNG caBX, WebP C2PA). */
  c2pa?: Uint8Array[];
}

/** IJG standard luminance quantisation table (quality 50). Order does not matter for the sum. */
const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_SUM = STD_LUMA.reduce((a, b) => a + b, 0);

/**
 * Estimate JPEG quality from the luminance table using the IJG scaling rule:
 * scale S = 100·Σq/Σq_std; quality = (200 − S)/2 if S ≤ 100 else 5000/S.
 * Encoders with custom tables (some phones) give an approximate value.
 */
export function estimateJpegQuality(table: number[] | undefined): number | null {
  if (!table || table.length !== 64) return null;
  const S = (100 * table.reduce((a, b) => a + b, 0)) / STD_SUM;
  const q = S <= 100 ? (200 - S) / 2 : 5000 / S;
  return Math.max(1, Math.min(100, Math.round(q)));
}

function parseJpeg(b: Uint8Array): RawMeta {
  const meta: RawMeta = { exif: {}, text: [], xmp: null };
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) break;
    const seg = b.subarray(i + 4, i + 2 + len);
    if (marker === 0xdb && !meta.lumaQuant) {
      // DQT: one or more tables of [Pq<<4 | Tq] + 64 values (8- or 16-bit)
      let p = 0;
      while (p < seg.length) {
        const pq = seg[p] >> 4, tq = seg[p] & 15;
        const n = pq ? 128 : 64;
        if (p + 1 + n > seg.length) break;
        if (tq === 0) {
          const t: number[] = [];
          for (let k = 0; k < 64; k++) t.push(pq ? (seg[p + 1 + 2 * k] << 8) | seg[p + 2 + 2 * k] : seg[p + 1 + k]);
          meta.lumaQuant = t;
          break;
        }
        p += 1 + n;
      }
    } else if (marker === 0xeb) {
      (meta.c2pa ??= []).push(seg);
    } else if (marker === 0xe1) {
      if (ascii(seg, 0, 6) === 'Exif\0\0') Object.assign(meta.exif, parseTiff(seg.subarray(6)));
      else if (ascii(seg, 0, 29) === 'http://ns.adobe.com/xap/1.0/\0') meta.xmp = cleanText(utf8(seg.subarray(29)), 20000);
    } else if (marker === 0xfe) {
      const c = cleanText(utf8(seg));
      if (c) meta.text.push({ key: 'JPEG comment', value: c });
    }
    i += 2 + len;
  }
  return meta;
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    if (typeof DecompressionStream === 'undefined') return null;
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf.byteLength > 200_000 ? buf.slice(0, 200_000) : buf);
  } catch {
    return null;
  }
}

async function parsePng(b: Uint8Array): Promise<RawMeta> {
  const meta: RawMeta = { exif: {}, text: [], xmp: null };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 8;
  let guard = 0;
  while (i + 12 <= b.length && guard++ < 10000) {
    const len = dv.getUint32(i);
    const type = ascii(b, i + 4, 4);
    if (len > b.length - i - 12) break;
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'tEXt') {
      const z = data.indexOf(0);
      if (z > 0) meta.text.push({ key: cleanText(latin1(data.subarray(0, z)), 80), value: cleanText(latin1(data.subarray(z + 1)), 4000) });
    } else if (type === 'zTXt') {
      const z = data.indexOf(0);
      if (z > 0) {
        const inflated = await inflate(data.subarray(z + 2));
        const key = cleanText(latin1(data.subarray(0, z)), 80);
        if (inflated) meta.text.push({ key, value: cleanText(latin1(inflated), 4000) });
        else meta.text.push({ key, value: '', compressedSkipped: true });
      }
    } else if (type === 'iTXt') {
      const z = data.indexOf(0);
      if (z > 0 && z + 2 < data.length) {
        const key = cleanText(latin1(data.subarray(0, z)), 80);
        const compressed = data[z + 1] === 1;
        let p = z + 3;
        const langEnd = data.indexOf(0, p); if (langEnd < 0) { i += 12 + len; continue; }
        p = langEnd + 1;
        const trEnd = data.indexOf(0, p); if (trEnd < 0) { i += 12 + len; continue; }
        p = trEnd + 1;
        const payload = data.subarray(p);
        const raw = compressed ? await inflate(payload) : payload;
        if (raw) {
          const v = utf8(raw);
          if (key === 'XML:com.adobe.xmp') meta.xmp = cleanText(v, 20000);
          else meta.text.push({ key, value: cleanText(v, 4000) });
        } else meta.text.push({ key, value: '', compressedSkipped: true });
      }
    } else if (type === 'caBX') {
      (meta.c2pa ??= []).push(data);
    } else if (type === 'eXIf') {
      Object.assign(meta.exif, parseTiff(data));
    } else if (type === 'IEND') break;
    i += 12 + len;
  }
  return meta;
}

function parseWebp(b: Uint8Array): RawMeta {
  const meta: RawMeta = { exif: {}, text: [], xmp: null };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 12;
  let guard = 0;
  while (i + 8 <= b.length && guard++ < 1000) {
    const type = ascii(b, i, 4);
    const len = dv.getUint32(i + 4, true);
    if (len > b.length - i - 8) break;
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'EXIF') {
      const body = ascii(data, 0, 6) === 'Exif\0\0' ? data.subarray(6) : data;
      Object.assign(meta.exif, parseTiff(body));
    } else if (type === 'XMP ') meta.xmp = cleanText(utf8(data), 20000);
    else if (type === 'C2PA') (meta.c2pa ??= []).push(data);
    i += 8 + len + (len % 2);
  }
  return meta;
}

/* ------------------------- interpretation ------------------------- */

export const AI_TOOL_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /stable[\s-]?diffusion|sdxl|automatic1111|a1111/i, name: 'Stable Diffusion' },
  { re: /comfyui/i, name: 'ComfyUI' },
  { re: /midjourney/i, name: 'Midjourney' },
  { re: /dall[\s·.-]?e/i, name: 'DALL·E' },
  { re: /\bopenai\b|gpt-image/i, name: 'OpenAI image model' },
  { re: /adobe firefly|\bfirefly\b/i, name: 'Adobe Firefly' },
  { re: /novelai/i, name: 'NovelAI' },
  { re: /invokeai/i, name: 'InvokeAI' },
  { re: /leonardo\.ai/i, name: 'Leonardo.ai' },
  { re: /\bimagen\b/i, name: 'Google Imagen' },
  { re: /\bflux(\.1)?\b/i, name: 'FLUX' },
  { re: /trainedAlgorithmicMedia/, name: 'IPTC "trained algorithmic media" (AI-generated) marker' },
];

export const EDITOR_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /photoshop/i, name: 'Adobe Photoshop' },
  { re: /lightroom/i, name: 'Adobe Lightroom' },
  { re: /\bgimp\b/i, name: 'GIMP' },
  { re: /snapseed/i, name: 'Snapseed' },
  { re: /picsart/i, name: 'PicsArt' },
  { re: /\bcanva\b/i, name: 'Canva' },
  { re: /pixlr/i, name: 'Pixlr' },
  { re: /affinity/i, name: 'Affinity' },
  { re: /facetune/i, name: 'Facetune' },
  { re: /remini/i, name: 'Remini (AI enhancer)' },
  { re: /meitu/i, name: 'Meitu' },
  { re: /compositeWithTrainedAlgorithmicMedia/, name: 'IPTC "composite with AI" marker' },
];

/** Generators that sign C2PA claims (claim_generator / softwareAgent strings). */
const C2PA_AI_RE = /(OpenAI|ChatGPT|DALL[·.\-\s]?E|gpt-image|Adobe[_ ]Firefly|Firefly|Google AI|Gemini|Imagen|Microsoft Designer|Bing Image Creator|Microsoft Copilot|Meta AI|Midjourney|Stability|Runway|Leonardo)/i;
const C2PA_CAMERA_RE = /(Leica|Sony|Nikon|Canon|Fujifilm|Samsung Galaxy|Google Pixel|Pixel Camera|Truepic)/i;

function c2paText(chunks: Uint8Array[] | undefined): string {
  if (!chunks?.length) return '';
  let s = '';
  for (const c of chunks) { s += latin1(c.length > 400_000 ? c.subarray(0, 400_000) : c); if (s.length > 800_000) break; }
  return s;
}

const SD_PARAM_RE = /(Steps:\s*\d+|Sampler:|CFG scale:|Seed:\s*\d+|Negative prompt:)/i;

export interface MetadataAnalysis {
  data: MetadataData;
  logLR: number;
  summary: string;
  details: string[];
}

export async function analyzeMetadata(bytes: Uint8Array): Promise<MetadataAnalysis> {
  const format = sniffFormat(bytes);
  let raw: RawMeta = { exif: {}, text: [], xmp: null };
  try {
    if (format === 'jpeg') raw = parseJpeg(bytes);
    else if (format === 'png') raw = await parsePng(bytes);
    else if (format === 'webp') raw = parseWebp(bytes);
  } catch {
    // Malformed containers are reported as "no readable metadata".
  }

  const findings: MetadataFinding[] = [];
  let ai = false;
  let prompt = false;
  let editor = false;

  for (const [key, value] of Object.entries(raw.exif)) {
    const f: MetadataFinding = { key: `EXIF ${key}`, value, flag: 'info' };
    const aiHit = AI_TOOL_PATTERNS.find((p) => p.re.test(value));
    const edHit = EDITOR_PATTERNS.find((p) => p.re.test(value));
    if (aiHit) { f.flag = 'ai-tool'; f.note = `Names an AI image tool (${aiHit.name}).`; ai = true; }
    else if (edHit) { f.flag = 'editor'; f.note = `Image was processed with ${edHit.name}. Editing is not the same as faking.`; editor = true; }
    else if (key === 'Make' || key === 'Model') { f.flag = 'camera'; f.note = 'Camera/phone identifier.'; }
    findings.push(f);
  }

  for (const t of raw.text) {
    if (t.compressedSkipped) {
      findings.push({ key: `PNG text "${t.key}"`, value: '(compressed; could not be decoded here)', flag: 'info' });
      continue;
    }
    const f: MetadataFinding = { key: `PNG text "${t.key}"`, value: t.value, flag: 'info' };
    const keyL = t.key.toLowerCase();
    if ((keyL === 'parameters' || keyL === 'prompt' || keyL === 'description' || keyL === 'comment') && SD_PARAM_RE.test(t.value)) {
      f.flag = 'ai-prompt';
      f.note = 'Looks like image-generator settings (prompt, steps, sampler, seed).';
      prompt = true;
    } else if ((keyL === 'prompt' || keyL === 'workflow') && /class_type|KSampler|CheckpointLoader/i.test(t.value)) {
      f.flag = 'ai-prompt';
      f.note = 'Looks like a ComfyUI generation workflow.';
      prompt = true;
    } else {
      const aiHit = AI_TOOL_PATTERNS.find((p) => p.re.test(t.value) || p.re.test(t.key));
      const edHit = EDITOR_PATTERNS.find((p) => p.re.test(t.value));
      if (aiHit) { f.flag = 'ai-tool'; f.note = `Names an AI image tool (${aiHit.name}).`; ai = true; }
      else if (edHit) { f.flag = 'editor'; f.note = `Mentions ${edHit.name}.`; editor = true; }
    }
    findings.push(f);
  }

  if (raw.xmp) {
    const creator = /CreatorTool(?:="|>)([^"<]{1,200})/.exec(raw.xmp)?.[1];
    if (creator) {
      const aiHit = AI_TOOL_PATTERNS.find((p) => p.re.test(creator));
      const edHit = EDITOR_PATTERNS.find((p) => p.re.test(creator));
      findings.push({
        key: 'XMP CreatorTool',
        value: cleanText(creator),
        flag: aiHit ? 'ai-tool' : edHit ? 'editor' : 'info',
        note: aiHit ? `Names an AI image tool (${aiHit.name}).` : edHit ? `Processed with ${edHit.name}.` : undefined,
      });
      if (aiHit) ai = true; else if (edHit) editor = true;
    }
    if (/compositeWithTrainedAlgorithmicMedia/.test(raw.xmp)) {
      findings.push({ key: 'XMP DigitalSourceType', value: 'compositeWithTrainedAlgorithmicMedia', flag: 'editor', note: 'Declares that AI was used to edit part of the image.' });
      editor = true;
    } else if (/trainedAlgorithmicMedia/.test(raw.xmp)) {
      findings.push({ key: 'XMP DigitalSourceType', value: 'trainedAlgorithmicMedia', flag: 'ai-tool', note: 'Declares the image as AI-generated (IPTC standard).' });
      ai = true;
    }
    if (/c2pa|contentauth/i.test(raw.xmp)) {
      findings.push({ key: 'XMP', value: 'References Content Credentials (C2PA)', flag: 'info', note: 'Credentials are referenced but not cryptographically verified by Solace.' });
    }
  }

  // Content Credentials (C2PA): ChatGPT/DALL·E, Firefly, Bing/Designer, Meta AI and some cameras sign images.
  const c2 = c2paText(raw.c2pa);
  const hasC2pa = /c2pa|jumb/i.test(c2);
  let c2paAI = false, c2paCamera = false;
  if (hasC2pa) {
    const gen = C2PA_AI_RE.exec(c2)?.[1];
    if (/(?<!compositeWith)trainedAlgorithmicMedia/.test(c2)) c2paAI = true;
    if (gen) c2paAI = true;
    if (/compositeWithTrainedAlgorithmicMedia/.test(c2)) { editor = true; }
    if (!c2paAI && C2PA_CAMERA_RE.test(c2)) c2paCamera = true;
    findings.push({
      key: 'Content Credentials (C2PA)',
      value: c2paAI ? `Signed by an AI generator${gen ? ` (${gen})` : ''}` : c2paCamera ? 'Signed capture from a camera / camera app' : 'Present',
      flag: c2paAI ? 'ai-tool' : c2paCamera ? 'camera' : 'info',
      note: 'Solace reads the credential text but does not verify its cryptographic signature.',
    });
  }
  if (raw.xmp && /Made with Google AI|Generated with AI|AI[- ]generated|Created using AI/i.test(raw.xmp)) {
    findings.push({ key: 'XMP label', value: 'Declares AI generation', flag: 'ai-tool', note: 'A visible-label field written by the generating app.' });
    ai = true;
  }

  const hasCamera = Boolean(raw.exif.Make || raw.exif.Model);
  const CAPTURE = ['DateTimeOriginal', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'LensModel', 'SubSecTimeOriginal', 'OffsetTimeOriginal', 'Flash', 'FocalLengthIn35mm'];
  const captureFields = CAPTURE.filter((k) => raw.exif[k]).length;
  const hasGps = raw.exif.GPS === 'present';
  if (captureFields) findings.push({ key: 'Camera capture record', value: CAPTURE.filter((k) => raw.exif[k]).map((k) => `${k} ${raw.exif[k]}`).join(', ').slice(0, 300), flag: 'camera', note: `${captureFields} capture field(s) such as exposure and lens settings.` });
  if (hasGps) findings.push({ key: 'GPS', value: 'Location recorded (not shown)', flag: 'camera', note: 'Phones add this when taking a photo with location on.' });

  let logLR = 0;
  const details: string[] = [];
  let summary: string;
  if (ai || prompt || c2paAI) {
    logLR = 3.0;
    summary = c2paAI ? 'Content Credentials say an AI generator made this image.' : prompt ? 'Embedded AI-generator settings found.' : 'Metadata names an AI image tool.';
    details.push('Generator records are strong evidence of AI involvement. Metadata can be copied onto another file, but genuine photos almost never carry it.');
  } else if (c2paCamera) {
    logLR = -2.0;
    summary = 'Content Credentials record a camera capture.';
  } else if (hasCamera) {
    logLR = captureFields >= 3 ? -2.0 : captureFields >= 1 ? -1.2 : -0.6;
    if (hasGps) logLR -= 0.3;
    if (editor) logLR += 0.6;
    summary = captureFields >= 3
      ? `Full camera record: ${raw.exif.Make ?? ''} ${raw.exif.Model ?? ''} with ${captureFields} capture settings${hasGps ? ' and GPS' : ''}.`.replace(/\s+/g, ' ')
      : 'Camera identifier present with few capture details.';
    details.push('AI generators do not write exposure time, f-number, ISO or lens data. A complete capture record is strong evidence of a real camera, though it can be copied onto another image.');
    if (editor) details.push('Editing software is also recorded: a real photo that was edited afterwards.');
  } else if (editor) {
    logLR = 0.6;
    summary = 'Editing software recorded, no camera data.';
    details.push('Most photos are edited (crop, filters). This alone does not mean the content is fake.');
  } else if (findings.length === 0) {
    summary = 'No readable metadata.';
    details.push('WhatsApp, Instagram and most messengers strip metadata, so this is neutral, not suspicious. The other signals decide.');
  } else {
    summary = 'Metadata present, nothing decisive.';
  }

  return {
    data: { format, hasExif: Object.keys(raw.exif).length > 0, hasPngText: raw.text.length > 0, findings, jpegQuality: estimateJpegQuality(raw.lumaQuant), hasCamera, captureFields, hasGps, hasC2pa },
    logLR,
    summary,
    details,
  };
}
