/** Shows Groq's answer (when enabled) above Solace's local analysis. */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../ui/app-context';
import { CopyButton } from '../ui/components';
import { isExtension } from '../ui/env';
import { askGroq, type AiAnswer, type AiRequest } from './groq';

const CAT: Record<AiAnswer['category'], string> = {
  safe: 'No problem found', abuse: 'Abusive message', threat_violence: 'Threat of violence', sexual_threat: 'Threat of sexual violence',
  sextortion: 'Blackmail / sextortion', stalking: 'Stalking', scam: 'Scam', self_harm: 'Self-harm risk', other: 'Other',
};
const TONE: Record<AiAnswer['risk'], string> = { none: 'good', low: 'neutral', medium: 'warn', high: 'bad', emergency: 'bad' };

/** Ensures the extension may call api.groq.com (optional host permission; must run in a click). */
export async function ensureGroqPermission(): Promise<boolean> {
  if (!isExtension() || !chrome.permissions) return true;
  const origins = ['https://api.groq.com/*'];
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}

export function AiAnswerPanel({ request, runKey }: { request: AiRequest | null; runKey: number }) {
  const { settings, go } = useApp();
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; answer?: AiAnswer; error?: string }>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!settings.aiEnabled || !request || !runKey) return;
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setState({ status: 'loading' });
    askGroq(request, { apiKey: settings.groqApiKey, model: settings.groqModel }, ac.signal)
      .then((answer) => setState({ status: 'done', answer }))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setState({ status: 'error', error: (e as Error).message }); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  if (!settings.aiEnabled) return null;
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <div className="panel row small" aria-live="polite"><span className="spinner" />Asking Groq ({settings.groqModel})…</div>;
  if (state.status === 'error') {
    return (
      <div className="notice warn" role="status"><strong>Groq didn’t answer.</strong> {state.error} Solace’s own analysis is shown below.
        {/key|model|Settings/.test(state.error ?? '') && <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => go('settings')}>Open Settings</button></div>}
      </div>
    );
  }
  const a = state.answer!;
  return (
    <section className="stack" aria-live="polite">
      <div className={`verdict ${TONE[a.risk]}`}>
        <div className="row-between">
          <div className="verdict-title">{CAT[a.category]}</div>
          <span className="row"><span className="badge plain">{a.risk === 'none' ? 'no risk' : `${a.risk} risk`}</span><span className="badge plain">AI · Groq</span></span>
        </div>
        <p>{a.summary}</p>
        {a.why.length > 0 && <ul className="plain small">{a.why.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>
      {a.risk === 'emergency' && <div className="notice bad"><strong>Groq thinks you may be in danger now.</strong> Call <a href="tel:112">112</a> if you feel unsafe.</div>}
      {a.do.length > 0 && <div><h4 style={{ color: '#8ff0c1', marginBottom: 6 }}>Do</h4><ul className="plain do">{a.do.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {a.dont.length > 0 && <div><h4 style={{ color: '#ffb0b3', marginBottom: 6 }}>Don’t</h4><ul className="plain dont">{a.dont.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {a.technical.length > 0 && (
        <div className="subpanel stack"><h4>Technical analysis</h4><ul className="plain small">{a.technical.map((x) => <li key={x}>{x}</li>)}</ul></div>
      )}
      {a.legal.length > 0 && (
        <div className="subpanel stack">
          <h4>Legal options in India</h4>
          {a.legal.map((l) => <div key={l.law + l.section} className="row small" style={{ alignItems: 'flex-start' }}><span className="badge plain" style={{ flex: 'none' }}>{l.law} §{l.section}</span><span className="grow">{l.why}</span></div>)}
          <p className="muted xs">Sections are limited to Solace’s verified list{a.droppedLegal ? ` (${a.droppedLegal} unverified reference${a.droppedLegal > 1 ? 's' : ''} removed)` : ''}. Not legal advice.</p>
        </div>
      )}
      {a.rewrite && <div className="subpanel stack"><h4>Groq’s kinder version</h4><p style={{ whiteSpace: 'pre-wrap' }}>{a.rewrite}</p><div><CopyButton text={a.rewrite} label="Copy" /></div></div>}
      {a.replies.length > 0 && (
        <div className="subpanel stack"><h4>Replies you could send</h4>
          {a.replies.map((x) => <div key={x} className="row-between"><span className="small">{x}</span><CopyButton text={x} /></div>)}</div>
      )}
      <p className="muted xs">Answered by Groq ({a.model}). The message was sent to Groq to get this answer. AI can be wrong; Solace’s local check is below.</p>
      <hr className="divider" />
      <h3>Solace local check</h3>
    </section>
  );
}
