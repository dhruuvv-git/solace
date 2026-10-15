import { useState } from 'react';
import { ArrowRight, Check, Download } from 'lucide-react';
import { CONCERNS } from '../lib/concerns';
import { Api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { navigate, safeNext } from '../lib/router';
import { DOWNLOAD_URL, useMimiStatus } from '../lib/mimi';
import { useToast } from './Toaster';
import { MimiConnectCard } from './MimiPanel';



function Shell({ step, total, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#07050b', color: '#f1f5f9', position: 'relative', overflow: 'hidden', fontFamily: 'var(--sol-font)' }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: -120, left: '8%', width: 520, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0, 212, 255, 0.13) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: -80, right: '6%', width: 560, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236, 72, 153, 0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <header style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(20px, 4vw, 48px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'grid', placeItems: 'center', boxShadow: '0 0 16px rgba(168, 85, 247, 0.25)' }}>
            <img src="/solace-robot.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          </div>
          <span style={{ fontWeight: 900, fontSize: 19, letterSpacing: '-0.02em' }}>Solace</span>
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.14em', color: '#a78bfa' }}>
          <span style={{ color: '#d946ef' }}>STEP {String(step).padStart(2, '0')} //</span> {String(total).padStart(2, '0')}
        </span>
      </header>
      <div style={{ position: 'relative', height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', width: `${(step / total) * 100}%`, background: 'var(--sol-grad-primary)', transition: 'width 450ms var(--sol-ease)', boxShadow: '0 0 12px rgba(168,85,247,0.6)' }} />
      </div>
      <main style={{ position: 'relative', maxWidth: 980, margin: '0 auto', padding: 'clamp(40px, 7vw, 80px) clamp(20px, 4vw, 32px) 80px' }} className="fade-in-up" key={step}>
        {children}
      </main>
    </div>
  );
}

const h1 = { fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '20px 0 14px' };
const lead = { fontSize: 'clamp(15px, 1.3vw, 17px)', color: '#94a3b8', lineHeight: 1.75, maxWidth: 640 };

export default function OnboardingView({ next }) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [concern, setConcern] = useState(user?.onboarding?.concern ?? null);
  const [when, setWhen] = useState('now');
  const [earlier, setEarlier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [maxLocal] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const mimi = useMimiStatus();
  const urgent = concern && concern !== 'exploring';
  const total = urgent ? 3 : 2;

  const saveOnboarding = async () => {
    setBusy(true); setError(null);
    try {
      let r = await Api.onboarding({ concern, startIncident: urgent && when !== 'skip' });
      if (urgent && when === 'earlier') {
        const t = new Date(earlier).getTime();
        if (!Number.isFinite(t) || t > Date.now()) throw Object.assign(new Error('Pick a time in the past.'), { code: 'local' });
        r = await Api.incident({ type: concern, discoveredAt: t });
      }
      setUser(r.user);
      setStep(total);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const finish = () => { toast(`Welcome to Solace, ${user?.name?.split(' ')[0] || 'friend'}.`); navigate(safeNext(next), { replace: true }); };

  if (step === 1) {
    return (
      <Shell step={1} total={total}>
        <span className="sol-eyebrow sol-eyebrow--dark">Account created</span>
        <h1 style={h1}>What brings you to <span style={{ backgroundImage: 'var(--sol-grad-sky)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Solace</span>?</h1>
        <p style={lead}>This sets up your workspace. You can change it later, and nothing here is shared with anyone.</p>
        <div role="radiogroup" aria-label="What brings you to Solace" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 36 }}>
          {CONCERNS.map((c) => {
            const Icon = c.icon, on = concern === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setConcern(c.id)}
                style={{ textAlign: 'left', padding: 20, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', display: 'flex', gap: 14, alignItems: 'flex-start',
                  background: on ? 'rgba(124,58,237,0.16)' : '#0d0814', border: `1px solid ${on ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: on ? '0 0 24px rgba(168,85,247,0.25)' : 'none', transition: 'all 250ms var(--sol-ease)' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center', background: on ? 'var(--sol-grad-primary)' : 'rgba(255,255,255,0.04)', color: on ? '#fff' : '#00d4ff' }}><Icon size={19} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <strong style={{ fontSize: 15, fontWeight: 700 }}>{c.title}</strong>
                  <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{c.body}</span>
                </span>
                {on && <Check size={18} style={{ marginLeft: 'auto', color: '#a78bfa', flex: 'none' }} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="sol-btn sol-btn--white" disabled={!concern || busy} onClick={() => (urgent ? setStep(2) : saveOnboarding())}>
            {busy && <span className="sol-spinner sol-spinner--violet" />}Continue <ArrowRight size={16} />
          </button>
          {!concern && <span style={{ fontSize: 13, color: '#71717a' }}>Choose one option to continue.</span>}
          {error && <span className="sol-alert sol-alert--dark-error">{error}</span>}
        </div>
      </Shell>
    );
  }

  if (step === 2 && urgent) {
    return (
      <Shell step={2} total={total}>
        <span className="sol-eyebrow sol-eyebrow--dark">Golden hour</span>
        <h1 style={h1}>When did you find it?</h1>
        <p style={lead}>
          The first hour matters most. Solace starts a clock from the moment you discovered it, then tracks the platform’s legal deadline once you send a takedown notice.
          You can change or clear this from your dashboard.
        </p>
        <div role="radiogroup" aria-label="When did you find it" style={{ display: 'grid', gap: 12, marginTop: 32, maxWidth: 640 }}>
          {[
            ['now', 'Just now — start the clock'],
            ['earlier', 'Earlier — I’ll enter the time'],
            ['skip', 'Not now — don’t start a clock'],
          ].map(([id, label]) => (
            <label key={id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '16px 18px', borderRadius: 16, cursor: 'pointer', background: when === id ? 'rgba(124,58,237,0.16)' : '#0d0814', border: `1px solid ${when === id ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 250ms var(--sol-ease)' }}>
              <input type="radio" name="when" checked={when === id} onChange={() => setWhen(id)} style={{ accentColor: '#7c3aed', width: 18, height: 18 }} />
              <span style={{ fontWeight: 600 }}>{label}</span>
            </label>
          ))}
          {when === 'earlier' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <span className="sol-dark-label">Date and time you found it</span>
              <input type="datetime-local" className="sol-dark-input" value={earlier} max={maxLocal} onChange={(e) => setEarlier(e.target.value)} style={{ colorScheme: 'dark', maxWidth: 320 }} />
            </label>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="sol-btn sol-btn--ghost" onClick={() => setStep(1)} disabled={busy}>Back</button>
          <button className="sol-btn sol-btn--white" onClick={saveOnboarding} disabled={busy || (when === 'earlier' && !earlier)}>
            {busy && <span className="sol-spinner sol-spinner--violet" />}Continue <ArrowRight size={16} />
          </button>
          {error && <span className="sol-alert sol-alert--dark-error" role="alert">{error}</span>}
        </div>
        <p style={{ marginTop: 32, fontSize: 13, color: '#71717a', maxWidth: 640, lineHeight: 1.7 }}>
          In danger right now? Call <a href="tel:112" style={{ color: '#fda4af' }}>112</a>. Cyber crime helpline: <a href="tel:1930" style={{ color: '#c4b5fd' }}>1930</a>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell step={total} total={total}>
      <span className="sol-eyebrow sol-eyebrow--dark">Last step</span>
      <h1 style={h1}>Add Mimi to your browser</h1>
      <p style={lead}>
        Mimi is Solace’s browser extension. She checks images, messages and profiles inside WhatsApp Web and Instagram, and signs in with this same account.
        You can skip this and add her later from the dashboard.
      </p>
      <div style={{ marginTop: 32, maxWidth: 720 }}>
        <MimiConnectCard status={mimi} compact />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
        {mimi.state !== 'installed' && mimi.state !== 'update' && mimi.state !== 'unsupported' && (
          <a className="sol-btn sol-btn--ghost" href={DOWNLOAD_URL} download><Download size={16} />Download Mimi</a>
        )}
        <button className="sol-btn sol-btn--white" onClick={finish}>Go to my dashboard <ArrowRight size={16} /></button>
      </div>
    </Shell>
  );
}
