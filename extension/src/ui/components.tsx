/** Shared UI building blocks for the side panel, popup and landing demo. */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fmt } from '../engine/math';
import type { DiffOp, ElaData, FusionResult, NoiseData, SignalResult, SpectralData } from '../shared/types';

/* ---------------- icons (inline, decorative) ---------------- */

const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  real: 'M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  kind: 'M4 5h16v10H9l-5 4z',
  identity: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8c0-4 4-6 8-6s8 2 8 6',
  safety: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  locker: 'M6 10V8a6 6 0 0 1 12 0v2h1v11H5V10zm3 0h6V8a3 3 0 0 0-6 0z',
  game: 'M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-2a4 4 0 0 1 4-4z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.5 4l2-1.5-2-3.5-2.4.8a7 7 0 0 0-1.7-1L16 4h-4l-.4 2.8a7 7 0 0 0-1.7 1L7.5 7 5.5 10.5l2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-.8a7 7 0 0 0 1.7 1L12 22h4l.4-2.8a7 7 0 0 0 1.7-1l2.4.8 2-3.5-2-1.5a7 7 0 0 0 0-2z',
  upload: 'M12 16V4m0 0l-5 5m5-5l5 5M4 20h16',
  copy: 'M8 8h11v13H8zM5 16H4V3h11v1',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3m-13 0h14v10H5z',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 3l10 18H2zM12 10v5m0 3v.5',
  download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  trash: 'M4 7h16M9 7V4h6v3m-8 0l1 14h8l1-14',
  panel: 'M3 4h18v16H3zM15 4v16',
};

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  const filled = ['home', 'real', 'kind', 'identity', 'safety', 'locker', 'game'].includes(name);
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className}
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? PATHS.alert} fillRule="evenodd" />
    </svg>
  );
}

/* ---------------- toasts ---------------- */

