/** Shield 1 - Is it real? Image evidence dashboard and forward checker. */
import { useEffect, useRef, useState } from 'react';
import { analyzeImageBytes, validateImageBytes } from '../../engine/image-client';
import { fmt } from '../../engine/math';
import { analyzeMisinformation } from '../../engine/misinformation';
import { sniffFormat } from '../../engine/metadata-analysis';
import { addHistory, addRef, deleteRef, importRefsJson, listRefs, type RefEntry } from '../../shared/local-data';
import type { ImageAnalysisResult, MisinformationResult, SignalResult } from '../../shared/types';
import { useApp } from '../../ui/app-context';
import { ElaView, ErrorNote, EvidenceScale, FileDrop, Icon, NoiseView, ProbabilityMeter, Progress, SpectrumChart, StatusBadge, readFileBytes, useConfirm, useToast } from '../../ui/components';
import { assetUrl } from '../../ui/env';
import type { SourceInfo } from '../../shared/messaging';
import { CorrectionCard, MisinfoView, SaveEvidenceButton, SourceLine, bytesToDataUrl, useObjectUrl } from '../shared';

export const SAMPLES = [
  { file: 'debunked-demo-2.jpg', label: 'Sample: image in the demo “debunked” list' },
  { file: 'demo-ai-metadata.png', label: 'Sample: image with AI-generator metadata' },
  { file: 'demo-camera-edited-exif.jpg', label: 'Sample: photo-editor EXIF fields' },
  { file: 'scene3-edited.jpg', label: 'Sample: drawing with a pasted region' },
  { file: 'scene1-original.jpg', label: 'Sample: unedited drawing' },
];

const VERDICT = {
  'likely-fake': { title: 'Likely fake', tone: 'bad' },
  'likely-real': { title: 'Likely real', tone: 'good' },
} as const;

export function RealShield() {
  const { takeIncoming, incoming } = useApp();
  const [tab, setTab] = useState<'image' | 'text'>('image');
  const [text, setText] = useState('');
  const [misinfo, setMisinfo] = useState<MisinformationResult | null>(null);
  const [img, setImg] = useState<{ bytes: Uint8Array; name: string; sample: boolean; source?: SourceInfo } | null>(null);
  const [incomingError, setIncomingError] = useState<string | null>(null);

  useEffect(() => {
    const inc = takeIncoming('real');
    if (!inc) return;
    if (inc.image) { setTab('image'); setImg({ ...inc.image, sample: false, source: inc.source }); setIncomingError(null); }
    if (inc.error) { setTab('image'); setIncomingError(inc.error); }
    if (inc.text) { setTab('text'); setText(inc.text); setMisinfo(analyzeMisinformation(inc.text)); }
  }, [incoming, takeIncoming]);

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h2>Is it real?</h2>
        <p>Check a photo or a forwarded message. Solace weighs seven kinds of evidence, gives a clear real-or-fake answer and tells you how confident it is.</p>
      </div>
      <div className="row" role="tablist" aria-label="What to check">
        <button role="tab" aria-selected={tab === 'image'} className={`btn ${tab === 'image' ? 'primary' : ''}`} onClick={() => setTab('image')}>Image</button>
        <button role="tab" aria-selected={tab === 'text'} className={`btn ${tab === 'text' ? 'primary' : ''}`} onClick={() => setTab('text')}>Forwarded message</button>
      </div>
      {tab === 'image' ? (
        <ImageChecker img={img} setImg={setImg} incomingError={incomingError} clearIncomingError={() => setIncomingError(null)} />
      ) : (
        <div className="stack">
          <label className="field"><span className="lbl">Paste the forwarded message</span>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setMisinfo(null); }} placeholder="e.g. URGENT!! Forward to all groups before it is deleted…" rows={5} />
          </label>
          <div className="row">
            <button className="btn primary" disabled={!text.trim()} onClick={() => {
              const r = analyzeMisinformation(text);
              setMisinfo(r);
              addHistory({ shield: 'real', title: 'Forwarded message', outcome: `${r.level} hoax score (p = ${fmt(r.p)})`, tone: r.level === 'high' ? 'bad' : r.level === 'medium' ? 'warn' : 'neutral', text: text.slice(0, 500) });
            }}>Check message</button>
            {text && <button className="btn ghost" onClick={() => { setText(''); setMisinfo(null); }}>Clear</button>}
          </div>
          {misinfo && <MisinfoView r={misinfo} />}
        </div>
      )}
      <KnownFakesManager />
    </div>
  );
}

