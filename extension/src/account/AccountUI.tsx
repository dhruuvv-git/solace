/** Account state UI for the side panel and popup: header chip + Settings card. */
import { useCallback, useEffect, useState } from 'react';
import { APP } from '../shared/app-config';
import { isExtension } from '../ui/env';
import { connectUrl, dashboardUrl, getAccount, onAccountChanged, refreshAccount, signOutAccount, type AccountState } from './account';

export function useAccount(opts: { refresh?: boolean } = {}) {
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => getAccount().then(setState).catch(() => setState({ status: 'signed-out' })), []);
  useEffect(() => {
    if (!isExtension()) { setState({ status: 'signed-out' }); return; }
    void load();
    if (opts.refresh) refreshAccount().then(setState).catch((e) => setError((e as Error).message));
    return onAccountChanged(() => { void load(); });
  }, [load, opts.refresh]);
  return { state, error, reload: load, setError };
}

async function openTab(url: string) {
  if (isExtension() && chrome.tabs?.create) await chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noopener');
}
export const openConnect = async () => openTab(await connectUrl());
const openDashboard = async () => openTab(await dashboardUrl());

const initial = (name?: string) => (name?.trim()?.[0] ?? '•').toUpperCase();

/** Compact chip for the side-panel header. */
export function AccountChip({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state } = useAccount({ refresh: true });
  if (!state) return null;
  if (state.status === 'signed-in' && state.user) {
    return (
      <button className="acct-chip" onClick={onOpenSettings} title={`Signed in as ${state.user.email}`} aria-label={`Account: ${state.user.name}`}>
        <span className="acct-avatar" aria-hidden="true">{initial(state.user.name)}</span>
      </button>
    );
  }
  return (
    <button className={`btn sm acct-signin ${state.status === 'expired' ? 'warn' : ''}`} onClick={() => void openConnect()}
      title={state.status === 'expired' ? 'Your session ended — sign in again' : `Sign in to ${APP.name}`}>
      {state.status === 'expired' ? 'Sign in again' : 'Sign in'}
    </button>
  );
}

/** Full account card for Settings (and the popup). */
export function AccountCard({ compact = false }: { compact?: boolean }) {
  const { state, error, setError } = useAccount({ refresh: !compact });
  const [busy, setBusy] = useState(false);
  if (!state) return <section className="card acct-card" aria-busy="true"><p className="muted small">Checking your account…</p></section>;

  if (state.status === 'signed-in' && state.user) {
    return (
      <section className="card acct-card" aria-labelledby="acct-h">
        <div className="row">
          <span className="acct-avatar lg" aria-hidden="true">{initial(state.user.name)}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <h3 id="acct-h">{state.user.name}</h3>
            <p className="muted small" style={{ overflowWrap: 'anywhere' }}>{state.user.email}</p>
          </div>
          <span className="badge good">Signed in</span>
        </div>
        {!compact && (
          <p className="small muted">
            Mimi works on this device. {state.localOnly ? 'Your website sign-in is mirrored locally in this browser; extension settings do not sync.' : 'Extension settings sync is unavailable in this Vercel-only website version.'}
          </p>
        )}
        {error && <p className="notice bad small">{error}</p>}
        <div className="row">
          <button className="btn sm" onClick={() => void openDashboard()}>Open dashboard</button>
          <button className="btn sm ghost" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { await signOutAccount(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </section>
    );
  }

  const expired = state.status === 'expired';
  return (
    <section className={`card acct-card ${expired ? 'acct-expired' : ''}`} aria-labelledby="acct-h">
      <h3 id="acct-h">{expired ? 'Your session ended' : `Sign in to ${APP.name}`}</h3>
      <p className="small muted">
        {expired
          ? `${state.user?.email ? `${state.user.email} was signed out` : 'You were signed out'}. Open website sign-in to continue.`
          : `${APP.assistant} works without an account. Website sign-in opens the browser-local Solace account page.`}
      </p>
      <button className="btn primary sm" onClick={() => void openConnect()}>{expired ? 'Open website sign-in' : 'Sign in or create an account'}</button>
    </section>
  );
}
