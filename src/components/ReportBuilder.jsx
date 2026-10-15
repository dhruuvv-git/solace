import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Copy, Download, ExternalLink, FileText, ImagePlus,
  Lightbulb, PhoneCall, Printer, RotateCcw, ShieldCheck, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { formatSize, sealFile, sha256Hex } from '../lib/vault';
import {
  AUTHORITIES, DESCRIBE_PROMPTS, REPORT_TYPES, buildReport, clearDraft, emptyDraft, gaps, loadDraft, reportText, saveDraft, toLocalInput,
} from '../lib/report';
import { useToast } from './Toaster';

const card = 'p-6 rounded-2xl bg-white border border-violet-100 shadow-[0_4px_24px_rgba(124,58,237,0.07)]';
const primaryBtn = 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(124,58,237,0.3)] disabled:opacity-50';
const softBtn = 'px-4 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-zinc-700 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer border border-violet-100';
const STEPS = ['What happened', 'Photos & evidence', 'Your details', 'Review & generate'];

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-2 ${className}`}>
      <span className="sol-light-label">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function Check2({ checked, onChange, children }) {
  return (
    <label className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${checked ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-white border-violet-100 text-zinc-700 hover:bg-violet-50'}`}>
      <input type="checkbox" className="accent-purple-600 w-4 h-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** The formal report. Rendered on screen as a preview and again in a portal for printing. */
