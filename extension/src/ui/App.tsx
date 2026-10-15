import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { EvidenceLocker } from '../evidence/EvidenceLocker';
import { TrainYourEye } from '../game/TrainYourEye';
import { IdentityShield } from '../shields/identity/IdentityShield';
import { KindShield } from '../shields/kind/KindShield';
import { RealShield } from '../shields/real/RealShield';
import { SafetyShield } from '../shields/safety/SafetyShield';
import { VIEWS, useApp, type View } from './app-context';
import { Icon, useToast } from './components';
import { APP } from '../shared/app-config';
import { assetUrl, isExtension, openWebsite } from './env';
import { Overview } from './Overview';
import { SettingsView } from './SettingsView';
import { AccountChip } from '../account/AccountUI';

/** Static emergency help that renders even if the rest of the UI fails. */
export function EmergencyFallback({ error }: { error?: string }) {
  return (
    <div className="stack" style={{ padding: 16 }}>
      <div className="emergency" role="alert">
        <h2>Need help now?</h2>
        <a className="btn call" href="tel:112">Call 112 (emergency)</a>
        <p className="small">Cyber crime helpline: <a href="tel:1930">1930</a>. Report online: <a href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">cybercrime.gov.in</a>.</p>
      </div>
      {error && <p className="muted small">Part of Solace stopped working ({error}). Reload the panel to try again.</p>}
      <button className="btn" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message || 'Unknown error' }; }
  render() { return this.state.error ? <EmergencyFallback error={this.state.error} /> : this.props.children; }
}

function ViewBody({ view }: { view: View }) {
  switch (view) {
    case 'real': return <RealShield />;
    case 'kind': return <KindShield />;
    case 'identity': return <IdentityShield />;
    case 'safety': return <SafetyShield />;
    case 'locker': return <EvidenceLocker />;
    case 'game': return <TrainYourEye />;
    case 'settings': return <SettingsView />;
    default: return <Overview />;
  }
}

const VIEW_HINT: Record<View, string> = {
  overview: 'Quick check and recent results',
  real: 'Photos and forwards',
  kind: 'Hurtful messages and repeat senders',
  identity: 'Fake profiles and lookalikes',
  safety: 'Threats, blackmail and scams',
  locker: 'Your saved proof',
  game: 'Practise spotting fakes',
  settings: 'Website, AI, privacy',
};

function MimiMenu({ onClose }: { onClose: () => void }) {
  const { view, go, settings } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []);
    items().find((b) => b.dataset.view === view)?.focus() ?? items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === 'Tab') onClose();
    };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.mimi-trigger')) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose, view]);
  return (
    <div className="mimi-menu" role="menu" aria-label={`${APP.assistant} menu`} ref={ref}>
      <div className="mimi-hello">
        <img src={assetUrl('icons/icon-128.png')} alt="" width={40} height={40} />
        <div><strong>Hi, I’m {APP.assistant}.</strong><span>What do you want to check?</span></div>
      </div>
      <div className="mimi-items">
        {VIEWS.map((v) => (
          <button key={v.id} role="menuitem" data-view={v.id} className={`mimi-item ${view === v.id ? 'on' : ''}`} aria-current={view === v.id ? 'page' : undefined}
            onClick={() => { go(v.id); onClose(); }}>
            <span className="mimi-item-icon"><Icon name={v.icon} size={17} /></span>
            <span className="mimi-item-text"><span>{v.id === 'overview' ? 'Home' : v.label}</span><small>{VIEW_HINT[v.id]}</small></span>
          </button>
        ))}
      </div>
      <button role="menuitem" className="mimi-item mimi-web" onClick={() => { openWebsite(settings.websiteUrl || APP.websiteUrl); onClose(); }}>
        <span className="mimi-item-icon"><Icon name="panel" size={17} /></span>
        <span className="mimi-item-text"><span>Open website</span><small>Dashboard, Evidence Vault, takedown notices</small></span>
      </button>
    </div>
  );
}

export function AppShell({ compact = false }: { compact?: boolean }) {
  const { view, go, settings } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const current = VIEWS.find((v) => v.id === view);
  useEffect(() => {
    if (!isExtension()) return;
    const announce = () => {
      const visible = document.visibilityState === 'visible';
      try { chrome.runtime.sendMessage({ type: 'TL_PANEL_VISIBILITY', visible }, () => { void chrome.runtime.lastError; }); } catch { /* extension context may have closed */ }
    };
    const onPageHide = () => {
      try { chrome.runtime.sendMessage({ type: 'TL_PANEL_VISIBILITY', visible: false }, () => { void chrome.runtime.lastError; }); } catch { /* extension context may have closed */ }
    };
    announce();
    const timer = window.setInterval(announce, 1000);
    document.addEventListener('visibilitychange', announce);
    window.addEventListener('pagehide', onPageHide, { once: true });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', announce);
      window.removeEventListener('pagehide', onPageHide);
      onPageHide();
    };
  }, []);
  return (
    <div className="shell" style={{ maxWidth: compact ? undefined : 720, margin: '0 auto' }}>
      <header className="shell-head">
        <button className={`mimi-trigger ${open ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={`Open ${APP.assistant}`}>
          <img className="brand-logo" src={assetUrl('icons/icon-128.png')} alt="" width={30} height={30} />
          <span className="mimi-name">{APP.assistant}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="mimi-chev"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
        </button>
        <span className="shell-title" aria-live="polite">{view === 'overview' ? APP.name : current?.label}</span>
        <span className="grow" />
        <button className="btn sm head-web" onClick={() => { if (!openWebsite(settings.websiteUrl || APP.websiteUrl)) toast('Set your website link in Settings first.', 'bad'); }} title="Open the website">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="head-web-label">Website</span>
        </button>
        <button className="btn sm danger" onClick={() => go('safety')} title="Open Am I safe?">In danger? <strong>112</strong></button>
        <AccountChip onOpenSettings={() => go('settings')} />
        {open && <MimiMenu onClose={close} />}
      </header>
      <main className="shell-main" aria-label={current?.label}>
        <ErrorBoundary key={view}><ViewBody view={view} /></ErrorBoundary>
      </main>
    </div>
  );
}
