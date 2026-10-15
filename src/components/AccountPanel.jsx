import { useCallback, useEffect, useState } from 'react';
import { LogOut, MonitorSmartphone, Save, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { Api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { clearUser } from '../lib/vault';
import { useToast } from './Toaster';

const card = 'p-6 rounded-2xl bg-white border border-violet-100';
const SYNCED = [
  ['whatsappEnabled', 'Mimi on WhatsApp Web'],
  ['instagramEnabled', 'Mimi on Instagram'],
  ['abuseShieldBlur', 'Hide hurtful messages (Abuse Shield)'],
  ['composerWarnings', 'Warn me before I send something hurtful'],
  ['floatingButton', 'Show the Ask Mimi button in chats'],
  ['patternTracking', 'Pattern Detector (repeat senders)'],
];

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-4 py-3 border-b border-violet-100 last:border-0 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="text-sm text-zinc-800">{label}</span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="w-11 h-6 rounded-full bg-violet-200 peer-checked:bg-purple-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-purple-400" />
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function AccountPanel({ onSignOut }) {
  const { user, setUser, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [nameErr, setNameErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState(null);
  const [settings, setSettings] = useState(undefined);
  const [delOpen, setDelOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [delErr, setDelErr] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try { setDevices((await Api.devices()).devices); } catch { setDevices([]); }
    try { setSettings((await Api.settings()).settings); } catch { setSettings(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setNameErr('Enter a name or nickname.'); return; }
    setSaving(true); setNameErr(null);
    try { const r = await Api.updateAccount({ name: name.trim() }); setUser(r.user); toast('Name saved.'); }
    catch (err) { setNameErr(err.fields?.name || err.message); }
    finally { setSaving(false); }
  };

  const setSetting = async (k, v) => {
    const prev = settings;
    setSettings({ ...settings, [k]: v });
    try { const r = await Api.saveSettings({ [k]: v }); setSettings(r.settings); toast('Saved — Mimi picks this up next time she opens.'); }
    catch (err) { setSettings(prev); toast(err.message, 'bad'); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={saveName} className={card} noValidate>
          <h3 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><UserRound className="w-4 h-4 text-purple-600" />Profile</h3>
          <div className="mt-4 space-y-4">
            <label className="flex flex-col gap-2">
              <span className="sol-light-label">Name</span>
              <input className="sol-light-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={nameErr ? 'true' : undefined} />
              {nameErr && <span className="text-xs text-rose-700" role="alert">{nameErr}</span>}
            </label>
            <div className="flex flex-col gap-2">
              <span className="sol-light-label">Email</span>
              <span className="text-sm text-zinc-700 font-mono break-all">{user.email}</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">Member since {new Date(user.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</div>
          </div>
          <button type="submit" disabled={saving || name.trim() === user.name} className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <span className="sol-spinner" /> : <Save className="w-4 h-4" />}Save
          </button>
        </form>

        <div className={card}>
          <h3 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-purple-600" />Mimi settings (synced)</h3>
          <p className="text-xs text-zinc-600 mt-1 leading-relaxed">These follow your account between the website and every Mimi you connect. Groq keys, evidence and history never leave the device they are on.</p>
          <div className="mt-3">
            {settings === undefined && <p className="text-xs text-zinc-500 py-3">Loading…</p>}
            {settings === null && <p className="text-xs text-zinc-500 py-3">Connect Mimi once (Mimi extension tab) and her settings appear here.</p>}
            {settings && SYNCED.map(([k, label]) => <Toggle key={k} label={label} checked={settings[k] ?? k !== 'patternTracking'} onChange={(v) => setSetting(k, v)} />)}
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-base font-bold text-[#1a1028] flex items-center gap-2"><MonitorSmartphone className="w-4 h-4 text-purple-600" />Linked devices</h3>
        <p className="text-xs text-zinc-600 mt-1">Each Mimi you connect gets its own key. Remove one to sign that browser out.</p>
        <div className="mt-4 space-y-2" data-testid="devices">
          {devices === null && <p className="text-xs text-zinc-500">Loading…</p>}
          {devices?.length === 0 && <p className="text-xs text-zinc-500">No Mimi is connected to this account yet.</p>}
          {devices?.map((d) => (
            <div key={d.id} className="p-4 rounded-xl bg-[#fcfbff] border border-violet-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1a1028]">{d.deviceName}</div>
                <div className="text-[11px] font-mono text-zinc-500 mt-0.5">Connected {new Date(d.createdAt).toLocaleString('en-IN')} · last seen {new Date(d.lastUsedAt).toLocaleString('en-IN')} · expires {new Date(d.expiresAt).toLocaleDateString('en-IN')}</div>
              </div>
              <button onClick={async () => { try { await Api.revokeDevice(d.id); toast('Device signed out.'); load(); } catch (e) { toast(e.message, 'bad'); } }}
                className="px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-rose-500/15 hover:text-rose-700 text-zinc-700 text-xs font-mono transition-colors cursor-pointer self-start sm:self-auto">Sign out device</button>
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} border-rose-500/20`}>
        <h3 className="text-base font-bold text-[#1a1028]">Session</h3>
        <div className="flex flex-wrap gap-3 mt-4">
          <button onClick={onSignOut} className="px-4 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-zinc-800 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer border border-violet-100">
            <LogOut className="w-4 h-4" />Sign out
          </button>
          <button onClick={() => { setDelOpen((o) => !o); setDelErr(null); }} className="px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-700 border border-rose-500/30 hover:bg-rose-500/20 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer" aria-expanded={delOpen}>
            <Trash2 className="w-4 h-4" />Delete account
          </button>
        </div>
        {delOpen && (
          <form className="mt-4 p-4 rounded-xl bg-rose-500/[0.06] border border-rose-500/25 space-y-3 fade-in-up" noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (!pw) { setDelErr('Enter your password to confirm.'); return; }
            setDeleting(true); setDelErr(null);
            try {
              await Api.deleteAccount(pw);
              await clearUser(user.id).catch(() => {});
              await signOut().catch(() => {});
              toast('Your account was deleted.');
              navigate('/', { replace: true });
            } catch (err) { setDelErr(err.message); setDeleting(false); }
          }}>
            <p className="text-sm text-rose-800">This permanently deletes your account, synced settings, linked devices and this browser’s Evidence Vault entries. Export anything you need first.</p>
            <label className="flex flex-col gap-2 max-w-sm">
              <span className="sol-light-label">Password</span>
              <input type="password" autoComplete="current-password" className="sol-light-input" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={delErr ? 'true' : undefined} />
            </label>
            {delErr && <p className="text-xs text-rose-700" role="alert">{delErr}</p>}
            <button type="submit" disabled={deleting} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold font-mono flex items-center gap-2 cursor-pointer disabled:opacity-60">
              {deleting && <span className="sol-spinner" />}Permanently delete
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
