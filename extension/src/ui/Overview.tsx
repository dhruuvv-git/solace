import { useEffect, useState } from 'react';
import { assessPattern } from '../engine/bullying-patterns';
import { analyzeMisinformation } from '../engine/misinformation';
import { analyzeThreat } from '../engine/threat-analysis';
import { analyzeToxicity } from '../engine/toxicity';
import { clearHistory, listHistory, listPatterns } from '../shared/local-data';
import type { PingReply } from '../shared/messaging';
import type { HistoryEntry, SenderPattern } from '../shared/types';
import { useLexicon } from '../shields/kind/KindShield';
import { useApp, type View } from './app-context';
import { Icon, useConfirm } from './components';
import { isExtension } from './env';
import { APP } from '../shared/app-config';

const SHIELDS: { view: View; icon: string; title: string; body: string }[] = [
  { view: 'real', icon: 'real', title: 'Is it real?', body: 'Photos and forwards: seven evidence signals, a clear verdict with its confidence.' },
  { view: 'kind', icon: 'kind', title: 'Is it kind?', body: 'Pause before posting and notice when someone keeps targeting you.' },
  { view: 'identity', icon: 'identity', title: 'Is it really them?', body: 'Lookalike usernames, copied photos and scam-like accounts.' },
  { view: 'safety', icon: 'safety', title: 'Am I safe?', body: 'Threats and blackmail: a calm plan and evidence you can keep.' },
];

function useTabStatus() {
  const [status, setStatus] = useState<{ platform: string; reply: PingReply | null; url?: string } | null>(null);
  useEffect(() => {
    if (!isExtension() || !chrome.tabs) return;
    let alive = true;
    const check = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id) return;
        let reply: PingReply | null = null;
        try { reply = await chrome.tabs.sendMessage(tab.id, { type: 'TL_PING' }); } catch { reply = null; }
        let platform = 'web';
        try { const h = new URL(tab.url ?? '').hostname; platform = h === 'web.whatsapp.com' ? 'WhatsApp Web' : h.endsWith('instagram.com') ? 'Instagram' : 'this site'; } catch { /* no url permission */ }
        if (alive) setStatus({ platform, reply, url: tab.url });
      } catch { /* ignore */ }
    };
    void check();
    const onAct = () => void check();
    chrome.tabs.onActivated?.addListener(onAct);
    chrome.tabs.onUpdated?.addListener(onAct);
    return () => { alive = false; chrome.tabs.onActivated?.removeListener(onAct); chrome.tabs.onUpdated?.removeListener(onAct); };
  }, []);
  return status;
}