function ImageChecker({ img, setImg, incomingError, clearIncomingError }: {
  img: { bytes: Uint8Array; name: string; sample: boolean; source?: SourceInfo } | null;
  setImg: (v: { bytes: Uint8Array; name: string; sample: boolean; source?: SourceInfo } | null) => void;
  incomingError: string | null; clearIncomingError: () => void;
}) {
  const { settings } = useApp();
  const toast = useToast();
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<{ step: string; f: number } | null>(null);
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useObjectUrl(img?.bytes ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanFor = useRef<Uint8Array | null>(null);

  const run = async () => {
    if (!img) return;
    setError(null); setResult(null); clearIncomingError();
    const ac = new AbortController(); abortRef.current = ac;
    setBusy({ step: 'Starting', f: 0 });
    try {
      const userRefs = await listRefs('known-fake').catch(() => [] as RefEntry[]);
      const r = await analyzeImageBytes(img.bytes, { name: img.name, caption, userHashes: userRefs, threshold: settings.threshold, signal: ac.signal, onProgress: (step, f) => setBusy({ step, f }) });
      setResult(r);
      const format = sniffFormat(img.bytes);
      addHistory({ shield: 'real', title: img.sample ? `${img.name} (sample)` : 'Image check', outcome: `${VERDICT[r.fusion.verdict].title}, ${r.fusion.confidence} confidence (P = ${fmt(r.fusion.pFake)})`, tone: r.fusion.verdict === 'likely-fake' ? 'bad' : 'good', ...(!img.sample && img.bytes.byteLength <= 8 * 1024 * 1024 && ['jpeg', 'png', 'webp'].includes(format) ? { imageData: bytesToDataUrl(img.bytes, `image/${format}`) } : {}) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null); abortRef.current = null;
    }
  };

  // auto-run images that arrive from the context menu
  useEffect(() => {
    if (img && img.source && autoRanFor.current !== img.bytes) { autoRanFor.current = img.bytes; void run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  const pick = async (f: File) => {
    const bytes = await readFileBytes(f);
    const err = validateImageBytes(bytes);
    setResult(null);
    if (err) { setError(err); setImg(null); return; }
    setError(null); setImg({ bytes, name: f.name, sample: false });
  };

  const loadSample = async (file: string) => {
    try {
      const res = await fetch(assetUrl(`samples/${file}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(null); setError(null);
      setImg({ bytes: new Uint8Array(await res.arrayBuffer()), name: file, sample: true });
    } catch (e) {
      toast(`Sample could not be loaded (${(e as Error).message}).`, 'bad');
    }
  };

  return (
    <div className="stack">
      {incomingError && <ErrorNote message={incomingError} />}
      {!img ? (
        <>
          <FileDrop accept="image/jpeg,image/png,image/webp,image/gif" onFile={pick} label="Choose an image" hint="JPEG, PNG, WebP or GIF up to 15 MB. Or right-click any image on a page → Check image with Solace." />
          <label className="field"><span className="lbl">Or try a labelled sample</span>
            <select defaultValue="" onChange={(e) => { if (e.target.value) loadSample(e.target.value); e.target.value = ''; }}>
              <option value="" disabled>Pick a sample…</option>
              {SAMPLES.map((s) => <option key={s.file} value={s.file}>{s.label}</option>)}
            </select>
          </label>
          {error && <ErrorNote message={error} />}
        </>
      ) : (
        <div className="stack">
          <div className="panel stack">
            {preview && <img className="thumb" src={preview} alt="Image being analysed" style={{ margin: '0 auto' }} />}
            <div className="row-between">
              <span className="small">{img.sample && <span className="badge warn plain" style={{ marginRight: 6 }}>Sample</span>}{img.name} <span className="muted">({(img.bytes.length / 1024).toFixed(0)} KB, {sniffFormat(img.bytes).toUpperCase()})</span></span>
              <button className="btn ghost sm" disabled={!!busy} onClick={() => { setImg(null); setResult(null); setError(null); }}>Choose another</button>
            </div>
            <SourceLine source={img.source} />
            {!result && !busy && (
              <>
                <label className="field"><span className="lbl">Caption or forwarded text (optional)</span>
                  <textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Paste the message that came with the image" />
                </label>
                <button className="btn primary block" onClick={run}><Icon name="real" size={16} />Scan image</button>
              </>
            )}
            {busy && (
              <>
                <Progress value={busy.f} label={busy.step} />
                <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Cancel</button>
              </>
            )}
            {error && <ErrorNote message={error} onRetry={run} />}
          </div>
          {result && <ImageResultView r={result} bytes={img.bytes} sample={img.sample} source={img.source} />}
        </div>
      )}
    </div>
  );
}

export function ImageResultView({ r, bytes, sample, source }: { r: ImageAnalysisResult; bytes?: Uint8Array; sample?: boolean; source?: SourceInfo }) {
  const v = VERDICT[r.fusion.verdict];
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const mime = r.file.format === 'png' ? 'image/png' : r.file.format === 'webp' ? 'image/webp' : 'image/jpeg';
  return (
    <div className="stack-lg">
      <div className={`verdict ${v.tone}`} aria-live="polite">
        <div className="row-between"><div className="verdict-title">{v.title}</div>
          <span className="row"><span className={`badge plain ${r.fusion.confidence === 'high' ? (r.fusion.verdict === 'likely-fake' ? 'bad' : 'good') : r.fusion.confidence === 'medium' ? 'warn' : ''}`}>{r.fusion.confidence} confidence</span>{sample && <span className="badge warn plain">Sample</span>}</span></div>
        <p>{r.explanation}</p>
        <ProbabilityMeter fusion={r.fusion} />
        <p className="small muted num">P(fake) = {fmt(r.fusion.pFake)} from {r.fusion.availableCount} of 7 signals. Evidence strength Σ|w·log LR| = {fmt(r.fusion.evidenceStrength)}.</p>
        {r.fusion.reasons.length > 0 && <ul className="plain small">{r.fusion.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>

      {r.context?.note && <div className="notice warn"><strong>Re-saved copy detected.</strong> {r.context.note}</div>}

      <section className="section">
        <h3>How each signal voted</h3>
        <EvidenceScale rows={r.signals.map((s) => ({ id: s.id, name: s.name, sub: s.valueLabel, value: s.contribution }))} />
        <p className="muted xs num">L = log(π/(1−π)) + Σ wᵢ·log LRᵢ = {fmt(r.fusion.priorLogOdds)} {r.fusion.terms.map((t) => `${t.contribution >= 0 ? '+' : '−'} ${fmt(Math.abs(t.contribution))}`).join(' ')} = {fmt(r.fusion.logOdds)}; P = 1/(1+e^−L) = {fmt(r.fusion.pFake)}. Verdict: likely fake when P ≥ {r.fusion.threshold}, otherwise likely real. Confidence from |P − 0.5|: high ≥ 0.30, medium ≥ 0.15.</p>
      </section>

      <section className="section">
        <h3>Signal details</h3>
        {r.signals.map((s) => <SignalDetail key={s.id} s={s} />)}
      </section>

      <section className="section">
        <h3>What to do next</h3>
        <ul className="plain">{r.nextActions.map((a) => <li key={a}>{a}</li>)}</ul>
        <div className="notice"><strong>Limits.</strong> {r.limitations.join(' ')}</div>
      </section>

      <div className="row">
        {r.hash && (
          <button className="btn" disabled={added} onClick={async () => {
            try { await addRef(`Marked fake on ${new Date().toLocaleDateString()}`, r.hash!, 'known-fake', 'Added by you'); setAdded(true); toast('Added to your local known-fakes list'); }
            catch (e) { toast((e as Error).message, 'bad'); }
          }}>{added ? 'In your known-fakes list' : 'Add to my known-fakes list'}</button>
        )}
        {bytes && (
          <SaveEvidenceButton build={() => ({
            text: `Image check: ${v.title} (P = ${fmt(r.fusion.pFake)}). ${r.explanation}`,
            url: source?.url ?? 'manual-entry',
            platform: source?.platform ?? 'manual',
            senderLabel: source?.senderLabel,
            screenshot: bytes.length < 6_000_000 && r.file.format !== 'gif' ? bytesToDataUrl(bytes, mime) : undefined,
            category: 'image-check', severity: r.fusion.pFake, source: 'side-panel',
            note: sample ? 'Bundled Solace sample image' : `File: ${r.file.name}`,
          })} />
        )}
      </div>
      {r.fusion.verdict !== 'likely-real' && <CorrectionCard />}
    </div>
  );
}

function SignalDetail({ s }: { s: SignalResult }) {
  return (
    <details className="panel flat" style={{ padding: 12 }}>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
        <div className="row-between">
          <strong>{s.name}</strong>
          <span className="row"><span className="muted xs num">{s.contribution === null ? '' : `${s.contribution > 0 ? '+' : ''}${fmt(s.contribution)}`}</span><StatusBadge status={s.status} /></span>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>{s.status === 'unavailable' ? s.unavailableReason : s.summary}</p>
      </summary>
      <div className="stack" style={{ marginTop: 10 }}>
        {s.details.length > 0 && <ul className="plain small">{s.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        {s.id === 'ela' && s.data && <ElaView d={s.data} />}
        {s.id === 'noise' && s.data && <NoiseView d={s.data} />}
        {s.id === 'spectral' && s.data && <SpectrumChart d={s.data} />}
        {s.id === 'metadata' && s.data && (
          s.data.findings.length ? (
            <dl className="kv">{s.data.findings.slice(0, 20).map((f, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt>{f.key}</dt><dd>{f.value.slice(0, 300)}{f.note && <div className="muted xs">{f.note}</div>}</dd>
              </div>
            ))}</dl>
          ) : <p className="muted small">No EXIF, XMP or PNG text found in the file.</p>
        )}
        {s.id === 'knownFake' && s.data && (
          <div className="small">
            {s.data.matches.length ? (
              <ul className="plain">{s.data.matches.map((m) => <li key={m.id}>{m.label} — distance {m.distance} ({m.dataset === 'bundled-demo' ? 'bundled demonstration dataset' : 'your local list'})</li>)}</ul>
            ) : <p className="muted">No match. Searched {s.data.bundledCount} bundled demo hashes and {s.data.userCount} of yours.</p>}
          </div>
        )}
        {s.id === 'text' && s.data && <MisinfoView r={s.data} />}
        {s.limitations.length > 0 && <p className="xs muted">Limits: {s.limitations.join(' ')}</p>}
      </div>
    </details>
  );
}

function KnownFakesManager() {
  const { refreshKey, bump } = useApp();
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const [refs, setRefs] = useState<RefEntry[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { listRefs('known-fake').then(setRefs).catch(() => setRefs([])); }, [refreshKey]);
  return (
    <details className="more">
      <summary>Your known-fakes list ({refs?.length ?? 0})</summary>
      <div className="stack">
        <p className="muted small">Images you mark as fake are stored here as 64-bit fingerprints (no pictures). Solace also ships a small demonstration list — it does not search the internet.</p>
        {refs && refs.length > 0 ? (
          <div className="list">{refs.map((r) => (
            <div className="list-item" key={r.id}>
              <div className="grow small"><div>{r.label}</div><code>{r.hash}</code></div>
              <button className="btn ghost sm" aria-label={`Remove ${r.label}`} onClick={async () => {
                if (await confirm('Remove fingerprint?', `“${r.label}” will no longer be matched.`, 'Remove')) { await deleteRef(r.id); bump(); toast('Removed'); }
              }}><Icon name="trash" size={14} /></button>
            </div>
          ))}</div>
        ) : <p className="muted small">Empty. Scan an image and choose “Add to my known-fakes list”, or import a list.</p>}
        <div className="row">
          <button className="btn sm" onClick={() => fileRef.current?.click()}>Import list (JSON)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { const n = await importRefsJson(await f.text()); bump(); toast(`Imported ${n} fingerprints`); }
            catch (err) { toast(`Import failed: ${(err as Error).message}`, 'bad'); }
          }} />
        </div>
        {node}
      </div>
    </details>
  );
}
