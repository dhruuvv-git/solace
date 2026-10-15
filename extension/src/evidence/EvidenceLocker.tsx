/** Evidence Locker UI: view, verify, export, delete. Everything stays in local IndexedDB. */
import { useEffect, useState } from 'react';
import type { EvidenceRecord } from '../shared/types';
import { useApp } from '../ui/app-context';
import { ErrorNote, FileDrop, Icon, Modal, downloadFile, readFileDataUrl, useConfirm, useToast } from '../ui/components';
import { clearEvidence, deleteEvidence, listEvidence, saveEvidence, verifyFingerprint } from './evidence-store';
import { buildHtmlReport, buildJsonExport } from './report-export';

export function EvidenceLocker() {
  const { refreshKey, bump, takeIncoming, incoming } = useApp();
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const [items, setItems] = useState<EvidenceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<EvidenceRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    listEvidence().then((x) => { setItems(x); setError(null); }).catch((e) => setError((e as Error).message));
  }, [refreshKey]);
  useEffect(() => { const inc = takeIncoming('locker'); if (inc?.highlightId) setHighlight(inc.highlightId); }, [incoming, takeIncoming]);

  const chosen = () => (items ?? []).filter((i) => sel.size === 0 || sel.has(i.id));
  const exportAs = async (kind: 'html' | 'json') => {
    const recs = chosen();
    if (!recs.length) { toast('Nothing to export yet.', 'bad'); return; }
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      if (kind === 'html') downloadFile(`solace-evidence-${stamp}.html`, await buildHtmlReport(recs), 'text/html');
      else downloadFile(`solace-evidence-${stamp}.json`, buildJsonExport(recs), 'application/json');
      toast(`Exported ${recs.length} item(s)`);
    } catch (e) { toast(`Export failed: ${(e as Error).message}`, 'bad'); }
  };

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h2>Evidence Locker</h2>
        <p>Your private folder of proof. Save abusive or threatening messages and screenshots here <strong>before</strong> you block, delete or report. Each item records the date, source and a tamper-check code (SHA-256 fingerprint), and you can export everything as a clean report for the police, cybercrime.gov.in, your school or the app. Nothing leaves this device unless you export it.</p>
      </div>
      <div className="row">
        <button className="btn primary sm" onClick={() => setAdding(true)}>Add evidence</button>
        <button className="btn sm" onClick={() => exportAs('html')}><Icon name="download" size={14} />Export report{sel.size ? ` (${sel.size})` : ''}</button>
        <button className="btn sm" onClick={() => exportAs('json')}>Export JSON</button>
        {sel.size > 0 && <button className="btn danger sm" onClick={async () => {
          if (await confirm('Delete selected evidence?', `${sel.size} item(s) will be permanently deleted from this device.`, 'Delete')) {
            await deleteEvidence([...sel]); setSel(new Set()); bump(); toast('Deleted');
          }
        }}>Delete selected</button>}
        {items && items.length > 0 && sel.size === 0 && <button className="btn danger sm" onClick={async () => {
          if (await confirm('Delete all evidence?', `All ${items.length} item(s) will be permanently deleted. Export a report first if you may need it.`, 'Delete all')) {
            await clearEvidence(); bump(); toast('Evidence Locker emptied');
          }
        }}>Delete all</button>}
      </div>
      {error && <ErrorNote message={error} />}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items && items.length === 0 && (
        <div className="empty"><Icon name="locker" size={28} /><p>Nothing saved yet.</p><p className="small">Use “Save to Evidence Locker” after a check, right-click selected text on a page → Save selection as evidence, or add something manually.</p></div>
      )}
      {items && items.length > 0 && (
        <div className="stack">
          <label className="check small"><input type="checkbox" checked={sel.size === items.length} onChange={(e) => setSel(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} />Select all</label>
          {items.map((it) => (
            <div key={it.id} className="panel" style={{ padding: 12, borderColor: highlight === it.id ? 'var(--lens)' : undefined }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" aria-label="Select item" checked={sel.has(it.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(it.id); else n.delete(it.id); return n; })} style={{ marginTop: 4 }} />
                <div className="grow stack" style={{ gap: 4 }}>
                  <div className="row-between">
                    <strong className="small">{new Date(it.timestamp).toLocaleString()}</strong>
                    {it.riskLevel ? <span className={`badge ${['high', 'emergency'].includes(it.riskLevel) ? 'bad' : it.riskLevel === 'medium' ? 'warn' : ''}`}>{it.riskLevel} {it.riskScore}/25</span>
                      : it.category && it.category !== 'none' ? <span className="badge">{it.category}</span> : null}
                  </div>
                  <p className="small" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{it.text || '(screenshot only)'}</p>
                  <p className="xs muted">{it.platform === 'manual' ? 'Added manually' : it.platform}{it.senderLabel ? `, sender “${it.senderLabel}”` : ''}{it.screenshot ? ', with screenshot' : ''}</p>
                  <div className="row"><button className="btn sm" onClick={() => setOpen(it)}>View</button></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && <EvidenceDetail rec={open} onClose={() => setOpen(null)} onDelete={async () => {
        if (await confirm('Delete this evidence?', 'It will be permanently removed from this device.', 'Delete')) { await deleteEvidence([open.id]); setOpen(null); bump(); toast('Deleted'); }
      }} />}
      {adding && <AddEvidence onClose={() => setAdding(false)} onSaved={() => { setAdding(false); bump(); }} />}
      {node}
    </div>
  );
}

function EvidenceDetail({ rec, onClose, onDelete }: { rec: EvidenceRecord; onClose: () => void; onDelete: () => void }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { verifyFingerprint(rec).then(setOk); }, [rec]);
  return (
    <Modal title="Evidence" onClose={onClose}>
      <dl className="kv">
        <dt>Saved</dt><dd>{new Date(rec.timestamp).toLocaleString()} <span className="muted xs">({rec.timestamp})</span></dd>
        <dt>Source</dt><dd>{rec.url === 'manual-entry' ? 'Added manually' : rec.url}</dd>
        {rec.senderLabel && <><dt>Sender</dt><dd>{rec.senderLabel}</dd></>}
        {rec.category && <><dt>Category</dt><dd>{rec.category}</dd></>}
        {rec.riskScore !== undefined && <><dt>Risk</dt><dd>{rec.riskScore}/25 ({rec.riskLevel})</dd></>}
        {rec.note && <><dt>Note</dt><dd>{rec.note}</dd></>}
        <dt>Fingerprint</dt><dd><code className="xs">{rec.fingerprint}</code></dd>
        <dt>Check</dt><dd>{ok === null ? 'Checking…' : ok ? <span className="badge good">Unchanged since saved</span> : <span className="badge bad">Does not match — record changed</span>}</dd>
      </dl>
      {rec.text && <p style={{ whiteSpace: 'pre-wrap', background: 'var(--night)', padding: 10, borderRadius: 8 }} className="small">{rec.text}</p>}
      {rec.screenshot && <img src={rec.screenshot} alt="Saved screenshot" className="thumb" style={{ maxHeight: 360 }} />}
      <p className="xs muted">The fingerprint shows this record hasn’t changed since it was saved. It can’t prove the original content was genuine.</p>
      <div className="row" style={{ justifyContent: 'space-between' }}><button className="btn danger sm" onClick={onDelete}>Delete</button><button className="btn sm" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function AddEvidence({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [sender, setSender] = useState('');
  const [note, setNote] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Add evidence" onClose={onClose}>
      <label className="field"><span className="lbl">Message text</span><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <label className="field"><span className="lbl">Sender (optional)</span><input type="text" maxLength={80} value={sender} onChange={(e) => setSender(e.target.value)} /></label>
      <label className="field"><span className="lbl">Note (optional)</span><input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where and when this happened" /></label>
      {shot ? <div className="stack"><img src={shot} alt="Screenshot to save" className="thumb" /><button className="btn ghost sm" onClick={() => setShot(null)}>Remove screenshot</button></div>
        : <FileDrop accept="image/png,image/jpeg,image/webp" label="Add screenshot" onFile={async (f) => { try { setShot(await readFileDataUrl(f)); } catch (e) { setErr((e as Error).message); } }} />}
      {err && <ErrorNote message={err} />}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => {
          setErr(null);
          try {
            await saveEvidence({ text, senderLabel: sender.trim() || undefined, note: note.trim() || undefined, screenshot: shot ?? undefined, url: 'manual-entry', platform: 'manual', source: 'side-panel' });
            toast('Saved to Evidence Locker'); onSaved();
          } catch (e) { setErr((e as Error).message); }
        }}>Save evidence</button>
      </div>
    </Modal>
  );
}
