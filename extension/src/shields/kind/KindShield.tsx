/** Shield 2 - Is it kind? Think Before You Send, received-message check, Pattern Detector. */
import { useEffect, useMemo, useState } from 'react';
import { AiAnswerPanel } from '../../ai/AiAnswer';
import type { AiRequest } from '../../ai/groq';
import { assessPattern } from '../../engine/bullying-patterns';
import { fmt } from '../../engine/math';
import { analyzeToxicity } from '../../engine/toxicity';
import { LEXICON } from '../../engine/data/lexicon';
import { addHistory, clearPatterns, deletePattern, listPatterns, recordSenderMessage } from '../../shared/local-data';
import type { PatternAssessment, SenderPattern, ToxicityResult } from '../../shared/types';
import type { SourceInfo } from '../../shared/messaging';
import { useApp } from '../../ui/app-context';
import { CopyButton, EvidenceScale, Icon, copyText, useConfirm, useToast } from '../../ui/components';
import { SaveEvidenceButton, SourceLine, ToxicityHighlight } from '../shared';

const LEVEL = {
  none: { title: 'No hurtful language found', tone: 'good' },
  mild: { title: 'Might come across as unkind', tone: 'warn' },
  hurtful: { title: 'This could hurt someone', tone: 'bad' },
  severe: { title: 'Very hurtful', tone: 'bad' },
} as const;

export function useLexicon() {
  const { settings } = useApp();
  return useMemo(() => [...LEXICON, ...settings.customLexicon], [settings.customLexicon]);
}

export function ToxicityView({ text, r }: { text: string; r: ToxicityResult }) {
  const l = LEVEL[r.level];
  return (
    <div className="stack">
      <div className={`verdict ${l.tone}`}>
        <div className="verdict-title">{l.title}</div>
        <p>{r.explanation}</p>
        <p className="small muted num">S = Σ wₖ·mₖ = {fmt(r.S)}; hurtfulness = 1 − e^−S = {fmt(r.toxicity)}</p>
      </div>
      {r.matches.length > 0 && (
        <>
          <ToxicityHighlight text={text} r={r} />
          <EvidenceScale max={2} leftLabel="" rightLabel="More hurtful" rows={r.matches.map((m, i) => ({
            id: `${m.term}${i}`, name: `“${m.matchedText}”`,
            sub: `${m.category.replace('-', ' ')} · w ${fmt(m.weight)} × m ${fmt(m.multiplier)}${m.modifiers.targeted ? ' · aimed at you' : ''}${m.modifiers.negated ? ' · negated' : ''}${m.modifiers.emphasis ? ' · emphasis' : ''}${m.modifiers.reported ? ' · reported' : ''}`,
            value: m.contribution,
          }))} />
        </>
      )}
      <details className="more"><summary>What this can’t tell you</summary><ul className="plain small muted">{r.limitations.map((x) => <li key={x}>{x}</li>)}</ul></details>
    </div>
  );
}