interface Toast { id: number; text: string; tone: 'ok' | 'bad' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'bad' ? 'bad' : ''}`}>
            <Icon name={t.tone === 'bad' ? 'alert' : 'check'} size={16} />{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- modal / confirm ---------------- */

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, textarea, select');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, [href], input, textarea, select')).filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="row-between"><h3 id={titleId}>{title}</h3><button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: string; action: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((title: string, body: string, action = 'Confirm') => new Promise<boolean>((resolve) => setState({ title, body, action, resolve })), []);
  const node = state ? (
    <Modal title={state.title} onClose={() => { state.resolve(false); setState(null); }}>
      <p className="muted">{state.body}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => { state.resolve(false); setState(null); }}>Cancel</button>
        <button className="btn danger" onClick={() => { state.resolve(true); setState(null); }}>{state.action}</button>
      </div>
    </Modal>
  ) : null;
  return { confirm, node };
}

/* ---------------- small controls ---------------- */

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="grow">
        <label htmlFor={id} style={{ fontWeight: 700, cursor: 'pointer' }}>{label}</label>
        {description && <div className="muted small">{description}</div>}
      </div>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" />
      </span>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export function CopyButton({ text, label = 'Copy', className = 'btn sm' }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <button className={className} onClick={async () => {
      const ok = await copyText(text);
      toast(ok ? 'Copied' : 'Copy failed. Select the text and copy it manually.', ok ? 'ok' : 'bad');
    }}><Icon name="copy" size={14} />{label}</button>
  );
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="stack" style={{ gap: 6 }} aria-live="polite">
      <div className="row small"><span className="spinner" />{label}</div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><div style={{ width: `${Math.round(value * 100)}%` }} /></div>
    </div>
  );
}

export function FileDrop({ accept, onFile, label, hint, disabled }: { accept: string; onFile: (f: File) => void; label: string; hint?: string; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}>
      <Icon name="upload" size={22} />
      <button className="btn primary" disabled={disabled} onClick={() => inputRef.current?.click()}>{label}</button>
      <span className="muted xs">{hint ?? 'or drop a file here'}</span>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

export function readFileBytes(f: File): Promise<Uint8Array> {
  return f.arrayBuffer().then((b) => new Uint8Array(b));
}

export function readFileDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsDataURL(f);
  });
}

/* ---------------- evidence scale (signature visual) ---------------- */

const STATUS_TEXT: Record<SignalResult['status'], { label: string; tone: string }> = {
  'supports-real': { label: 'Supports real', tone: 'good' },
  suspicious: { label: 'Suspicious', tone: 'bad' },
  neutral: { label: 'Neutral', tone: '' },
  unavailable: { label: 'Unavailable', tone: '' },
};

export function StatusBadge({ status }: { status: SignalResult['status'] }) {
  const s = STATUS_TEXT[status];
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

/**
 * Each row is one signal's w·logLR, drawn from the centre line: left (green)
 * pushes toward authentic, right (red) toward manipulated.
 */
export function EvidenceScale({ rows, max = 3, leftLabel = 'Toward authentic', rightLabel = 'Toward manipulated' }: {
  rows: { id: string; name: string; sub?: string; value: number | null }[];
  max?: number; leftLabel?: string; rightLabel?: string;
}) {
  return (
    <div className="scale" role="table" aria-label="Evidence contribution per signal">
      <div className="scale-axis" aria-hidden="true"><span>← {leftLabel}</span><span>{rightLabel} →</span></div>
      {rows.map((r) => {
        const v = r.value;
        const w = v === null ? 0 : Math.min(50, (Math.abs(v) / max) * 50);
        const cls = v === null ? '' : Math.abs(v) < 0.05 ? 'zero' : v > 0 ? 'pos' : 'neg';
        const style = v === null ? {} : v >= 0 ? { left: '50%', width: `${Math.max(w, 0.8)}%` } : { left: `${50 - w}%`, width: `${w}%` };
        return (
          <div className="scale-row" role="row" key={r.id}>
            <div className="name" role="rowheader">{r.name}{r.sub && <small>{r.sub}</small>}</div>
            <div className="scale-track" role="cell" aria-label={v === null ? `${r.name}: unavailable` : `${r.name}: ${v > 0 ? '+' : ''}${v.toFixed(2)}`}>
              {v === null ? <span className="scale-na">Unavailable</span> : <span className={`scale-bar ${cls}`} style={style} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProbabilityMeter({ fusion }: { fusion: Pick<FusionResult, 'pFake' | 'threshold'> }) {
  const t = `${fusion.threshold * 100}%`;
  return (
    <div>
      <div className="meter" style={{ ['--lo' as string]: t, ['--hi' as string]: t }} role="img"
        aria-label={`Probability of being fake ${(fusion.pFake * 100).toFixed(0)} percent. Called fake at ${t} or above.`}>
        <span className="meter-needle" style={{ left: `${fusion.pFake * 100}%` }} />
      </div>
      <div className="meter-labels"><span>Real</span><span className="num">{(fusion.pFake * 100).toFixed(0)}% fake</span><span>Fake</span></div>
    </div>
  );
}

export function RiskGauge({ risk }: { risk: number }) {
  const band = (i: number) => (i <= 4 ? 'l' : i <= 9 ? 'm' : i <= 16 ? 'h' : 'e');
  return (
    <div className="risk" role="img" aria-label={`Risk ${risk} out of 25`}>
      {Array.from({ length: 25 }, (_, i) => <span key={i} className={`${i + 1 <= risk ? 'on' : ''} ${band(i + 1)}`} />)}
    </div>
  );
}

/* ---------------- charts from real data ---------------- */

export function BlockHeatmap({ cols, rows, values, label }: { cols: number; rows: number; values: number[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const finite = values.filter(Number.isFinite);
    const sorted = [...finite].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 1;
    const img = ctx.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      const v = values[i];
      const p = i * 4;
      if (!Number.isFinite(v)) { img.data[p] = 30; img.data[p + 1] = 40; img.data[p + 2] = 70; img.data[p + 3] = 255; continue; }
      const t = Math.min(1, v / (p99 || 1));
      // navy -> amber -> white
      img.data[p] = Math.round(20 + t * 235);
      img.data[p + 1] = Math.round(30 + t * t * 200);
      img.data[p + 2] = Math.round(70 + Math.max(0, t - 0.6) * 400);
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [cols, rows, values]);
  return <canvas ref={ref} className="heat" role="img" aria-label={label} />;
}

export function ElaView({ d }: { d: ElaData }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <BlockHeatmap cols={d.cols} rows={d.rows} values={d.blocks} label={`Error level heatmap, ${d.cols} by ${d.rows} blocks`} />
      <span className="muted xs">Brighter = changed more when re-saved at JPEG quality 90.</span>
    </div>
  );
}

export function NoiseView({ d }: { d: NoiseData }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <BlockHeatmap cols={d.cols} rows={d.rows} values={d.variances} label="Noise variance map" />
      <span className="muted xs">Brighter = more fine-grain noise. Dark blue blocks were skipped (too dark or bright).</span>
    </div>
  );
}

export function SpectrumChart({ d }: { d: SpectralData }) {
  const W = 320, H = 170, P = { l: 34, r: 8, t: 10, b: 26 };
  const xs = d.allPoints.map((p) => p.logF), ys = d.allPoints.map((p) => p.logP);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (x: number) => P.l + ((x - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (y: number) => H - P.b - ((y - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  const fitX = d.points.map((p) => p.logF);
  const fx0 = Math.min(...fitX), fx1 = Math.max(...fitX);
  const ref = (x: number) => d.intercept - 2 * (x - (fx0 + fx1) / 2) - d.alpha * ((fx0 + fx1) / 2);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Radial power spectrum, fitted slope alpha ${fmt(d.alpha)}`}>
      <line className="axis" x1={P.l} y1={H - P.b} x2={W - P.r} y2={H - P.b} />
      <line className="axis" x1={P.l} y1={P.t} x2={P.l} y2={H - P.b} />
      {d.allPoints.map((p, i) => <circle key={i} cx={sx(p.logF)} cy={sy(p.logP)} r={1.8} fill={p.inFit ? '#7cc4ff' : '#4a5a85'} />)}
      <line x1={sx(fx0)} y1={sy(d.intercept - d.alpha * fx0)} x2={sx(fx1)} y2={sy(d.intercept - d.alpha * fx1)} stroke="#f0b03c" strokeWidth={2} />
      <line x1={sx(fx0)} y1={sy(ref(fx0))} x2={sx(fx1)} y2={sy(ref(fx1))} stroke="#a3b0cc" strokeDasharray="4 3" strokeWidth={1.2} />
      <text x={W / 2} y={H - 6} textAnchor="middle">log₁₀ frequency</text>
      <text x={10} y={H / 2} textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`}>log₁₀ power</text>
      <text x={W - P.r} y={P.t + 8} textAnchor="end" fill="#f0b03c">fit α = {fmt(d.alpha)}</text>
      <text x={W - P.r} y={P.t + 22} textAnchor="end">dashed: reference α = 2</text>
    </svg>
  );
}

export function DiffView({ ops, side }: { ops: DiffOp[]; side: 'a' | 'b' }) {
  return (
    <span className="diff" style={{ fontWeight: 700 }}>
      {ops.map((o, i) => {
        const ch = side === 'a' ? o.a : o.b;
        if (!ch) return null;
        const cls = o.op === 'equal' ? '' : side === 'a' && o.op === 'del' ? 'del' : o.op;
        return <span key={i} className={cls}>{ch}</span>;
      })}
    </span>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice bad" role="alert">
      <strong>Could not finish.</strong> {message}
      {onRetry && <div style={{ marginTop: 6 }}><button className="btn sm" onClick={onRetry}>Try again</button></div>}
    </div>
  );
}