export function Overview() {
  const { go, refreshKey, bump, mode } = useApp();
  const lex = useLexicon();
  const [text, setText] = useState('');
  const [quick, setQuick] = useState<null | { mis: ReturnType<typeof analyzeMisinformation>; tox: ReturnType<typeof analyzeToxicity>; thr: ReturnType<typeof analyzeThreat> }>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [alerts, setAlerts] = useState<SenderPattern[]>([]);
  const { confirm, node } = useConfirm();
  const tab = useTabStatus();

  useEffect(() => {
    listHistory().then(setHistory).catch(() => setHistory([]));
    listPatterns().then((ps) => setAlerts(ps.filter((p) => assessPattern(p).alert))).catch(() => setAlerts([]));
  }, [refreshKey]);

  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <h1 style={{ fontSize: 26 }}>Hi, I’m {APP.assistant}. Let’s check it before you trust, share or reply.</h1>
        <p className="muted">I look at photos, forwards, messages and accounts, explain what I found, and tell you how sure I am. Tap my name at the top for everything I can do.</p>
        <p className="row small"><span className="badge good">Private</span><span className="muted">Every check runs on this device. Nothing is uploaded.</span></p>
      </div>

      {mode === 'extension' && tab && (
        <div className="notice">
          {tab.reply ? (
            <><strong>Active on {tab.platform}.</strong> {Object.entries(tab.reply.features).map(([k, v]) => `${k}: ${v}`).join(', ')}.{tab.reply.notes.length ? ` ${tab.reply.notes.join(' ')}` : ''}</>
          ) : (
            <><strong>Page tools are not running on {tab.platform}.</strong> You can still paste text or images here, or right-click text and images on the page. {tab.platform !== 'this site' && 'If you just installed Solace, reload the page.'}</>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="verdict bad">
          <div className="verdict-title">Repeated targeting detected</div>
          <p>{alerts.map((a) => a.label).join(', ')} {alerts.length === 1 ? 'has' : 'have'} sent several hurtful messages recently.</p>
          <div className="row"><button className="btn sm" onClick={() => go('kind')}>Open Pattern Detector</button><button className="btn sm" onClick={() => go('safety')}>Get a safety plan</button></div>
        </div>
      )}

      <section className="section panel">
        <h3>Quick check</h3>
        <label className="field"><span className="lbl">Paste a message, forward or chat</span>
          <textarea rows={3} value={text} onChange={(e) => { setText(e.target.value); setQuick(null); }} placeholder="Anything you’re unsure about" />
        </label>
        <div className="row">
          <button className="btn primary" disabled={!text.trim()} onClick={() => setQuick({ mis: analyzeMisinformation(text), tox: analyzeToxicity(text, lex), thr: analyzeThreat(text) })}>Check</button>
          <button className="btn" onClick={() => go('real')}><Icon name="upload" size={15} />Check an image</button>
        </div>
        {quick && (
          <div className="list">
            {quick.thr.level === 'emergency' && <div className="notice bad"><strong>Possible immediate danger.</strong> Open “Am I safe?” now. If you are in danger, call 112.</div>}
            <QuickRow label="Hoax-style forward" value={`${quick.mis.level} (p = ${quick.mis.p.toFixed(2)})`} tone={quick.mis.level === 'high' ? 'bad' : quick.mis.level === 'medium' ? 'warn' : ''} onOpen={() => go('real', { view: 'real', text })} />
            <QuickRow label="Hurtful language" value={quick.tox.level === 'none' ? 'none found' : `${quick.tox.level} (${quick.tox.categories.join(', ')})`} tone={quick.tox.level === 'none' ? 'good' : quick.tox.level === 'mild' ? 'warn' : 'bad'} onOpen={() => go('kind', { view: 'kind', text })} />
            <QuickRow label="Threat risk" value={!quick.thr.primary ? 'no threat pattern' : quick.thr.primary === 'abuse' ? 'abusive message, not a threat' : `${quick.thr.sexual ? 'sexual violence threat' : quick.thr.primary === 'physical' ? 'threat of violence' : quick.thr.primary}: ${quick.thr.level} (${quick.thr.risk}/25)`} tone={quick.thr.primary === 'abuse' ? 'warn' : quick.thr.level === 'emergency' || quick.thr.level === 'high' ? 'bad' : quick.thr.level === 'medium' ? 'warn' : ''} onOpen={() => go('safety', { view: 'safety', text })} />
          </div>
        )}
      </section>

      <section className="section">
        <h3>Four shields</h3>
        <div className="stack" style={{ gap: 8 }}>
          {SHIELDS.map((s) => (
            <button key={s.view} className="panel" onClick={() => go(s.view)} style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
              <span style={{ color: 'var(--lens)' }}><Icon name={s.icon} size={24} /></span>
              <span className="grow"><strong>{s.title}</strong><span className="muted small" style={{ display: 'block' }}>{s.body}</span></span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn" onClick={() => go('locker')}><Icon name="locker" size={15} />Evidence Locker</button>
          <button className="btn" onClick={() => go('game')}><Icon name="game" size={15} />Train your eye</button>
        </div>
      </section>

      <section className="section">
        <div className="row-between"><h3>Recent checks</h3>
          {history.length > 0 && <button className="btn ghost sm" onClick={async () => { if (await confirm('Clear recent checks?', 'The list of recent check results will be deleted.', 'Clear')) { await clearHistory(); bump(); } }}>Clear</button>}
        </div>
        {history.length === 0 ? <p className="muted small">Your recent results will show here (results only — never the content).</p> : (
          <div className="list">{history.slice(0, 8).map((h) => (
            <div className="list-item small" key={h.id}>
              <span className={`badge ${h.tone === 'good' ? 'good' : h.tone === 'warn' ? 'warn' : h.tone === 'bad' ? 'bad' : ''}`}>{h.outcome}</span>
              <span className="grow muted">{h.title}</span>
              <span className="xs muted">{new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}</div>
        )}
      </section>
      {node}
    </div>
  );
}

function QuickRow({ label, value, tone, onOpen }: { label: string; value: string; tone: string; onOpen: () => void }) {
  return (
    <div className="list-item">
      <span className="grow small"><strong>{label}</strong><br /><span className={`badge ${tone}`}>{value}</span></span>
      <button className="btn sm" onClick={onOpen}>Details</button>
    </div>
  );
}