export function KindShield() {
  const { takeIncoming, incoming, settings, refreshKey, bump, go } = useApp();
  const lex = useLexicon();
  const toast = useToast();
  const { confirm, node } = useConfirm();

  const [draft, setDraft] = useState('');
  const [draftResult, setDraftResult] = useState<ToxicityResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const [received, setReceived] = useState('');
  const [sender, setSender] = useState('');
  const [source, setSource] = useState<SourceInfo | undefined>();
  const [recResult, setRecResult] = useState<ToxicityResult | null>(null);
  const [pattern, setPattern] = useState<{ p: SenderPattern; a: PatternAssessment; added: boolean } | null>(null);

  const [patterns, setPatterns] = useState<SenderPattern[] | null>(null);
  const [aiReq, setAiReq] = useState<AiRequest | null>(null);
  const [aiRun, setAiRun] = useState(0);
  const [aiFor, setAiFor] = useState<'draft' | 'received' | null>(null);

  useEffect(() => {
    const inc = takeIncoming('kind');
    if (inc) {
      setReceived(inc.text); setSender(inc.source?.senderLabel ?? ''); setSource(inc.source);
      const r = analyzeToxicity(inc.text, lex);
      setRecResult(r); setPattern(null);
      addHistory({ shield: 'kind', title: 'Received message', outcome: LEVEL[r.level].title, tone: r.level === 'none' ? 'good' : r.level === 'mild' ? 'warn' : 'bad', text: inc.text.slice(0, 500) });
    }
  }, [incoming, takeIncoming, lex]);

  useEffect(() => { listPatterns().then(setPatterns).catch(() => setPatterns([])); }, [refreshKey]);

  const checkDraft = () => {
    const r = analyzeToxicity(draft, lex);
    setDraftResult(r); setDismissed(false);
    setAiReq({ mode: 'draft', text: draft, local: { level: r.level, categories: r.categories, words: r.matches.map((m) => m.matchedText) } }); setAiRun((n) => n + 1); setAiFor('draft');
    addHistory({ shield: 'kind', title: 'Draft check', outcome: LEVEL[r.level].title, tone: r.level === 'none' ? 'good' : r.level === 'mild' ? 'warn' : 'bad', text: draft.slice(0, 500) });
  };

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h2>Is it kind?</h2>
        <p>Pause before you post, check messages you receive, and spot when one person keeps targeting you.</p>
      </div>

      <section className="section panel">
        <h3>Think before you send</h3>
        <label className="field"><span className="lbl">Your draft message</span>
          <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setDraftResult(null); }} placeholder="Type or paste what you are about to send" rows={4} />
        </label>
        <div className="row"><button className="btn primary" disabled={!draft.trim()} onClick={checkDraft}>Check my message</button></div>
        {aiFor === 'draft' && <AiAnswerPanel request={aiReq} runKey={aiRun} />}
        {draftResult && !dismissed && (
          draftResult.level === 'none' ? (
            <div className="notice good">Looks fine. {draftResult.matches.length ? draftResult.explanation : 'No hurtful words from the local list.'}</div>
          ) : (
            <div className="stack">
              <ToxicityView text={draft} r={draftResult} />
              {draftResult.suggestion && (
                <div className="subpanel stack">
                  <h4>A kinder way to say it</h4>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{draftResult.suggestion}</p>
                  <div className="row">
                    <CopyButton text={draftResult.suggestion} label="Copy suggestion" />
                    <button className="btn sm" onClick={() => { setDraft(draftResult.suggestion!); setDraftResult(null); }}>Use as my draft</button>
                    <button className="btn sm" onClick={async () => { const ok = await copyText(draft); toast(ok ? 'Copied your original text' : 'Copy failed', ok ? 'ok' : 'bad'); }}>Copy my original</button>
                    <button className="btn ghost sm" onClick={() => setDismissed(true)}>Dismiss</button>
                  </div>
                  <p className="muted xs">Solace never edits or sends messages for you. You decide.</p>
                </div>
              )}
            </div>
          )
        )}
      </section>

      <section className="section panel">
        <h3>Check a message you received</h3>
        <SourceLine source={source} />
        <label className="field"><span className="lbl">Message</span>
          <textarea value={received} onChange={(e) => { setReceived(e.target.value); setRecResult(null); setPattern(null); }} rows={3} placeholder="Paste the message" />
        </label>
        <label className="field"><span className="lbl">Who sent it? (optional)</span>
          <input type="text" value={sender} maxLength={80} onChange={(e) => { setSender(e.target.value); setPattern(null); }} placeholder="Name or number as shown in the chat" />
          <span className="xs">Needed for the Pattern Detector. Stored on this device only, under a salted fingerprint.</span>
        </label>
        <div className="row"><button className="btn primary" disabled={!received.trim()} onClick={() => {
          const r = analyzeToxicity(received, lex);
          setRecResult(r); setPattern(null);
          setAiReq({ mode: 'received', text: received, local: { level: r.level, categories: r.categories, words: r.matches.map((m) => m.matchedText) } }); setAiRun((n) => n + 1); setAiFor('received');
          addHistory({ shield: 'kind', title: 'Received message', outcome: LEVEL[r.level].title, tone: r.level === 'none' ? 'good' : r.level === 'mild' ? 'warn' : 'bad', text: received.slice(0, 500) });
        }}>Check message</button></div>
        {aiFor === 'received' && <AiAnswerPanel request={aiReq} runKey={aiRun} />}
        {recResult && (
          <div className="stack">
            <ToxicityView text={received} r={recResult} />
            {(recResult.categories.includes('threat') || recResult.categories.includes('sexual-harassment')) && (
              <div className="notice bad"><strong>This looks like a threat, not just an insult.</strong> Get a safety plan with the legal options and what the sender can actually do.
                <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => go('safety', { view: 'safety', text: received, source })}>Open Am I safe?</button></div></div>
            )}
            <div className="row">
              {sender.trim() && recResult.toxicity >= 0.25 && !pattern && (
                <button className="btn" onClick={async () => {
                  try {
                    const res = await recordSenderMessage(source?.platform ?? 'manual', sender, received, recResult.toxicity, recResult.primaryCategory);
                    setPattern({ p: res.pattern, a: res.assessment, added: res.added }); bump();
                    toast(res.added ? 'Added to pattern history' : 'This message was already recorded');
                  } catch (e) { toast((e as Error).message, 'bad'); }
                }}>Add to pattern history</button>
              )}
              <SaveEvidenceButton build={() => ({
                text: received, url: source?.url ?? 'manual-entry', platform: source?.platform ?? 'manual', senderLabel: sender.trim() || undefined,
                category: recResult.primaryCategory ?? 'none', severity: recResult.toxicity, source: 'side-panel',
              })} />
            </div>
            {sender.trim() && recResult.toxicity < 0.25 && <p className="muted xs">Below the 0.25 hurtfulness level, so it is not added to pattern history.</p>}
            {pattern && <PatternCard p={pattern.p} a={pattern.a} />}
          </div>
        )}
      </section>

      <section className="section">
        <div className="row-between">
          <h3>Pattern Detector</h3>
          {patterns && patterns.length > 0 && <button className="btn danger sm" onClick={async () => {
            if (await confirm('Clear pattern history?', 'All locally stored sender scores will be deleted. This cannot be undone.', 'Clear history')) { await clearPatterns(); bump(); toast('Pattern history cleared'); }
          }}>Clear history</button>}
        </div>
        <p className="muted small">Score per sender: S ← {`λ^Δt`}·S + new hurtfulness, with λ = 0.8 per day. An alert needs S &gt; {settings.patternTheta}, so a single message never counts as bullying. Automatic tracking from WhatsApp/Instagram is {settings.patternTracking ? 'on' : 'off'} (Settings).</p>
        {patterns === null ? <p className="muted small">Loading…</p> : patterns.length === 0 ? (
          <div className="empty"><Icon name="kind" /><span>No hurtful messages recorded yet. Check a received message above and add it to the history.</span></div>
        ) : (
          <div className="stack">{patterns.map((p) => {
            const a = assessPattern(p, Date.now(), settings.patternTheta);
            return <PatternCard key={p.senderKey} p={p} a={a} onDelete={async () => { await deletePattern(p.senderKey); bump(); toast('Sender removed'); }} />;
          })}</div>
        )}
      </section>
      {node}
    </div>
  );
}