function ReportDocument({ r }) {
  return (
    <article className="sol-report">
      <h1>{r.title}</h1>
      <p style={{ textAlign: 'right', marginTop: 12 }}>Date: {r.date}</p>
      <p style={{ marginTop: 12 }}>To,<br />{r.to.map((l, i) => <span key={i}>{l}<br /></span>)}</p>
      <p style={{ marginTop: 12 }}><strong>Subject:</strong> {r.subject}</p>
      <p style={{ marginTop: 12 }}>Respected Sir / Madam,</p>
      {r.statement.map((s, i) => <p key={i}>{s}</p>)}

      <h2>Incident summary</h2>
      <table><tbody>{r.summary.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>

      <h2>Details of the person(s) responsible</h2>
      <table><tbody>{r.accused.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>

      {r.links.length > 0 && (<><h2>Links to the content / accounts</h2><ol>{r.links.map((l, i) => <li key={i} className="mono" style={{ fontSize: 12 }}>{l}</li>)}</ol></>)}

      {r.provisions.length > 0 && (<><h2>Provisions that may apply</h2><p style={{ fontSize: 12, fontStyle: 'italic' }}>For the officer to determine.</p><ul>{r.provisions.map((p) => <li key={p}>{p}</li>)}</ul></>)}

      <h2>I request you to</h2>
      <ol>{r.requests.map((q) => <li key={q}>{q}</li>)}</ol>

      <h2>Complainant</h2>
      <table><tbody>{r.complainant.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
      <p style={{ marginTop: 16 }}>I declare that the information given above is true and correct to the best of my knowledge and belief.</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, gap: 16, flexWrap: 'wrap' }}>
        <div>Place: {r.place}<br />Date: {r.date}</div>
        <div style={{ textAlign: 'right' }}>____________________<br />Signature<br />{r.signName}</div>
      </div>

      {r.photos.length > 0 && (
        <>
      <h2 style={{ breakBefore: 'page', pageBreakBefore: 'always' }}>Annexure A — Evidence files</h2>
          {r.photos.map((p) => (
            <figure key={p.id}>
              {p.isImage ? <img src={p.url} alt={p.caption || p.name} /> : <div style={{ padding: 16, textAlign: 'center', background: '#f7f5fb' }}>[{p.type || 'file'} — original file to be produced]</div>}
              <figcaption><strong>{p.label}.</strong> {p.caption || p.name}<br /><span style={{ color: '#555' }}>{p.meta}</span><br /><span className="mono">SHA-256: {p.hash}</span></figcaption>
            </figure>
          ))}
        </>
      )}
      {r.vault.length > 0 && (
        <>
          <h2>Annexure B — Other sealed evidence</h2>
          <table><tbody>{r.vault.map((v, i) => <tr key={v.id}><th>B-{i + 1}. {v.name}</th><td className="mono">{v.hash}</td></tr>)}</tbody></table>
        </>
      )}
    </article>
  );
}

export default function ReportBuilder({ records, onSealed }) {
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [d, setD] = useState(() => loadDraft(user));
  const [photos, setPhotos] = useState([]);
  const [adding, setAdding] = useState(0);
  const [sealToVault, setSealToVault] = useState(true);
  const [copied, setCopied] = useState(false);
  const pickRef = useRef(null);
  const camRef = useRef(null);
  const photosRef = useRef(photos);
  const topRef = useRef(null);
  const [maxDate] = useState(() => toLocalInput(Date.now()));

  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v && v.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  useEffect(() => { saveDraft(user.id, d); }, [user.id, d]);
  useEffect(() => {
    const pending = window.solaceMimiReportDraft;
    delete window.solaceMimiReportDraft;
    if (!pending) return;
    const summary = `${pending.title || 'Mimi check'} — ${pending.outcome || 'Result reviewed'}. This summary came from Mimi’s local recent checks; add the incident facts and date you know.`;
    setD((current) => ({ ...current, description: current.description ? `${current.description}\n${summary}` : summary }));
    if (typeof pending.imageData === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(pending.imageData)) {
      (async () => {
        try {
          const response = await fetch(pending.imageData);
          const blob = await response.blob();
          if (blob.size > 8 * 1024 * 1024) return;
          const file = new File([blob], `mimi-${pending.shield || 'check'}-evidence.${blob.type.split('/')[1] || 'jpg'}`, { type: blob.type });
          const hash = (await sealFile(user.id, file)).hash;
          const url = URL.createObjectURL(file);
          setPhotos((current) => [...current, { id: `p_mimi_${Date.now().toString(36)}`, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, hash, caption: 'Image checked by Mimi', isImage: true, url }]);
          toast('Mimi’s checked image was added to this report and sealed in your Evidence Vault.');
          onSealed?.();
        } catch (e) { toast(`Could not add Mimi’s image: ${e.message}`, 'bad'); }
      })();
    } else {
      toast('Mimi’s result was added. Add a screenshot or other proof in Photos & evidence.');
    }
  // consume a one-time draft only when entering the report builder
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const report = useMemo(() => buildReport(d, photos, records), [d, photos, records]);
  const missing = useMemo(() => gaps(d, photos), [d, photos]);
  const blocking = missing.filter(([s]) => s === 'bad');
  const otherVault = records.filter((r) => !photos.some((p) => p.hash === r.hash)).length;

  const hasDate = !!(d.occurredAt || d.discoveredAt);
  const hasContact = !!(d.phone.trim() || d.email.trim());
  const requirements = [
    { ready: hasDate, message: 'Enter when the incident happened or when you found out before continuing.' },
    { ready: photos.length > 0, message: 'Add at least one photo, screenshot, or other proof before continuing.' },
    { ready: !!d.name.trim() && hasContact, message: 'Add your name and either a phone number or email before continuing.' },
  ];
  const canEnterStep = (n) => {
    if (n <= step) return true;
    for (let i = 0; i < n; i++) {
      if (!requirements[i].ready) { toast(requirements[i].message, 'bad'); return false; }
    }
    return true;
  };
  const goStep = (n) => {
    if (!canEnterStep(n)) return;
    setStep(n);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setAdding(files.length);
    let sealed = 0;
    try {
      for (const f of files) {
        const hash = sealToVault ? (await sealFile(user.id, f)).hash : await sha256Hex(await f.arrayBuffer());
        if (sealToVault) sealed++;
        const p = { id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name: f.name || 'photo.jpg', size: f.size, type: f.type, lastModified: f.lastModified || null, hash, caption: '', isImage: f.type.startsWith('image/'), url: URL.createObjectURL(f) };
        setPhotos((xs) => [...xs, p]);
        setAdding((n) => n - 1);
      }
      toast(sealed ? `${files.length} file(s) added and sealed in your Evidence Vault.` : `${files.length} file(s) added.`);
      if (sealed) onSealed?.();
    } catch (err) {
      toast(`Could not add the file: ${err.message}`, 'bad');
    } finally { setAdding(0); }
  };
  const removePhoto = (id) => setPhotos((xs) => { const p = xs.find((x) => x.id === id); if (p) URL.revokeObjectURL(p.url); return xs.filter((x) => x.id !== id); });
  const movePhoto = (id, dir) => setPhotos((xs) => { const i = xs.findIndex((x) => x.id === id), j = i + dir; if (j < 0 || j >= xs.length) return xs; const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const caption = (id, v) => setPhotos((xs) => xs.map((x) => (x.id === id ? { ...x, caption: v } : x)));

  const text = () => reportText(report);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast('Copy failed — use Download instead.', 'bad'); }
  };
  const downloadTxt = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `solace-incident-report-${new Date().toISOString().slice(0, 10)}.txt` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const startOver = () => {
    if (!window.confirm('Clear this report and start again? Your Evidence Vault is not affected.')) return;
    clearDraft(user.id); photos.forEach((p) => URL.revokeObjectURL(p.url)); setPhotos([]); setD(emptyDraft(user)); goStep(0);
  };

  const canNext = requirements[step]?.ready ?? true;
  const stepHint = ['Enter an incident date or discovery date.', 'Add at least one evidence file.', 'Enter your name and a phone number or email.'][step];
  const canGenerate = blocking.length === 0;

  return (
    <div className="space-y-6" data-testid="report-builder" ref={topRef}>
      {/* intro + stepper */}
      <div className={`${card} relative overflow-hidden`}>
        <div aria-hidden="true" className="absolute -top-24 -right-20 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.12), transparent 70%)' }} />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#1a1028] flex items-center gap-2"><FileText className="w-5 h-5 text-purple-600" />Incident Report Builder</h3>
            <p className="text-xs text-zinc-600 mt-1 max-w-2xl leading-relaxed">Tell us what happened in your own words and add your photos. Solace turns it into a formal complaint you can print for the police, take to a cyber cell, or paste into cybercrime.gov.in. Your draft stays in this browser; photos never leave this page.</p>
          </div>
          <button onClick={startOver} className="px-3 py-2 rounded-xl text-zinc-500 hover:text-rose-600 text-xs font-mono flex items-center gap-2 cursor-pointer self-start md:self-auto"><RotateCcw className="w-3.5 h-3.5" />Start over</button>
        </div>
        <ol className="relative grid grid-cols-2 md:grid-cols-4 gap-2 mt-6">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => goStep(i)} aria-current={step === i ? 'step' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${step === i ? 'bg-purple-50 border-purple-300 text-purple-800 font-semibold shadow-[0_0_14px_rgba(168,85,247,0.15)]' : 'bg-white border-violet-100 text-zinc-600 hover:bg-violet-50'}`}>
                <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center text-[10px] font-bold font-mono ${i < step ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white' : step === i ? 'bg-purple-600 text-white' : 'bg-violet-50 text-zinc-500 border border-violet-200'}`}>{i < step ? <Check className="w-3 h-3" /> : i + 1}</span>
                <span className="truncate">{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* STEP 1 — what happened */}
      {step === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`${card} lg:col-span-2 space-y-5`}>
            <Field label="What kind of incident is this?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REPORT_TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => set('type')(t.id)} aria-pressed={d.type === t.id}
                    className={`px-3.5 py-2.5 rounded-xl border text-left text-xs transition-colors cursor-pointer ${d.type === t.id ? 'bg-purple-50 border-purple-400 text-purple-800 font-semibold' : 'bg-white border-violet-100 text-zinc-700 hover:bg-violet-50'}`}>{t.title}</button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="When did it happen?" hint="Approximate is fine; the time can be approximate too."><input type="datetime-local" className="sol-light-input" value={d.occurredAt} max={maxDate} onChange={set('occurredAt')} /></Field>
              <Field label="When did you find out?" hint="Required: enter at least one of these two dates."><input type="datetime-local" className="sol-light-input" value={d.discoveredAt} max={maxDate} onChange={set('discoveredAt')} /></Field>
              <Field label="App / website" hint="e.g. Instagram, WhatsApp, Telegram"><input className="sol-light-input" value={d.platform} onChange={set('platform')} maxLength={120} placeholder="Instagram" /></Field>
              <Field label="Physical place (if any)"><input className="sol-light-input" value={d.location} onChange={set('location')} maxLength={200} placeholder="e.g. outside my college, Pune" /></Field>
            </div>
            <Field label="Describe what happened, in your own words" hint={`${d.description.trim().length} characters · write it the way you would tell a trusted friend. Separate paragraphs with a blank line.`}>
              <textarea rows={9} className="sol-light-input resize-y leading-relaxed" value={d.description} onChange={set('description')} maxLength={8000} data-testid="report-description"
                placeholder="On Monday evening I received a message from an unknown Instagram account @… saying …" />
            </Field>
            <div>
              <span className="sol-light-label">Which of these apply?</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <Check2 checked={d.threats} onChange={set('threats')}>I was threatened</Check2>
                <Check2 checked={d.moneyDemanded} onChange={set('moneyDemanded')}>Money was demanded</Check2>
                <Check2 checked={d.moneyPaid} onChange={set('moneyPaid')}>I have paid money</Check2>
                <Check2 checked={d.contentShared} onChange={set('contentShared')}>Content was already shared with others</Check2>
                <Check2 checked={d.ongoing} onChange={set('ongoing')}>It is still happening</Check2>
              </div>
              {(d.moneyDemanded || d.moneyPaid) && <Field label="Amount (₹)" className="mt-3 max-w-xs"><input inputMode="numeric" className="sol-light-input" value={d.amount} onChange={(e) => set('amount')(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="5000" /></Field>}
            </div>
            <div className="pt-5 border-t border-violet-100 space-y-4">
              <span className="sol-light-label">Who is responsible?</span>
              <div className="flex flex-wrap gap-2">
                {[['unknown', 'I don’t know'], ['suspect', 'I suspect someone'], ['known', 'I know who it is']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set('suspect')(v)} aria-pressed={d.suspect === v} className={`px-3.5 py-2 rounded-xl border text-xs cursor-pointer ${d.suspect === v ? 'bg-purple-50 border-purple-400 text-purple-800 font-semibold' : 'bg-white border-violet-100 text-zinc-700 hover:bg-violet-50'}`}>{l}</button>
                ))}
              </div>
              {d.suspect !== 'unknown' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Name"><input className="sol-light-input" value={d.suspectName} onChange={set('suspectName')} maxLength={120} /></Field>
                  <Field label="Relationship to you"><input className="sol-light-input" value={d.suspectRelation} onChange={set('suspectRelation')} maxLength={120} placeholder="e.g. ex-partner, classmate, stranger" /></Field>
                  <Field label="Usernames, phone numbers, IDs" hint="One per line." className="sm:col-span-2"><textarea rows={2} className="sol-light-input resize-y" value={d.suspectHandles} onChange={set('suspectHandles')} maxLength={1000} placeholder={'@fake_profile_123\n+91 98xxxxxx10'} /></Field>
                  <Field label="Anything else about them" className="sm:col-span-2"><input className="sol-light-input" value={d.suspectOther} onChange={set('suspectOther')} maxLength={300} /></Field>
                </div>
              )}
            </div>
            <Field label="Links to the posts, profiles or chats" hint="One per line. Copy them before they are deleted.">
              <textarea rows={3} className="sol-light-input resize-y font-mono text-xs" value={d.links} onChange={set('links')} maxLength={3000} placeholder="https://instagram.com/…" />
            </Field>
            <Field label="Witnesses or people who know (optional)"><input className="sol-light-input" value={d.witnesses} onChange={set('witnesses')} maxLength={300} /></Field>
          </div>

          <aside className="space-y-4">
            <div className={`${card} lg:sticky lg:top-4`}>
              <h4 className="text-sm font-bold text-[#1a1028] flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" />What to include</h4>
              <p className="text-xs text-zinc-600 mt-1">A clear report answers these. You don’t need perfect language — just the facts.</p>
              <ul className="mt-3 space-y-2">
                {DESCRIBE_PROMPTS.map((q) => <li key={q} className="text-xs text-zinc-700 flex gap-2"><span className="text-purple-500 mt-0.5">●</span>{q}</li>)}
              </ul>
              <div className="mt-4 p-3 rounded-xl bg-[#f5f0ff] border border-violet-200 text-xs text-[#5b21b6] leading-relaxed">Write only what you know. If you’re unsure of a detail, say “about” or “I think”.</div>
            </div>
          </aside>
        </div>
      )}

      {/* STEP 2 — photos */}
      {step === 1 && (
        <div className={`${card} space-y-5`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><ImagePlus className="w-5 h-5 text-purple-600" />Add proof files</h4>
              <p className="text-xs text-zinc-600 mt-1 max-w-xl">At least one proof file is required. Add screenshots, photos, receipts, documents, or any other evidence file. Each one is fingerprinted (SHA-256) so you can check it has not changed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={pickRef} type="file" multiple className="hidden" onChange={addFiles} data-testid="report-photos" />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={addFiles} />
              <button onClick={() => camRef.current?.click()} className={softBtn}><Camera className="w-4 h-4" />Take photo</button>
              <button onClick={() => pickRef.current?.click()} disabled={adding > 0} className={primaryBtn}>{adding ? <span className="sol-spinner" /> : <ImagePlus className="w-4 h-4" />}{adding ? 'Fingerprinting…' : 'Add photos / files'}</button>
            </div>
          </div>
          <Check2 checked={sealToVault} onChange={setSealToVault}><ShieldCheck className="w-4 h-4 text-purple-600" />Also seal new files in my Evidence Vault (fingerprint only, saved in this browser)</Check2>

          {photos.length === 0 ? (
            <button onClick={() => pickRef.current?.click()} className="w-full p-10 rounded-xl border-2 border-dashed border-violet-200 hover:border-purple-400 hover:bg-violet-50/60 text-center cursor-pointer transition-colors">
              <ImagePlus className="w-8 h-8 text-purple-500 mx-auto" />
              <p className="text-sm text-[#1a1028] font-semibold mt-3">No photos yet</p>
              <p className="text-xs text-zinc-500 mt-1">Click to choose files. They stay on your device.</p>
            </button>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {photos.map((p, i) => (
                <li key={p.id} className="rounded-xl border border-violet-100 bg-[#fcfbff] overflow-hidden flex flex-col">
                  <div className="relative aspect-video bg-violet-50 grid place-items-center">
                    {p.isImage ? <img src={p.url} alt={p.caption || p.name} className="w-full h-full object-contain" /> : <FileText className="w-10 h-10 text-purple-400" />}
                    <span className="absolute top-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/90 text-purple-700 border border-purple-200">A-{i + 1}</span>
                    <button onClick={() => removePhoto(p.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-zinc-500 hover:text-rose-600 cursor-pointer" aria-label={`Remove ${p.name}`}><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-3 space-y-2 flex-1 flex flex-col">
                    <input className="sol-light-input !py-2 !text-xs" value={p.caption} onChange={(e) => caption(p.id, e.target.value)} maxLength={200} placeholder="What does this show? e.g. Threat message from @x on 12 Oct" aria-label={`Caption for ${p.name}`} />
                    <div className="text-[10px] font-mono text-zinc-500 truncate">{p.name} · {formatSize(p.size)}</div>
                    <div className="text-[10px] font-mono text-purple-700 truncate" title={p.hash}>SHA-256 {p.hash}</div>
                    <div className="flex gap-1 mt-auto pt-1">
                      <button onClick={() => movePhoto(p.id, -1)} disabled={i === 0} className="px-2 py-1 rounded-md text-[10px] font-mono text-zinc-600 hover:bg-violet-100 disabled:opacity-30 cursor-pointer">← Earlier</button>
                      <button onClick={() => movePhoto(p.id, 1)} disabled={i === photos.length - 1} className="px-2 py-1 rounded-md text-[10px] font-mono text-zinc-600 hover:bg-violet-100 disabled:opacity-30 cursor-pointer">Later →</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {otherVault > 0 && (
            <div className="pt-5 border-t border-violet-100">
              <Check2 checked={d.includeVault} onChange={set('includeVault')}>List my other {otherVault} sealed Evidence Vault file(s) as Annexure B</Check2>
            </div>
          )}
          <p className="text-[11px] text-zinc-500 leading-relaxed">Photos are kept only in this tab. If you reload, add them again — the text of your report is saved. Keep the original files and phone safe; the police may ask for them.</p>
        </div>
      )}

      {/* STEP 3 — your details */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`${card} lg:col-span-2 space-y-5`}>
            <h4 className="text-base font-bold text-[#1a1028]">Your details</h4>
            <p className="text-xs text-zinc-600">Required: your name and either a phone number or email. Address, age, station, and other details are optional.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name (as on ID)"><input className="sol-light-input" value={d.name} onChange={set('name')} maxLength={120} autoComplete="name" /></Field>
              <Field label="Age (optional)"><input inputMode="numeric" className="sol-light-input" value={d.age} onChange={(e) => set('age')(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
              <Field label="Phone"><input type="tel" className="sol-light-input" value={d.phone} onChange={set('phone')} maxLength={20} autoComplete="tel" placeholder="+91" /></Field>
              <Field label="Email"><input type="email" className="sol-light-input" value={d.email} onChange={set('email')} maxLength={200} autoComplete="email" /></Field>
              <Field label="Address" className="sm:col-span-2"><input className="sol-light-input" value={d.address} onChange={set('address')} maxLength={300} autoComplete="street-address" /></Field>
              <Field label="City / district"><input className="sol-light-input" value={d.city} onChange={set('city')} maxLength={80} /></Field>
              <Field label="State"><input className="sol-light-input" value={d.state} onChange={set('state')} maxLength={80} /></Field>
              <Field label="Parent / guardian (if under 18)" className="sm:col-span-2"><input className="sol-light-input" value={d.guardian} onChange={set('guardian')} maxLength={120} /></Field>
            </div>
            <Check2 checked={d.confidential} onChange={set('confidential')}>Ask the police to keep my identity confidential</Check2>
          </div>
          <div className={`${card} space-y-4`}>
            <h4 className="text-base font-bold text-[#1a1028]">Who is it for?</h4>
            <div className="space-y-2">
              {AUTHORITIES.map((a) => (
                <button key={a.id} type="button" onClick={() => set('authority')(a.id)} aria-pressed={d.authority === a.id}
                  className={`w-full p-3.5 rounded-xl border text-left cursor-pointer transition-colors ${d.authority === a.id ? 'bg-purple-50 border-purple-400' : 'bg-white border-violet-100 hover:bg-violet-50'}`}>
                  <div className={`text-sm font-semibold ${d.authority === a.id ? 'text-purple-800' : 'text-[#1a1028]'}`}>{a.title}</div>
                  <div className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">{a.hint}</div>
                </button>
              ))}
            </div>
            {d.authority === 'police' && <Field label="Police station name" hint="The station for the area where you live or where it happened."><input className="sol-light-input" value={d.stationName} onChange={set('stationName')} maxLength={120} placeholder="e.g. Koregaon Park Police Station" /></Field>}
          </div>
        </div>
      )}

      {/* STEP 4 — review */}
      {step === 3 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => window.print()} disabled={!canGenerate} className={primaryBtn}><Printer className="w-4 h-4" />Print / Save as PDF</button>
              <button onClick={copy} disabled={!canGenerate} className={softBtn}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied!' : 'Copy text'}</button>
              <button onClick={downloadTxt} disabled={!canGenerate} className={softBtn}><Download className="w-4 h-4" />Download .txt</button>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-white shadow-[0_16px_48px_rgba(124,58,237,0.10)] p-6 sm:p-10 overflow-x-auto" data-testid="report-preview">
              <ReportDocument r={report} />
            </div>
          </div>
          <aside className="space-y-4">
            <div className={card}>
              <h4 className="text-sm font-bold text-[#1a1028] flex items-center gap-2">{missing.length ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}Report check</h4>
              {missing.length === 0 ? <p className="text-xs text-emerald-700 mt-2">Looks complete. Read it once more, then print or copy it.</p> : (
                <ul className="mt-3 space-y-2">
                  {missing.map(([sev, m]) => <li key={m} className={`text-xs flex gap-2 ${sev === 'bad' ? 'text-rose-700' : 'text-amber-700'}`}><span className="mt-0.5">{sev === 'bad' ? '●' : '○'}</span>{m}</li>)}
                </ul>
              )}
              {missing.length > 0 && <p className="text-[11px] text-zinc-500 mt-3">Items marked in red are required. Details marked in amber are optional; the report won’t invent missing facts.</p>}
              {blocking.length > 0 && <button onClick={() => goStep(blocking[0][1].includes('name') || blocking[0][1].includes('phone') || blocking[0][1].includes('email') ? 2 : blocking[0][1].includes('proof') ? 1 : 0)} className="mt-3 text-xs font-mono text-purple-700 underline underline-offset-2 cursor-pointer">Fix the first required item</button>}
            </div>
            <div className={card}>
              <h4 className="text-sm font-bold text-[#1a1028]">How to submit it</h4>
              <ol className="mt-3 space-y-3 text-xs text-zinc-700 list-decimal pl-4">
                {d.authority === 'portal' ? (
                  <>
                    <li>Open cybercrime.gov.in → “Report Women/Child Related Crime” or “Report Other Cyber Crime”.</li>
                    <li>Paste the copied text into the description and upload the same photos.</li>
                    <li>Save the acknowledgement number it gives you.</li>
                  </>
                ) : (
                  <>
                    <li>Print two copies and sign both.</li>
                    <li>Take them, your ID and your phone (with the originals) to the {d.authority === 'cyber-cell' ? 'cyber cell' : 'police station'}.</li>
                    <li>Ask for a stamped receipt or FIR number on your copy. If they refuse to register it, you can send it to the Superintendent of Police or file on cybercrime.gov.in.</li>
                  </>
                )}
              </ol>
              <div className="flex flex-wrap gap-2 mt-4">
                <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" className={softBtn}><ExternalLink className="w-3.5 h-3.5" />cybercrime.gov.in</a>
                <a href="tel:1930" className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-mono flex items-center gap-2"><PhoneCall className="w-3.5 h-3.5" />1930</a>
              </div>
              <p className="text-[11px] text-zinc-500 mt-4 leading-relaxed">Lost money? Call 1930 right away — banks can sometimes hold the transfer if reported quickly. Solace is not a lawyer; free legal aid: NALSA 15100.</p>
            </div>
          </aside>
        </div>
      )}

      {/* nav */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => goStep(step - 1)} disabled={step === 0} className={`${softBtn} disabled:opacity-40 disabled:cursor-not-allowed`}><ArrowLeft className="w-4 h-4" />Back</button>
        {step < STEPS.length - 1 && (
          <div className="flex items-center gap-3">
            {!canNext && <span className="text-[11px] text-zinc-500 hidden sm:inline">{stepHint}</span>}
            <button onClick={() => goStep(step + 1)} disabled={!canNext} className={primaryBtn}>Next: {STEPS[step + 1]}<ArrowRight className="w-4 h-4" /></button>
          </div>
        )}
        {step === STEPS.length - 1 && <button onClick={() => window.print()} disabled={!canGenerate} className={primaryBtn}><Printer className="w-4 h-4" />Print / Save as PDF</button>}
      </div>

      {canGenerate && createPortal(<div className="sol-print-root"><ReportDocument r={report} /></div>, document.body)}
    </div>
  );
}
