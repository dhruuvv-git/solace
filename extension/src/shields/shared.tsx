/** UI pieces shared by several shields. */
import { useEffect, useState } from 'react';
import { fmt } from '../engine/math';
import { saveEvidence, type NewEvidence } from '../evidence/evidence-store';
import { CORRECTION } from '../engine/misinformation';
import type { MisinformationResult, ToxicityResult } from '../shared/types';
import { useApp } from '../ui/app-context';
import { CopyButton, EvidenceScale, Icon, useToast } from '../ui/components';

export function CorrectionCard({ initial }: { initial?: { en: string; hi: string } }) {
  const [en, setEn] = useState(initial?.en ?? CORRECTION.en);
  const [hi, setHi] = useState(initial?.hi ?? CORRECTION.hi);
  return (
    <div className="subpanel stack">
      <h4>Polite reply you can send</h4>
      <p className="muted small">Edit it if you like, then copy it into the chat yourself. Solace never sends messages.</p>
      <label className="field"><span className="lbl">English</span>
        <textarea value={en} onChange={(e) => setEn(e.target.value)} rows={3} />
      </label>
      <div className="row"><CopyButton text={en} label="Copy English reply" /></div>
      <label className="field"><span className="lbl">हिन्दी</span>
        <textarea className="hi" lang="hi" value={hi} onChange={(e) => setHi(e.target.value)} rows={3} />
      </label>
      <div className="row"><CopyButton text={hi} label="Copy Hindi reply" /><CopyButton text={`${hi}\n\n${en}`} label="Copy both" /></div>
    </div>
  );
}

export function MisinfoView({ r }: { r: MisinformationResult }) {
  const tone = r.level === 'high' ? 'bad' : r.level === 'medium' ? 'warn' : 'neutral';
  const title = r.level === 'high' ? 'Looks like a hoax forward' : r.level === 'medium' ? 'Some hoax-like signs' : 'Few hoax-like signs';
  return (
    <div className="stack">
      <div className={`verdict ${tone}`}>
        <div className="verdict-title">{title}</div>
        <p>{r.explanation}</p>
        <p className="small muted num">p = σ({fmt(r.intercept)} {r.features.map((f) => `+ ${fmt(f.contribution)}`).join(' ')}) = {fmt(r.p)}</p>
      </div>
      <EvidenceScale max={3} leftLabel="Lower" rightLabel="Higher hoax score" rows={[
        { id: 'b0', name: 'Starting point β₀', sub: 'most messages are fine', value: r.intercept },
        ...r.features.map((f) => ({ id: f.id, name: f.label, sub: `x = ${fmt(f.value)} · β = ${fmt(f.beta)}`, value: f.contribution })),
      ]} />
      {r.features.some((f) => f.evidence.length) && (
        <ul className="plain small">{r.features.flatMap((f) => f.evidence.map((e, i) => <li key={f.id + i}>{e}</li>))}</ul>
      )}
      <details className="more"><summary>What this can’t tell you</summary><ul className="plain small muted">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
      {r.level !== 'low' && <CorrectionCard initial={r.correction} />}
    </div>
  );
}

export function ToxicityHighlight({ text, r }: { text: string; r: ToxicityResult }) {
  // Highlight using the matched text positions in the normalised string; fall back to plain text.
  const parts: (string | JSX.Element)[] = [];
  const norm = text.normalize('NFC').toLowerCase();
  let last = 0;
  const ms = r.matches.filter((m) => m.contribution > 0.05).map((m) => ({ ...m, at: norm.indexOf(m.matchedText, 0) })).filter((m) => m.at >= 0).sort((a, b) => a.at - b.at);
  for (const m of ms) {
    if (m.at < last) continue;
    parts.push(text.slice(last, m.at));
    parts.push(<mark key={m.at} className="highlight" title={m.category}>{text.slice(m.at, m.at + m.matchedText.length)}</mark>);
    last = m.at + m.matchedText.length;
  }
  parts.push(text.slice(last));
  return <p style={{ whiteSpace: 'pre-wrap', background: 'var(--night)', padding: 10, borderRadius: 8 }}>{parts}</p>;
}

/** "Save to Evidence Locker" button with honest success/failure. */
export function SaveEvidenceButton({ build, label = 'Save to Evidence Locker', onSaved }: { build: () => NewEvidence | null; label?: string; onSaved?: (id: string) => void }) {
  const toast = useToast();
  const { bump } = useApp();
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  return (
    <button className="btn" disabled={busy || !!savedId} onClick={async () => {
      const e = build();
      if (!e) return;
      setBusy(true);
      try {
        const rec = await saveEvidence(e);
        setSavedId(rec.id); bump(); onSaved?.(rec.id);
        toast('Saved to Evidence Locker');
      } catch (err) {
        toast(`Not saved: ${(err as Error).message}`, 'bad');
      } finally { setBusy(false); }
    }}><Icon name="locker" size={15} />{savedId ? 'Saved' : busy ? 'Saving…' : label}</button>
  );
}

export function useObjectUrl(bytes: Uint8Array | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) { setUrl(null); return; }
    const u = URL.createObjectURL(new Blob([bytes]));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes]);
  return url;
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}

export function SourceLine({ source }: { source?: { url: string; platform: string; senderLabel?: string } }) {
  if (!source) return null;
  let host = source.url;
  try { host = new URL(source.url).hostname; } catch { /* keep */ }
  return <p className="muted xs">From {source.platform === 'web' ? host : source.platform === 'whatsapp' ? 'WhatsApp Web' : 'Instagram'}{source.senderLabel ? ` · sender shown as “${source.senderLabel}”` : ''}</p>;
}
