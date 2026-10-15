import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Link2, Puzzle, RefreshCw, Send, ShieldCheck, Smartphone, Unlink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { DOWNLOAD_URL, Mimi } from '../lib/mimi';
import { useToast } from './Toaster';

const card = 'p-6 rounded-2xl bg-white border border-violet-100';

const STATE_COPY = {
  checking: { kicker: 'CHECKING YOUR BROWSER', title: 'Looking for Mimi…', tone: 'text-zinc-600' },
  installed: { kicker: 'INSTALLED', title: 'Mimi is in this browser.', tone: 'text-emerald-600' },
  update: { kicker: 'UPDATE AVAILABLE', title: 'A newer Mimi is ready.', tone: 'text-amber-600' },
  missing: { kicker: 'NOT INSTALLED', title: 'Add Mimi to this browser.', tone: 'text-purple-700' },
  unsupported: { kicker: 'DIFFERENT BROWSER', title: 'Mimi needs Chrome, Edge or Brave on a computer.', tone: 'text-zinc-600' },
};

/** Status + account link for the extension. `status` comes from useMimiStatus(). */
export function MimiConnectCard({ status, compact = false, autoLink = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const tried = useRef(false);
  const installed = status.state === 'installed' || status.state === 'update';
  const acct = status.account;
  const linkedToMe = installed && acct?.status === 'signed-in' && acct.userId === user?.id;
  const linkedToOther = installed && acct?.status === 'signed-in' && acct.userId !== user?.id;
  const copy = STATE_COPY[status.state] ?? STATE_COPY.checking;

  const link = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await Mimi.localAccount(user);
      if (!r?.ok) throw new Error('Mimi is not reachable. Reload this page after installing the extension.');
      toast(`Mimi is signed in as ${user.email} on this browser.`);
      await status.refresh();
    } catch (e) {
      setMsg({ tone: 'error', text: e.message });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (autoLink && !tried.current && installed && !linkedToMe && user) { tried.current = true; link(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLink, installed, linkedToMe, user]);

  return (
    <div className={`${card} relative overflow-hidden`} data-testid="mimi-status" data-state={status.state} data-linked={linkedToMe ? 'yes' : 'no'}>
      <div aria-hidden="true" className="absolute -top-24 -right-20 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%)' }} />
      <div className="relative flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="w-20 h-20 shrink-0 rounded-2xl bg-purple-500/10 border border-purple-500/30 grid place-items-center shadow-[0_0_24px_rgba(168,85,247,0.25)]">
          <img src="/solace-robot.png" alt="" className="w-14 h-14 object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-mono tracking-widest ${copy.tone}`}>{copy.kicker}{installed && status.version ? ` · v${status.version}` : ''}</span>
          <h3 className="text-xl font-bold text-[#1a1028] mt-1">{copy.title}</h3>
          <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
            {status.state === 'missing' && 'A downloaded ZIP is not installed yet. Extract it, choose Load unpacked on chrome://extensions, then reload this page so Mimi can be detected.'}
            {status.state === 'update' && `You have ${status.version}; ${status.latestVersion} is available. Download it, replace the old folder, then press Reload on chrome://extensions.`}
            {status.state === 'unsupported' && 'Everything else in your workspace works here. Install Mimi from a desktop Chromium browser.'}
            {installed && linkedToMe && <>Signed in as <strong className="text-zinc-800">{user.email}</strong>.</>}
            {installed && linkedToOther && <>Mimi is signed in as <strong className="text-zinc-800">{acct.email}</strong>.</>}
            {installed && !linkedToMe && !linkedToOther && 'Mimi works without an account. Website account linking is unavailable in this Vercel-only version.'}
          </p>
        </div>
      </div>

      <div className="relative flex flex-wrap gap-3 mt-5">
        <a href={DOWNLOAD_URL} download className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(124,58,237,0.4)]">
          <Download className="w-4 h-4" />{status.state === 'update' ? 'Download update' : 'Download Mimi'}
        </a>
        {installed && !linkedToMe && !linkedToOther && (
          <button onClick={link} disabled={busy} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(124,58,237,0.4)] disabled:opacity-50">
            <Link2 className="w-4 h-4" />{busy ? 'Syncing sign-in…' : 'Sync website sign-in'}
          </button>
        )}
        <button disabled={!installed} title={!installed ? 'Install Mimi to open it from this page.' : 'Open Mimi'} onClick={async () => { const r = await Mimi.open(); if (!r?.ok) setMsg({ tone: 'error', text: 'Mimi did not respond. Reload this page and try again.' }); else if (!r.opened) setMsg({ tone: 'info', text: r.hint }); }}
          className="px-4 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-zinc-800 text-xs font-mono flex items-center gap-2 transition-colors border border-violet-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          <ExternalLink className="w-4 h-4" />Open Mimi
        </button>
        {!compact && (
          <button onClick={() => status.refresh()} className="px-4 py-2.5 rounded-xl text-zinc-600 hover:text-[#5b21b6] text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer">
            <RefreshCw className="w-4 h-4" />Check again
          </button>
        )}
      </div>
      {msg && <div className={`relative mt-4 sol-alert ${msg.tone === 'error' ? 'sol-alert--error' : 'sol-alert--info'}`} role="status">{msg.text}</div>}
    </div>
  );
}

