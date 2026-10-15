import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, ShieldCheck, Clock, FileText, PhoneCall, ArrowRight, Lock, Copy, Check, LogOut, Flame,
  Sparkles, FileCheck, ExternalLink, Puzzle, UserRound, Menu, X, Trash2, Download, BadgeCheck, TimerReset, Send,
  HeartHandshake,
} from 'lucide-react';
import { Api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Mimi } from '../lib/mimi';
import { navigate } from '../lib/router';
import { deleteRecord, exportJson, formatSize, istStamp, listRecords, sealFile, verifyFile } from '../lib/vault';
import { CONCERNS } from '../lib/concerns';
import MimiPanel from './MimiPanel';
import AccountPanel from './AccountPanel';
import ReportBuilder from './ReportBuilder';
import AftercarePanel from './AftercarePanel';
import { useToast } from './Toaster';

const HOUR = 3600000;
const GOLDEN_MS = 2 * HOUR; // Official 2-hour rapid response window
const NCII_MS = 2 * HOUR; // IT Rules 3(2)(b) as amended in 2026
const SOURCES = [
  ['IT Rules 2026 explained (iPleaders)', 'https://blog.ipleaders.in/it-rules-2026/'],
  ['MeitY’s 2-hour deepfake window (Bhatt & Joshi Associates)', 'https://bhattandjoshiassociates.com/meitys-2-hour-deepfake-takedown-window-under-it-amendment-rules-2026-constitutionally-proportionate-or-operationally-impossible/'],
];

