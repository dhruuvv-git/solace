import { useState, useRef } from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  Clock,
  FileText,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Lock,
  Download,
  Copy,
  Check,
  LogOut,
  Flame,
  Sparkles,
  Activity,
  FileCheck,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

export default function DashboardView({ user = { name: 'Survivor' }, onLogout }) {
  const [currentTab, setCurrentTab] = useState('overview');

  // Vault state
  const [sealedFiles, setSealedFiles] = useState([
    {
      id: 'hash-001',
      name: 'screenshot_leak_telegram_raw.png',
      size: '2.4 MB',
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      timestamp: '2026-10-15 12:44:18 IST',
      status: 'Cryptographically Sealed'
    },
    {
      id: 'hash-002',
      name: 'voice_note_extortion_attempt.m4a',
      size: '1.1 MB',
      hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      timestamp: '2026-10-15 12:49:03 IST',
      status: 'Cryptographically Sealed'
    }
  ]);
  const [hashingFile, setHashingFile] = useState(false);
  const fileInputRef = useRef(null);

  // Notice template copy state
  const [copiedId, setCopiedId] = useState(null);

  // Compute local SHA-256 using client Web Crypto API
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setHashingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const newEntry = {
        id: `hash-${Date.now()}`,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        hash: hashHex,
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST',
        status: 'Cryptographically Sealed'
      };

      setSealedFiles(prev => [newEntry, ...prev]);
    } catch (err) {
      console.error('Hashing failed', err);
    } finally {
      setHashingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'vault', label: 'Evidence Vault', icon: ShieldCheck },
    { id: 'deadlines', label: 'Takedown Deadlines', icon: Clock },
    { id: 'notices', label: 'Platform Notices', icon: FileText },
    { id: 'crisis', label: 'Emergency Support', icon: PhoneCall },
  ];

  return (
    <div className="flex h-screen w-full bg-[#07050b] text-white font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0a0612] border-r border-white/[0.08] flex flex-col justify-between shrink-0">
        <div>
          {/* Brand header */}
          <div className="p-6 border-b border-white/[0.08] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.25)]">
              <img
                src="/solace-robot.png"
                alt="Solace"
                className="w-7 h-7 object-contain"
              />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                Solace
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">Desk</span>
              </h1>
              <p className="text-[10px] font-mono text-zinc-500 uppercase">Incident Triage Engine</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all cursor-pointer ${
                    isActive
                      ? 'bg-purple-600/20 text-white font-semibold border border-purple-500/40 shadow-[0_0_14px_rgba(168,85,247,0.25)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#00d4ff]' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User profile footer */}
        <div className="p-4 border-t border-white/[0.08]">
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7c3aed] to-[#00d4ff] flex items-center justify-center text-xs font-bold text-white font-mono shadow-[0_0_8px_rgba(124,58,237,0.4)]">
                {user.name ? user.name[0].toUpperCase() : 'S'}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white leading-tight truncate max-w-[100px]">
                  {user.name || 'Survivor'}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Local Vault Active
                </span>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Return to Landing Page"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 bg-[#07050b]">
        
        {/* Top Minimalist Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Incident Response Workspace
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 font-light mt-1">
              Zero cloud exposure · All media hashed locally in browser · Evidence preserved for statutory enforcement
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Engine Status: Online & Armed</span>
            </span>
          </div>
        </div>

        {/* 1. OVERVIEW TAB */}
        {currentTab === 'overview' && (
          <div className="space-y-8">
            
            {/* Top Stat Row: Golden Hour Timer + Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* CURRENT STREAK / GOLDEN HOUR CARD */}
              <div className="md:col-span-1 p-6 rounded-2xl bg-[#0d0814] border border-white/[0.08] shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Golden Hour Window</span>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                      <Flame className="w-5 h-5 animate-pulse" />
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black font-mono text-white tracking-tight">48</span>
                    <span className="text-sm font-mono text-amber-400 uppercase">Mins Left</span>
                  </div>

                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    First 60 minutes determine recovery outcome. Cryptographic proof locked client-side.
                  </p>
                </div>

                {/* 4-Stage Protocol Progress */}
                <div className="mt-6 pt-4 border-t border-white/[0.06]">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-2">Protocol Execution State</span>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {[
                      { step: '01', name: 'Triage', done: true },
                      { step: '02', name: 'Vault', done: true },
                      { step: '03', name: 'Timer', done: true },
                      { step: '04', name: 'Notice', done: false },
                    ].map((st, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <span className="text-[9px] font-mono text-zinc-500">{st.name}</span>
                        <div className={`w-full py-1 rounded-md text-[10px] font-bold font-mono ${
                          st.done
                            ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                            : 'bg-white/5 text-zinc-500 border border-white/10'
                        }`}>
                          {st.done ? '✓' : st.step}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* CONTAINMENT TRAJECTORY (Interactive SVG curve adapted from TuneBreach) */}
              <div className="md:col-span-2 p-6 rounded-2xl bg-[#0d0814] border border-white/[0.08] shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Containment Velocity</span>
                    <span className="text-xs font-mono text-emerald-400">+94.6% takedown probability</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold font-mono text-white">Rule 3(2)(b)</span>
                    <span className="text-xs font-mono text-zinc-400">2-Hour Statutory Mandate Active</span>
                  </div>
                </div>

                {/* Trajectory Graph */}
                <div className="mt-6">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-2">
                    <span>EVIDENCE INTEGRITY & CHAIN OF CUSTODY</span>
                    <span className="text-[#00d4ff]">Court Admissibility 100%</span>
                  </div>

                  <div className="relative h-36 w-full pt-2">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 700 120" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="incidentGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#07050b" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      <path
                        d="M 0 95 Q 116 75, 233 50 T 466 25 T 700 10 L 700 120 L 0 120 Z"
                        fill="url(#incidentGrad)"
                      />

                      <path
                        d="M 0 95 Q 116 75, 233 50 T 466 25 T 700 10"
                        fill="none"
                        stroke="#00d4ff"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />

                      {[
                        { x: 0, y: 95, label: '0m' },
                        { x: 116, y: 75, label: '15m' },
                        { x: 233, y: 50, label: '30m' },
                        { x: 350, y: 35, label: '45m' },
                        { x: 466, y: 25, label: '60m' },
                        { x: 583, y: 15, label: '90m' },
                        { x: 700, y: 10, label: '120m' }
                      ].map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r="5"
                          className="fill-[#07050b] stroke-[#00d4ff] stroke-2 hover:r-7 transition-all cursor-pointer"
                        />
                      ))}
                    </svg>

                    <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-2">
                      <span>0m (Discovery)</span>
                      <span>15m (Hash Sealed)</span>
                      <span>30m (Notice Sent)</span>
                      <span>45m (Platform Ack)</span>
                      <span>60m (Escalation)</span>
                      <span>90m</span>
                      <span className="text-white font-bold">120m (Mandate Deadline)</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* ACTIONABLE PROTOCOL CARDS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="text-base font-bold text-white">Recommended Response Protocols</h3>
                </div>
                <span className="text-xs font-mono text-zinc-500">Based on active incident triage</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Protocol 1 */}
                <div className="p-5 rounded-2xl bg-[#0d0814] border border-white/[0.08] hover:border-purple-500/50 transition-all flex flex-col justify-between group">
                  <div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      STEP 02 · LOCAL SEAL
                    </span>
                    <h4 className="text-sm font-bold text-white mt-2">Cryptographic Evidence Seal</h4>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Calculate SHA-256 fingerprint on raw media before cloud platforms scrub headers or delete channels.
                    </p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('vault')}
                    className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-purple-400 group-hover:text-[#00d4ff] transition-colors cursor-pointer"
                  >
                    <span>Launch Evidence Vault</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Protocol 2 */}
                <div className="p-5 rounded-2xl bg-[#0d0814] border border-white/[0.08] hover:border-purple-500/50 transition-all flex flex-col justify-between group">
                  <div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                      STEP 03 · STATUTORY DEADLINE
                    </span>
                    <h4 className="text-sm font-bold text-white mt-2">Rule 3(2)(b) 2-Hour Clock</h4>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Monitor live timer against statutory Indian IT Rules deadlines. Failure triggers platform safe-harbor forfeiture.
                    </p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('deadlines')}
                    className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-purple-400 group-hover:text-[#00d4ff] transition-colors cursor-pointer"
                  >
                    <span>Inspect Takedown Timers</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Protocol 3 */}
                <div className="p-5 rounded-2xl bg-[#0d0814] border border-white/[0.08] hover:border-purple-500/50 transition-all flex flex-col justify-between group">
                  <div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      STEP 04 · FORMAL NOTICE
                    </span>
                    <h4 className="text-sm font-bold text-white mt-2">Pre-Drafted Legal Takedown</h4>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Copy standardized legal notices cited with section 67A IT Act, Bharatiya Nyaya Sanhita, and Rule 3(2)(b).
                    </p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('notices')}
                    className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-purple-400 group-hover:text-[#00d4ff] transition-colors cursor-pointer"
                  >
                    <span>Generate Platform Notice</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* 2. EVIDENCE VAULT TAB */}
        {currentTab === 'vault' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#0d0814] border border-white/[0.08]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-purple-400" />
                    Local Cryptographic Evidence Vault
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Zero cloud transmission. Hashes are computed strictly in your local device memory using Web Crypto API.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={hashingFile}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(124,58,237,0.4)]"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>{hashingFile ? 'Computing SHA-256...' : 'Seal New File Locally'}</span>
                  </button>
                </div>
              </div>

              {/* List of Sealed Items */}
              <div className="space-y-3">
                {sealedFiles.map(file => (
                  <div
                    key={file.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-purple-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 mt-0.5">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{file.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {file.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-zinc-400">
                          <span className="text-zinc-500">SHA-256:</span>
                          <span className="text-purple-300 select-all truncate max-w-[260px] sm:max-w-md">{file.hash}</span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          Size: {file.size} · Timestamp: {file.timestamp}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => copyToClipboard(file.hash, file.id)}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 text-zinc-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedId === file.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === file.id ? 'Hash Copied' : 'Copy Hash'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. TAKEDOWN DEADLINES TAB */}
        {currentTab === 'deadlines' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* 2-HOUR CLOCK */}
              <div className="p-6 rounded-2xl bg-[#0d0814] border border-amber-500/30 shadow-[0_0_24px_rgba(245,158,11,0.1)]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    RULE 3(2)(b) IT RULES
                  </span>
                  <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>
                <h4 className="text-xl font-bold text-white">2-Hour Emergency Mandate</h4>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Applies to non-consensual intimate imagery, nudity, deepfakes, and impersonation. Intermediaries must remove access within 2 hours of notice.
                </p>
                <div className="mt-6 pt-4 border-t border-white/[0.06]">
                  <div className="text-xs font-mono text-zinc-400">Statutory Consequence:</div>
                  <div className="text-xs font-bold text-rose-400 mt-1">
                    Forfeiture of Section 79 Intermediary Safe Harbor Immunity
                  </div>
                </div>
              </div>

              {/* 24-HOUR CLOCK */}
              <div className="p-6 rounded-2xl bg-[#0d0814] border border-purple-500/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    RULE 3(1)(d)
                  </span>
                  <Clock className="w-5 h-5 text-purple-400" />
                </div>
                <h4 className="text-xl font-bold text-white">24-Hour Court / Govt Order</h4>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Upon receipt of court order or authorized governmental direction under Section 69A IT Act.
                </p>
                <div className="mt-6 pt-4 border-t border-white/[0.06]">
                  <div className="text-xs font-mono text-zinc-400">Statutory Consequence:</div>
                  <div className="text-xs font-bold text-amber-400 mt-1">
                    Contempt of Court & Penal Proceedings
                  </div>
                </div>
              </div>

              {/* 36-HOUR CLOCK */}
              <div className="p-6 rounded-2xl bg-[#0d0814] border border-cyan-500/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    RULE 3(2)(a)
                  </span>
                  <Clock className="w-5 h-5 text-cyan-400" />
                </div>
                <h4 className="text-xl font-bold text-white">36-Hour Grievance Disposal</h4>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Grievance Officer acknowledgment within 24 hours, formal determination & remediation within 36-72 hours.
                </p>
                <div className="mt-6 pt-4 border-t border-white/[0.06]">
                  <div className="text-xs font-mono text-zinc-400">Escalation Route:</div>
                  <div className="text-xs font-bold text-cyan-300 mt-1">
                    Grievance Appellate Committee (GAC) Appeal
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 4. PLATFORM NOTICES TAB */}
        {currentTab === 'notices' && (
          <div className="space-y-6">
            {[
              {
                id: 'meta',
                platform: 'Meta (Instagram / Facebook / WhatsApp)',
                officer: 'Grievance Officer India - Meta Platforms Inc.',
                email: 'grievance-officer-india@support.facebook.com',
                body: `URGENT STATUTORY TAKEDOWN NOTICE UNDER RULE 3(2)(b) OF THE IT (INTERMEDIARY GUIDELINES AND DIGITAL MEDIA ETHICS CODE) RULES, 2021

To: Resident Grievance Officer, Meta Platforms Inc.

Subject: Immediate Takedown Demand - Non-Consensual Intimate Media / Impersonation

1. I am serving this formal notice regarding non-consensual synthetic/intimate media published without authorization.
2. Under Rule 3(2)(b) of the Information Technology (Intermediary Guidelines) Rules, 2021, you are legally mandated to disable access to such material within TWO (2) HOURS of receipt of this communication.
3. Cryptographic local proof & SHA-256 seal: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
4. Failure to comply terminates safe-harbor immunity under Section 79 of the IT Act, 2000, rendering the platform directly liable for abetment under Section 67A of the IT Act and relevant provisions of the Bharatiya Nyaya Sanhita (BNS).

Please confirm takedown within the statutory 2-hour window.`
              },
              {
                id: 'telegram',
                platform: 'Telegram Messenger',
                officer: 'Telegram Legal & Abuse Takedown Desk',
                email: 'abuse@telegram.org / stopca@telegram.org',
                body: `LEGAL DEMAND FOR IMMEDIATE CHANNEL BAN & MEDIA REMOVAL UNDER IT RULES 2021

To: Telegram Abuse Operations & Legal Counsel

Subject: Urgent Rule 3(2)(b) Takedown of Non-Consensual Imagery & Extortion Channel

This communication serves as a formal statutory notice for the immediate removal of non-consensual media circulated on Telegram channels.

Under Indian Information Technology Intermediary Rules, intermediaries are strictly liable to remove intimate deepfakes within 2 hours. Chain of custody is cryptographically logged.

Immediate actions required:
1. Revoke access to the offending media and ban the distributing account/channel.
2. Preserve IP logs and transmission metadata for Law Enforcement disclosure pursuant to 1930 / Cyber Crime Portal summons.`
              }
            ].map(notice => (
              <div key={notice.id} className="p-6 rounded-2xl bg-[#0d0814] border border-white/[0.08] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.06]">
                  <div>
                    <h4 className="text-base font-bold text-white">{notice.platform}</h4>
                    <p className="text-xs font-mono text-zinc-400 mt-0.5">{notice.officer} · {notice.email}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(notice.body, notice.id)}
                    className="px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:text-white hover:bg-purple-600/40 text-xs font-mono flex items-center gap-2 transition-all cursor-pointer self-start sm:self-auto"
                  >
                    {copiedId === notice.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === notice.id ? 'Notice Copied!' : 'Copy Notice'}</span>
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-black/40 border border-white/[0.04] text-xs font-mono text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {notice.body}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* 5. EMERGENCY SUPPORT TAB */}
        {currentTab === 'crisis' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="p-6 rounded-2xl bg-[#0d0814] border border-rose-500/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-rose-400 font-mono text-xs mb-3">
                    <PhoneCall className="w-4 h-4 animate-bounce" />
                    <span>EMERGENCY HELPLINE</span>
                  </div>
                  <h4 className="text-2xl font-black text-white">1930</h4>
                  <p className="text-sm font-semibold text-zinc-300 mt-1">
                    National Cyber Crime Reporting Portal Helpline
                  </p>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    24/7 dedicated government helpline for cyber frauds, extortion threats, and non-consensual media circulation.
                  </p>
                </div>
                <a
                  href="tel:1930"
                  className="mt-6 px-4 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Call 1930 Now</span>
                </a>
              </div>

              <div className="p-6 rounded-2xl bg-[#0d0814] border border-purple-500/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-purple-400 font-mono text-xs mb-3">
                    <ExternalLink className="w-4 h-4" />
                    <span>OFFICIAL PORTAL</span>
                  </div>
                  <h4 className="text-xl font-bold text-white">cybercrime.gov.in</h4>
                  <p className="text-sm font-semibold text-zinc-300 mt-1">
                    Ministry of Home Affairs (MHA)
                  </p>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    File an anonymous or formal complaint docket under Section 67 / 67A IT Act with your sealed hash evidence.
                  </p>
                </div>
                <a
                  href="https://cybercrime.gov.in"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 px-4 py-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Official Portal</span>
                </a>
              </div>

            </div>
          </div>
        )}

      </main>

    </div>
  );
}