const STEPS = [
  ['Download', 'Get solace-extension.zip with the button above.'],
  ['Unzip', 'Extract it into a folder you will keep, e.g. Documents/Mimi.'],
  ['Developer mode', 'Open chrome://extensions and switch on Developer mode (top right).'],
  ['Load unpacked', 'Click Load unpacked and choose the folder that contains manifest.json.'],
  ['Pin & connect', 'Pin Mimi from the puzzle icon, reload this page and press Connect.'],
];

export default function MimiPanel({ status, autoLink, onReport }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [hint, setHint] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [reportingId, setReportingId] = useState(null);
  const installed = status.state === 'installed' || status.state === 'update';

  const refreshHistory = useCallback(async () => {
    if (!installed) return;
    const result = await Mimi.history();
    if (result?.ok && Array.isArray(result.history)) setHistory(result.history);
  }, [installed]);
  useEffect(() => {
    void refreshHistory();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refreshHistory(); }, 3000);
    window.addEventListener('focus', refreshHistory);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshHistory); };
  }, [refreshHistory]);

  const reportCheck = async (entry) => {
    setReportingId(entry.id);
    try {
      const imageResult = entry.hasImage ? await Mimi.historyImage(entry.id) : null;
      if (entry.hasImage && (!imageResult?.ok || !imageResult.imageData)) throw new Error('Mimi could not retrieve the saved image. Try again.');
      window.solaceMimiReportDraft = { title: entry.title, outcome: entry.outcome, shield: entry.shield, text: entry.text || null, imageData: imageResult?.imageData || null };
      onReport?.();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setReportingId(null); }
  };
  const clearChecks = async () => {
    setHistoryBusy(true);
    try {
      const result = await Mimi.clearHistory();
      if (!result?.ok) throw new Error(result?.error || 'Mimi did not respond.');
      setHistory([]);
      toast('Recent checks cleared in Mimi and Solace.');
    } catch (e) { toast(`Could not clear Mimi history: ${e.message}`, 'bad'); }
    finally { setHistoryBusy(false); }
  };

  const ask = async (mode) => {
    if (!text.trim()) { toast('Paste a message first.', 'bad'); return; }
    if (!installed) { toast('Install Mimi first — it only takes a minute.', 'bad'); return; }
    const r = await Mimi.check(mode, text);
    if (!r?.ok) { toast(r?.error || 'Mimi did not respond. Reload this page and try again.', 'bad'); return; }
    if (r.opened) { setHint(null); toast('Sent to Mimi — her answer is in the side panel.'); } else setHint(r.hint || 'Sent. Click the Mimi icon in the toolbar to see her answer.');
  };

  return (
    <div className="space-y-6">
      <MimiConnectCard status={status} autoLink={autoLink} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={card}>
          <h3 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><Send className="w-4 h-4 text-purple-600" />Ask Mimi</h3>
          <p className="text-xs text-zinc-600 mt-1 leading-relaxed">Paste a message. It goes from this page straight to the extension in your browser — no server in between.</p>
          <label className="sr-only" htmlFor="ask-mimi">Message to check</label>
          <textarea id="ask-mimi" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} placeholder="e.g. “Send ₹5000 by tonight or I post your photos”" className="sol-light-input mt-4 resize-y" />
          <div className="flex flex-wrap gap-2 mt-3">
            {[['safety', 'Am I safe?'], ['kind', 'Is it kind?'], ['misinfo', 'Is it real?']].map(([m, label]) => (
              <button key={m} onClick={() => ask(m)} aria-disabled={!installed}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${installed ? 'bg-purple-600/20 border-purple-500/40 text-purple-800 hover:bg-purple-600/40 hover:text-[#5b21b6]' : 'bg-violet-50/60 border-violet-100 text-zinc-500'}`}>
                {label}
              </button>
            ))}
          </div>
          {hint && <div className="sol-alert sol-alert--info mt-4">{hint}</div>}
        </div>

        <div className={card}>
          <h3 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-purple-600" />What Mimi adds</h3>
          <ul className="mt-4 space-y-3 text-sm text-zinc-700">
            {[
              ['Is it real?', 'Seven on-device signals for photos and forwards.'],
              ['Is it kind?', 'Hides hurtful messages; warns before you send one.'],
              ['Is it really them?', 'Lookalike usernames and copied profile photos.'],
              ['Am I safe?', 'Risk score and a calm plan for threats and blackmail.'],
              ['Evidence Locker', 'Saves chats with a SHA-256 fingerprint.'],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /><span><strong className="text-[#1a1028]">{t}</strong> <span className="text-zinc-600">{b}</span></span></li>
            ))}
          </ul>
          <p className="text-[11px] font-mono text-zinc-500 mt-4 flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" />Desktop Chrome, Edge or Brave · WhatsApp Web & Instagram</p>
        </div>
      </div>

      <section className={card} aria-labelledby="mimi-recent-checks">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="mimi-recent-checks" className="text-base font-bold text-[#1a1028]">Mimi’s stored messages &amp; recent checks</h3>
            <p className="text-xs text-zinc-600 mt-1">Synced live from Mimi on this browser. Message text and up to five checked images stay on this device for one-click reports.</p>
          </div>
          <button type="button" onClick={clearChecks} disabled={!installed || historyBusy || history.length === 0} className="px-3 py-2 rounded-lg text-xs font-mono text-zinc-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{historyBusy ? 'Clearing…' : 'Clear checks'}</button>
        </div>
        {!installed ? <p className="mt-4 text-sm text-zinc-500">Install Mimi to see checks and stored messages from the extension.</p> : history.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No stored messages or checks yet. Messages you check or save in Mimi will appear here.</p> : (
          <ul className="mt-4 divide-y divide-violet-100" data-testid="mimi-history">
            {history.slice(0, 30).map((entry) => <li key={entry.id} className="py-3.5 flex flex-col sm:flex-row sm:items-start gap-3">
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-mono border mt-0.5 ${entry.tone === 'bad' ? 'bg-rose-50 border-rose-200 text-rose-700' : entry.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-violet-50 border-violet-200 text-violet-700'}`}>{entry.outcome}</span>
              <div className="grow min-w-0">
                <div className="text-sm font-semibold text-zinc-800">{entry.title}</div>
                {entry.text && (
                  <p className="text-xs text-zinc-700 mt-1.5 line-clamp-2 italic font-sans bg-violet-50/60 px-3 py-2 rounded-xl border border-violet-100/70">
                    “{entry.text}”
                  </p>
                )}
                <div className="text-[11px] text-zinc-400 mt-1">{new Date(entry.ts).toLocaleString()}</div>
              </div>
              <button type="button" onClick={() => reportCheck(entry)} disabled={reportingId === entry.id} className="shrink-0 px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-mono disabled:opacity-50 cursor-pointer">{reportingId === entry.id ? 'Opening…' : entry.hasImage ? 'Report with image' : 'Report this'}</button>
            </li>)}
          </ul>
        )}
      </section>

      <div className={card}>
        <h3 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><Puzzle className="w-4 h-4 text-purple-600" />Install in five steps</h3>
        <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mt-4">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="p-4 rounded-xl bg-[#fcfbff] border border-violet-100">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">STEP {String(i + 1).padStart(2, '0')}</span>
              <strong className="block text-sm text-[#1a1028] mt-3">{t}</strong>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{b}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-zinc-500 mt-4 flex items-center gap-2"><Unlink className="w-3.5 h-3.5" />Sign Mimi out any time from Mimi’s Settings or from Account → Linked devices here.</p>
      </div>
    </div>
  );
}