const card = 'p-6 rounded-2xl bg-white border border-violet-100 shadow-lg';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtSince = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} days`;
};
const concernLabel = (id) => CONCERNS.find((c) => c.id === id)?.title ?? 'Incident';

export default function DashboardView({ tab = 'overview', onTab, mimiStatus, autoLink }) {
  const { user, setUser, signOut } = useAuth();
  const toast = useToast();
  const now = useNow();
  const [drawer, setDrawer] = useState(false);
  const [mimiHovered, setMimiHovered] = useState(false);
  const [records, setRecords] = useState([]);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const [hashing, setHashing] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [verifyFor, setVerifyFor] = useState(null);
  const [verifyResult, setVerifyResult] = useState({});
  const [incBusy, setIncBusy] = useState(false);
  const fileInputRef = useRef(null);
  const verifyInputRef = useRef(null);
  const incident = user?.incident ?? null;

  const loadVault = useCallback(async () => {
    try { setRecords(await listRecords(user.id)); } catch { setRecords([]); } finally { setVaultLoaded(true); }
  }, [user.id]);
  useEffect(() => { loadVault(); }, [loadVault]);

  const go = (t) => { onTab?.(t); setDrawer(false); };
  const handleLogout = async () => { await signOut(); toast('Signed out.'); navigate('/', { replace: true }); };

  const updateIncident = async (patch, msg) => {
    setIncBusy(true);
    try { const r = await Api.incident(patch); setUser(r.user); if (msg) toast(msg); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setIncBusy(false); }
  };
  const startIncident = () => updateIncident({ type: user.onboarding?.concern && user.onboarding.concern !== 'exploring' ? user.onboarding.concern : 'harassment', discoveredAt: Date.now(), noticeSentAt: null }, 'Golden-hour clock started.');
  const markNoticeSent = () => updateIncident(incident ? { noticeSentAt: Date.now() } : { type: 'intimate-images', discoveredAt: Date.now(), noticeSentAt: Date.now() }, 'Notice time recorded — the 2-hour platform clock is running.');

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setHashing(files.length);
    try {
      for (const f of files) { await sealFile(user.id, f); setHashing((n) => n - 1); }
      toast(files.length === 1 ? 'File sealed. Its fingerprint is saved in this browser.' : `${files.length} files sealed.`);
      await loadVault();
    } catch (err) {
      toast(`Could not seal the file: ${err.message}`, 'bad');
    } finally {
      setHashing(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVerify = async (e) => {
    const file = e.target.files?.[0];
    const rec = records.find((r) => r.id === verifyFor);
    if (!file || !rec) return;
    const ok = await verifyFile(rec, file);
    setVerifyResult((x) => ({ ...x, [rec.id]: ok }));
    toast(ok ? 'Match — this file is unchanged since you sealed it.' : 'No match — this is not the same file, or it was changed.', ok ? 'good' : 'bad');
    if (verifyInputRef.current) verifyInputRef.current.value = '';
  };

  const copyToClipboard = async (text, id) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }
    catch { toast('Copy failed — select the text and copy it manually.', 'bad'); }
  };

  const download = (name, content) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'vault', label: 'Evidence Vault', icon: ShieldCheck },
    { id: 'report', label: 'Incident Report', icon: FileText },
    { id: 'crisis', label: 'Emergency Support', icon: PhoneCall },
    { id: 'aftercare', label: 'Aftercare', icon: HeartHandshake },
    { id: 'mimi', label: 'Mimi Extension', icon: Puzzle },
    { id: 'deadlines', label: 'Takedown Deadlines', icon: Clock },
    { id: 'account', label: 'Account', icon: UserRound },
  ];

  // ---- derived incident state (all from real timestamps) ----
  const since = incident ? now - incident.discoveredAt : null;
  const goldenLeft = incident ? GOLDEN_MS - since : null;
  const nciiDeadline = incident?.noticeSentAt ? incident.noticeSentAt + NCII_MS : null;
  const nciiLeft = nciiDeadline ? nciiDeadline - now : null;
  const firstSeal = useMemo(() => (incident ? records.filter((r) => r.sealedAt >= incident.discoveredAt).map((r) => r.sealedAt).sort((a, b) => a - b)[0] : null), [records, incident]);
  const steps = [
    { name: 'Triage', done: !!incident?.type },
    { name: 'Vault', done: records.length > 0 },
    { name: 'Timer', done: !!incident },
    { name: 'Notice', done: !!incident?.noticeSentAt },
  ];
  const mimiInstalled = mimiStatus.state === 'installed' || mimiStatus.state === 'update';
  const mimiLinked = mimiInstalled && mimiStatus.account?.status === 'signed-in' && mimiStatus.account.userId === user.id;
  const mimiLabel = mimiStatus.state === 'checking' ? 'Checking for Mimi…' : mimiInstalled ? 'Open Mimi' : 'Get Mimi extension';

  // timeline: discovery → (seal) → (notice) → 2-hour deadline
  const tl = useMemo(() => {
    if (!incident) return null;
    const start = incident.discoveredAt;
    const end = Math.max(nciiDeadline ?? start + 3 * HOUR, now + 10 * 60000);
    const x = (t) => 20 + ((t - start) / (end - start)) * 660;
    const pts = [{ t: start, label: 'Found', key: 'found' }];
    if (firstSeal) pts.push({ t: firstSeal, label: 'Evidence sealed', key: 'seal' });
    if (incident.noticeSentAt) pts.push({ t: incident.noticeSentAt, label: 'Notice sent', key: 'notice' });
    if (nciiDeadline) pts.push({ t: nciiDeadline, label: '2-hour deadline', key: 'deadline' });
    return { x, pts, nowX: x(Math.min(now, end)), goldenX: x(start + GOLDEN_MS) };
  }, [incident, firstSeal, nciiDeadline, now]);

  const Sidebar = (
    <aside className={`w-64 bg-white border-r border-violet-100 flex flex-col justify-between shrink-0 ${drawer ? 'fixed inset-y-0 left-0 z-50 shadow-2xl fade-in-up' : 'hidden md:flex'}`} aria-label="Workspace navigation">
      <div>
        <div className="p-6 border-b border-violet-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.25)]">
            <img src="/solace-robot.png" alt="Solace" className="w-7 h-7 object-contain" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-[#1a1028] tracking-tight flex items-center gap-1.5">
              Solace
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-700">Desk</span>
            </h1>
            <p className="text-[10px] font-mono text-zinc-500 uppercase">Incident Triage Engine</p>
          </div>
          {drawer && <button onClick={() => setDrawer(false)} className="md:hidden p-1.5 rounded-lg text-zinc-600 hover:text-[#5b21b6] cursor-pointer" aria-label="Close menu"><X className="w-4 h-4" /></button>}
        </div>
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            return (
              <button key={item.id} onClick={() => go(item.id)} aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all cursor-pointer ${isActive ? 'bg-purple-600/20 text-[#1a1028] font-semibold border border-purple-500/40 shadow-[0_0_14px_rgba(168,85,247,0.25)]' : 'text-zinc-600 hover:text-[#5b21b6] hover:bg-violet-50 border border-transparent'}`}>
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-600' : 'text-zinc-500'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'mimi' && <span className={`w-1.5 h-1.5 rounded-full ${mimiLinked ? 'bg-emerald-400' : mimiInstalled ? 'bg-amber-400' : 'bg-zinc-600'}`} aria-hidden="true" />}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-violet-100">
        <div className="flex items-center justify-between p-2 rounded-xl bg-violet-50/60 border border-violet-100">
          <button className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left" onClick={() => go('account')} title="Account">
            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-[#7c3aed] to-[#00d4ff] flex items-center justify-center text-xs font-bold text-white font-mono shadow-[0_0_8px_rgba(124,58,237,0.4)]">
              {user.name ? user.name[0].toUpperCase() : 'S'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-[#1a1028] leading-tight truncate max-w-[110px]">{user.name}</span>
              <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Local Vault Active
              </span>
            </div>
          </button>
          <button onClick={handleLogout} title="Sign out" aria-label="Sign out" className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen w-full bg-[#faf8ff] text-[#1a1028] font-sans overflow-hidden">
      {Sidebar}
      {drawer && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 md:p-10 space-y-8 bg-[#faf8ff]">
        {/* mobile top bar */}
        <div className="md:hidden flex items-center justify-between -mt-1">
          <button onClick={() => setDrawer(true)} className="p-2 rounded-xl bg-violet-50 border border-violet-100 cursor-pointer" aria-label="Open menu" aria-expanded={drawer}><Menu className="w-5 h-5" /></button>
          <span className="flex items-center gap-2 font-bold"><img src="/solace-robot.png" alt="" className="w-6 h-6" />Solace</span>
          <a href="tel:112" className="px-3 py-1.5 rounded-full border border-rose-500/40 text-rose-700 text-xs font-mono">112</a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-violet-100">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1a1028] tracking-tight">
              {tab === 'account' ? 'Account' : tab === 'mimi' ? 'Mimi Extension' : tab === 'report' ? 'Incident Report' : 'Incident Response Workspace'}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 font-light mt-1">
              Signed in as {user.email} · Media hashed locally in your browser · Nothing uploaded
            </p>
          </div>
          <button onClick={async () => { if (mimiInstalled) { const r = await Mimi.open(); if (!r?.ok) go('mimi'); } else go('mimi'); }} onMouseEnter={() => setMimiHovered(true)} onMouseLeave={() => setMimiHovered(false)} onFocus={() => setMimiHovered(true)} onBlur={() => setMimiHovered(false)} aria-label={mimiLabel} title={mimiLabel} className={`group px-2 py-1.5 min-h-11 rounded-full text-xs font-mono flex items-center gap-2 cursor-pointer border self-start sm:self-auto transition-all duration-300 ${mimiLinked ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : mimiInstalled ? 'bg-amber-500/10 border-amber-500/25 text-amber-700' : 'bg-violet-50 border-violet-200 text-zinc-700'}`} data-testid="mimi-pill">
            <img src={mimiHovered || mimiStatus.mimiOpen ? '/robot-jump.gif' : '/solace-robot.png'} alt="" aria-hidden="true" className="w-9 h-9 shrink-0 object-contain" />
            <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-500 delay-100 group-hover:max-w-56 group-hover:opacity-100 group-focus-visible:max-w-56 group-focus-visible:opacity-100">{mimiLabel}</span>
          </button>
        </div>

        {/* 1. OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`md:col-span-1 ${card} flex flex-col justify-between`} data-testid="golden-hour">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono tracking-widest text-zinc-600 uppercase">2-Hour Golden Window</span>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600"><Flame className={`w-5 h-5 ${incident && goldenLeft > 0 ? 'animate-pulse' : ''}`} /></div>
                  </div>
                  {incident ? (
                    goldenLeft > 0 ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black font-mono text-[#1a1028] tracking-tight" aria-live="off">{fmtLeft(goldenLeft)}</span>
                          <span className="text-sm font-mono text-amber-600 uppercase">left</span>
                        </div>
                        <p className="text-xs text-zinc-600 mt-2 leading-relaxed">Since you found it ({fmtSince(since)} ago). Seal evidence and send a notice inside the 2-hour window.</p>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-black font-mono text-[#1a1028] tracking-tight">{fmtSince(since)}</div>
                        <p className="text-xs text-zinc-600 mt-2 leading-relaxed">since you found it. The 2-hour window has passed — it is still worth acting now.</p>
                      </>
                    )
                  ) : (
                    <>
                      <div className="text-2xl font-extrabold text-[#1a1028]">No active incident</div>
                      <p className="text-xs text-zinc-600 mt-2 leading-relaxed">Found something just now? Start the clock and Solace tracks the official 2-hour window and platform deadline.</p>
                      <button onClick={startIncident} disabled={incBusy} className="mt-4 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 text-xs font-mono font-bold hover:bg-amber-500/25 transition-colors cursor-pointer disabled:opacity-50">Start clock now</button>
                    </>
                  )}
                </div>
                <div className="mt-6 pt-4 border-t border-violet-100">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-2">Protocol Execution State</span>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {steps.map((st, idx) => (
                      <div key={st.name} className="flex flex-col items-center gap-1">
                        <span className="text-[9px] font-mono text-zinc-500">{st.name}</span>
                        <div className={`w-full py-1 rounded-md text-[10px] font-bold font-mono ${st.done ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]' : 'bg-violet-50 text-zinc-500 border border-violet-200'}`}>
                          {st.done ? '✓' : String(idx + 1).padStart(2, '0')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`md:col-span-2 ${card} flex flex-col justify-between`} data-testid="takedown-clock">
                <div>
                  <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                    <span className="text-xs font-mono tracking-widest text-zinc-600 uppercase">Platform Takedown Clock</span>
                    {incident && <span className="text-xs font-mono text-purple-700">{concernLabel(incident.type)}</span>}
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl sm:text-4xl font-extrabold font-mono text-[#1a1028]">
                      {nciiDeadline ? (nciiLeft > 0 ? fmtLeft(nciiLeft) : 'Deadline passed') : 'Rule 3(2)(b)'}
                    </span>
                    <span className="text-xs font-mono text-zinc-600">
                      {nciiDeadline ? (nciiLeft > 0 ? 'left for the platform to remove it (2-hour rule)' : `${fmtSince(-nciiLeft)} ago — escalate on cybercrime.gov.in / 1930`) : '2-hour removal after your complaint — starts when you send it'}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  {tl ? (
                    <div className="relative h-32 w-full">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 700 110" preserveAspectRatio="none" role="img" aria-label="Incident timeline">
                        <defs>
                          <linearGradient id="tlGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#7c3aed" />
                            <stop offset="100%" stopColor="#00d4ff" />
                          </linearGradient>
                        </defs>
                        <rect x="20" y="52" width="660" height="6" rx="3" fill="rgba(124,58,237,0.10)" />
                        <rect x="20" y="52" width={Math.max(0, tl.nowX - 20)} height="6" rx="3" fill="url(#tlGrad)" />
                        <line x1={tl.goldenX} x2={tl.goldenX} y1="38" y2="72" stroke="#f59e0b" strokeDasharray="3 3" />
                        <line x1={tl.nowX} x2={tl.nowX} y1="30" y2="80" stroke="#1a1028" strokeOpacity="0.5" />
                        {tl.pts.map((p) => <circle key={p.key} cx={tl.x(p.t)} cy="55" r="6" className="fill-white stroke-[#7c3aed]" strokeWidth="2.5" />)}
                      </svg>
                      <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-zinc-500">
                        {tl.pts.map((p) => <span key={p.key}><span className="text-cyan-600">●</span> {p.label} {new Date(p.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>)}
                        <span><span className="text-amber-600">┆</span> 2-hour window ends</span>
                        <span className="text-[#1a1028]">│ now</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Start the incident clock to see your timeline.</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {!incident?.noticeSentAt && (
                      <button onClick={markNoticeSent} disabled={incBusy} className="px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-800 hover:text-[#5b21b6] hover:bg-purple-600/40 text-xs font-mono flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"><Send className="w-3.5 h-3.5" />I’ve sent the notice now</button>
                    )}
                    {incident && (
                      <button onClick={() => updateIncident({ clear: true }, 'Incident clock cleared.')} disabled={incBusy} className="px-4 py-2 rounded-xl text-zinc-600 hover:text-[#5b21b6] text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer"><TimerReset className="w-3.5 h-3.5" />Clear clock</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-600" /><h3 className="text-base font-bold text-[#1a1028]">Recommended Response Protocols</h3></div>
                <span className="text-xs font-mono text-zinc-500">{incident ? `For: ${concernLabel(incident.type)}` : 'Start here'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { tag: 'STEP 02 · LOCAL SEAL', tagCls: 'bg-purple-500/10 text-purple-600 border-purple-500/20', title: 'Cryptographic Evidence Seal', body: 'Fingerprint the original file (SHA-256) before posts, chats or channels disappear.', cta: records.length ? `Open vault (${records.length} sealed)` : 'Launch Evidence Vault', to: 'vault' },
                  { tag: 'STEP 03 · STATUTORY DEADLINE', tagCls: 'bg-pink-500/10 text-pink-600 border-pink-500/20', title: 'Rule 3(2)(b) 2-Hour Clock', body: 'Platforms must remove intimate or morphed content within 2 hours of your complaint.', cta: 'Inspect Takedown Timers', to: 'deadlines' },
                  { tag: 'STEP 04 · OFFICIAL REPORT', tagCls: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20', title: 'Police / Authority Report', body: 'Describe what happened, add your photos, and get a formal complaint ready to print or file.', cta: 'Build Incident Report', to: 'report' },
                ].map((p) => (
                  <div key={p.to} className="p-5 rounded-2xl bg-white border border-violet-100 hover:border-purple-500/50 transition-all flex flex-col justify-between group">
                    <div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${p.tagCls}`}>{p.tag}</span>
                      <h4 className="text-sm font-bold text-[#1a1028] mt-2">{p.title}</h4>
                      <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{p.body}</p>
                    </div>
                    <button onClick={() => go(p.to)} className="mt-4 pt-3 border-t border-violet-100 flex items-center justify-between text-xs font-mono text-purple-600 group-hover:text-cyan-600 transition-colors cursor-pointer">
                      <span>{p.cta}</span><ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. EVIDENCE VAULT */}
        {tab === 'vault' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-violet-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-[#1a1028] flex items-center gap-2"><Lock className="w-5 h-5 text-purple-600" />Local Cryptographic Evidence Vault</h3>
                  <p className="text-xs text-zinc-600 mt-1">Fingerprints are computed in your browser with the Web Crypto API and kept in this browser for your account. Files are never uploaded — keep the originals safe.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} className="hidden" data-testid="vault-input" />
                  <input type="file" ref={verifyInputRef} onChange={handleVerify} className="hidden" />
                  {records.length > 0 && (
                    <button onClick={() => download(`solace-vault-${new Date().toISOString().slice(0, 10)}.json`, exportJson(records, user))} className="px-4 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-zinc-700 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer"><Download className="w-4 h-4" />Export</button>
                  )}
                  <button onClick={() => fileInputRef.current?.click()} disabled={hashing > 0} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(124,58,237,0.4)] disabled:opacity-60">
                    {hashing ? <span className="sol-spinner" /> : <FileCheck className="w-4 h-4" />}
                    <span>{hashing ? 'Computing SHA-256…' : 'Seal New File Locally'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3" data-testid="vault-list">
                {vaultLoaded && records.length === 0 && (
                  <div className="p-8 rounded-xl border border-dashed border-violet-200 text-center">
                    <ShieldCheck className="w-8 h-8 text-purple-600 mx-auto" />
                    <p className="text-sm text-[#1a1028] font-semibold mt-3">No evidence sealed yet</p>
                    <p className="text-xs text-zinc-600 mt-1 max-w-md mx-auto">Choose screenshots, videos or voice notes. Solace records each file’s SHA-256 fingerprint, size and time so you can later show the file is unchanged.</p>
                  </div>
                )}
                {records.map((file) => (
                  <div key={file.id} className="p-4 rounded-xl bg-[#fcfbff] border border-violet-100 hover:border-purple-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-600 mt-0.5"><ShieldCheck className="w-5 h-5" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#1a1028] break-all">{file.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Sealed locally</span>
                          {verifyResult[file.id] === true && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 flex items-center gap-1"><BadgeCheck className="w-3 h-3" />Verified match</span>}
                          {verifyResult[file.id] === false && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 border border-rose-500/30">Did not match</span>}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-zinc-600 min-w-0">
                          <span className="text-zinc-500 shrink-0">SHA-256:</span>
                          <span className="text-purple-700 select-all truncate">{file.hash}</span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Size: {formatSize(file.size)} · Sealed: {istStamp(file.sealedAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button onClick={() => copyToClipboard(file.hash, file.id)} className="px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-zinc-700 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer">
                        {copiedId === file.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === file.id ? 'Hash Copied' : 'Copy Hash'}</span>
                      </button>
                      <button onClick={() => { setVerifyFor(file.id); verifyInputRef.current?.click(); }} className="px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-zinc-700 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"><BadgeCheck className="w-3.5 h-3.5" />Verify file</button>
                      <button onClick={async () => { await deleteRecord(file.id); toast('Removed from the vault.'); loadVault(); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer" aria-label={`Remove ${file.name}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-5 leading-relaxed">A fingerprint shows a file is unchanged since you sealed it; it does not prove who made it. Keep the original files and screenshots with visible dates and usernames. Mimi’s Evidence Locker in the extension saves chats the same way.</p>
            </div>
          </div>
        )}

        {/* 3. TAKEDOWN DEADLINES */}
        {tab === 'deadlines' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-white border border-amber-500/30 shadow-[0_0_24px_rgba(245,158,11,0.1)]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">RULE 3(2)(b) IT RULES</span>
                  <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
                </div>
                <h4 className="text-xl font-bold text-[#1a1028]">2-Hour Emergency Removal</h4>
                <p className="text-xs text-zinc-600 mt-2 leading-relaxed">For content showing a person’s private areas, nudity or sexual acts, or impersonating them — including morphed and deepfake images. The platform must act within 2 hours of the person’s complaint (it was 24 hours before the 2026 amendment).</p>
                <div className="mt-6 pt-4 border-t border-violet-100">
                  <div className="text-xs font-mono text-zinc-600">Your clock:</div>
                  <div className="text-sm font-bold text-amber-700 mt-1 font-mono">{nciiDeadline ? (nciiLeft > 0 ? `${fmtLeft(nciiLeft)} left` : 'Deadline passed — escalate') : 'Not started — record when you send the notice'}</div>
                  {!incident?.noticeSentAt && <button onClick={markNoticeSent} disabled={incBusy} className="mt-3 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-800 text-xs font-mono cursor-pointer hover:bg-amber-500/25 disabled:opacity-50">I’ve sent it now</button>}
                  <div className="text-xs font-mono text-zinc-600 mt-4">If it is ignored:</div>
                  <div className="text-xs font-bold text-rose-600 mt-1">The platform risks losing its Section 79 “safe harbour” protection. Escalate on cybercrime.gov.in / 1930.</div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-purple-500/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">RULE 3(1)(d)</span>
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <h4 className="text-xl font-bold text-[#1a1028]">3-Hour Court / Govt Order</h4>
                <p className="text-xs text-zinc-600 mt-2 leading-relaxed">When a court or an authorised government agency orders unlawful content removed, the platform must act within 3 hours (it was 36 hours before the 2026 amendment). Police can request this after your complaint.</p>
                <div className="mt-6 pt-4 border-t border-violet-100">
                  <div className="text-xs font-mono text-zinc-600">How to trigger it:</div>
                  <div className="text-xs font-bold text-amber-600 mt-1">File on cybercrime.gov.in or call 1930 and share your sealed evidence.</div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-cyan-500/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">RULE 3(2)</span>
                  <Clock className="w-5 h-5 text-cyan-600" />
                </div>
                <h4 className="text-xl font-bold text-[#1a1028]">7-Day Grievance Resolution</h4>
                <p className="text-xs text-zinc-600 mt-2 leading-relaxed">Other complaints to a platform’s Grievance Officer must be resolved within 7 days (reduced from 15 days in 2026).</p>
                <div className="mt-6 pt-4 border-t border-violet-100">
                  <div className="text-xs font-mono text-zinc-600">Escalation Route:</div>
                  <div className="text-xs font-bold text-cyan-700 mt-1">Grievance Appellate Committee (gac.gov.in)</div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Based on the IT (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules, 2026 (G.S.R. 120(E), notified 10 Feb 2026, in force 20 Feb 2026). Solace is not a lawyer; check the official text. Sources:{' '}
              {SOURCES.map(([t, u], i) => <span key={u}>{i ? ' · ' : ''}<a href={u} target="_blank" rel="noreferrer" className="text-purple-700 underline underline-offset-2">{t}</a></span>)}. Free legal aid: NALSA 15100.
            </p>
          </div>
        )}

        {/* 4. INCIDENT REPORT */}
        {tab === 'report' && <ReportBuilder records={records} onSealed={loadVault} />}

        {/* 5. EMERGENCY SUPPORT */}
        {tab === 'crisis' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-white border border-rose-500/50 flex flex-col justify-between shadow-[0_0_24px_rgba(244,63,94,0.12)]">
                <div>
                  <div className="flex items-center gap-2 text-rose-600 font-mono text-xs mb-3"><PhoneCall className="w-4 h-4" /><span>IN DANGER NOW</span></div>
                  <h4 className="text-2xl font-black text-[#1a1028]">112</h4>
                  <p className="text-sm font-semibold text-zinc-700 mt-1">Emergency Response (police, ambulance)</p>
                  <p className="text-xs text-zinc-600 mt-2 leading-relaxed">If someone threatens to hurt you or is near you, call now.</p>
                </div>
                <a href="tel:112" className="mt-6 px-4 py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-500 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"><PhoneCall className="w-3.5 h-3.5" /><span>Call 112</span></a>
              </div>
              <div className="p-6 rounded-2xl bg-white border border-rose-500/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-rose-600 font-mono text-xs mb-3"><PhoneCall className="w-4 h-4 animate-bounce" /><span>CYBER CRIME HELPLINE</span></div>
                  <h4 className="text-2xl font-black text-[#1a1028]">1930</h4>
                  <p className="text-sm font-semibold text-zinc-700 mt-1">National Cyber Crime Helpline</p>
                  <p className="text-xs text-zinc-600 mt-2 leading-relaxed">For cyber fraud, extortion threats and non-consensual media circulation.</p>
                </div>
                <a href="tel:1930" className="mt-6 px-4 py-2.5 rounded-xl bg-rose-500/20 text-rose-700 border border-rose-500/40 hover:bg-rose-500/30 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"><PhoneCall className="w-3.5 h-3.5" /><span>Call 1930 Now</span></a>
              </div>
              <div className="p-6 rounded-2xl bg-white border border-purple-500/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-purple-600 font-mono text-xs mb-3"><ExternalLink className="w-4 h-4" /><span>OFFICIAL PORTAL</span></div>
                  <h4 className="text-xl font-bold text-[#1a1028]">cybercrime.gov.in</h4>
                  <p className="text-sm font-semibold text-zinc-700 mt-1">Ministry of Home Affairs (MHA)</p>
                  <p className="text-xs text-zinc-600 mt-2 leading-relaxed">File a complaint (there is a separate women &amp; children section) and attach your sealed evidence.</p>
                </div>
                <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" className="mt-6 px-4 py-2.5 rounded-xl bg-purple-500/20 text-purple-700 border border-purple-500/40 hover:bg-purple-500/30 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"><ExternalLink className="w-3.5 h-3.5" /><span>Open Official Portal</span></a>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">Free legal aid: NALSA helpline 15100. Intimate images being shared? StopNCII.org can help block re-uploads on partner platforms without uploading your image.</p>
          </div>
        )}

        {tab === 'aftercare' && <AftercarePanel user={user} onGoReport={() => go('report')} />}
        {tab === 'mimi' && <MimiPanel status={mimiStatus} autoLink={autoLink} onReport={() => go('report')} />}
        {tab === 'account' && <AccountPanel onSignOut={handleLogout} mimiStatus={mimiStatus} />}
      </main>
    </div>
  );
}