export function PatternCard({ p, a, onDelete }: { p: SenderPattern; a: PatternAssessment; onDelete?: () => void }) {
  return (
    <div className={`verdict ${a.alert ? 'bad' : a.eventCount > 1 ? 'warn' : 'neutral'}`}>
      <div className="row-between">
        <strong>{p.label}</strong>
        <span className="row">
          <span className={`badge ${a.alert ? 'bad' : a.escalating ? 'warn' : ''}`}>{a.alert ? 'Repeated targeting' : a.eventCount === 1 ? 'Single message' : 'Watching'}</span>
          {onDelete && <button className="btn ghost sm" aria-label={`Delete history for ${p.label}`} onClick={onDelete}><Icon name="trash" size={14} /></button>}
        </span>
      </div>
      <p className="small">{a.explanation}</p>
      <div className="progress" aria-label={`Score ${fmt(a.score)} of alert level ${a.threshold}`}><div style={{ width: `${Math.min(100, (a.score / (a.threshold * 1.5)) * 100)}%`, background: a.alert ? 'var(--danger)' : 'var(--caution)' }} /></div>
      <p className="xs muted num">Score {fmt(a.score)} · alert above {a.threshold} · {a.eventCount} message(s){a.slopePerDay !== null ? ` · trend ${a.slopePerDay > 0 ? '+' : ''}${fmt(a.slopePerDay, 3)}/day` : ''}</p>
      {a.alert && <p className="small">Save the messages, block the sender, and tell someone you trust. If it continues, report it on the platform or at cybercrime.gov.in.</p>}
    </div>
  );
}
