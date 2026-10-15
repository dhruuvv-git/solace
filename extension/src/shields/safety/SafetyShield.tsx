/** Shield 4 - Am I safe? Local Safety Copilot. */
import { useEffect, useState } from 'react';
import { assessPattern } from '../../engine/bullying-patterns';
import { AiAnswerPanel } from '../../ai/AiAnswer';
import type { AiRequest } from '../../ai/groq';
import { analyzeThreat } from '../../engine/threat-analysis';
import { saveEvidence } from '../../evidence/evidence-store';
import { HELP } from '../../shared/constants';
import { addHistory, getSenderPattern } from '../../shared/local-data';
import type { SourceInfo } from '../../shared/messaging';
import type { ThreatAssessment, ThreatCategory } from '../../shared/types';
import { useApp } from '../../ui/app-context';
import { CopyButton, ErrorNote, FileDrop, Icon, Modal, RiskGauge, readFileDataUrl, useToast } from '../../ui/components';
import { SaveEvidenceButton, SourceLine } from '../shared';

const CAT_NAME: Record<ThreatCategory, string> = { sextortion: 'Blackmail / sextortion', scam: 'Scam', stalking: 'Stalking', physical: 'Threat of violence', abuse: 'Abusive message' };
const LEVEL: Record<ThreatAssessment['level'], { title: string; tone: string }> = {
  none: { title: 'No threat pattern found', tone: 'neutral' },
  low: { title: 'Low risk', tone: 'good' },
  medium: { title: 'Medium risk', tone: 'warn' },
  high: { title: 'High risk', tone: 'bad' },
  emergency: { title: 'Emergency', tone: 'bad' },
};

export function EmergencyBlock({ evidence }: { evidence?: string[] }) {
  return (
    <div className="emergency" role="alert">
      <h2>If you are in danger now, call 112</h2>
      {evidence && evidence.length > 0 && <p className="small">Solace noticed: {evidence.slice(0, 2).join(' / ')}</p>}
      <a className="btn call" href={HELP.emergency.href}>Call 112</a>
      <ul className="plain small">
        <li>Move to a safe place with other people around. Don’t go outside to meet this person.</li>
        <li>Tell a trusted adult or friend right now and stay with them.</li>
        <li>Report later at <a href={HELP.cyberPortal.href} target="_blank" rel="noreferrer">cybercrime.gov.in</a>; for money fraud call <a href={HELP.cyberHelpline.href}>1930</a>.</li>
      </ul>
      <p className="xs">Solace never calls anyone or contacts the police for you. The button opens your phone/calling app.</p>
    </div>
  );
}

export function SafetyShield() {
  const { takeIncoming, incoming, settings, updateSettings, bump } = useApp();
  const toast = useToast();
  const [text, setText] = useState('');
  const [sender, setSender] = useState('');
  const [repeated, setRepeated] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [aiReq, setAiReq] = useState<AiRequest | null>(null);
  const [aiRun, setAiRun] = useState(0);
  const [minor, setMinor] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [source, setSource] = useState<SourceInfo | undefined>();
  const [r, setR] = useState<ThreatAssessment | null>(null);
  const [override, setOverride] = useState<ThreatCategory | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inc = takeIncoming('safety');
    if (inc) { setText(inc.text); setSender(inc.source?.senderLabel ?? ''); setSource(inc.source); setR(null); setSavedId(null); }
  }, [incoming, takeIncoming]);

  const analyze = async (cat: ThreatCategory | null = override, allowAutoSave = true) => {
    setError(null);
    if (!text.trim()) { setError('Paste or type the messages first. If you only have a screenshot, type the key lines from it.'); return; }
    let patternRising = false;
    if (sender.trim()) {
      const p = await getSenderPattern(source?.platform ?? 'manual', sender).catch(() => null);
      if (p) { const a = assessPattern(p, Date.now(), settings.patternTheta); patternRising = a.alert || a.escalating; }
    }
    const res = analyzeThreat(text, { patternRising, repeatedContact: repeated, overrideCategory: cat, anonymous, minor });
    setR(res);
    if (cat === null || cat === undefined) {
      setAiReq({ mode: 'safety', text, anonymous, minor, local: { category: res.primary, level: res.level, risk: res.risk, emergency: res.emergency.triggered, warning_signs: res.warningSigns.map((s) => s.id), abusive_words: res.toxicityMatches.map((m) => m.text) } });
      setAiRun((n) => n + 1);
    }
    addHistory({ shield: 'safety', title: 'Safety check', outcome: `${LEVEL[res.level].title}${res.primary ? ` (${CAT_NAME[res.primary]})` : ''}`, tone: res.level === 'none' || res.level === 'low' ? 'neutral' : res.level === 'medium' ? 'warn' : 'bad' });
    if (!allowAutoSave) return;
    if (!settings.safetyIntroSeen) { setIntro(true); return; }
    if (settings.autoSaveSafetyEvidence && res.level !== 'none') await doSave(res);
  };

  const doSave = async (res: ThreatAssessment) => {
    setSaveError(null);
    try {
      const rec = await saveEvidence({
        text, url: source?.url ?? 'manual-entry', platform: source?.platform ?? 'manual', senderLabel: sender.trim() || undefined,
        screenshot: shot ?? undefined, category: res.primary ?? 'none', riskScore: res.risk, riskLevel: res.level, source: 'safety-copilot',
      });
      setSavedId(rec.id); bump();
      toast('Saved to Evidence Locker');
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h2>Am I safe?</h2>
        <p>Paste a threatening or pushy chat. Solace checks it on this device and gives you a clear, calm plan. Nothing is sent anywhere.</p>
      </div>

      <section className="section panel">
        <SourceLine source={source} />
        <label className="field"><span className="lbl">The messages</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setR(null); setSavedId(null); }} rows={6} placeholder={'e.g. Send ₹5000 by tonight or I will share your photos with your family'} />
        </label>
        <label className="field"><span className="lbl">Sender name or number (optional)</span>
          <input type="text" value={sender} maxLength={80} onChange={(e) => setSender(e.target.value)} placeholder="As shown in the chat" />
          <span className="xs">Used to check your local Pattern Detector history for this sender.</span>
        </label>
        <label className="check"><input type="checkbox" checked={repeated} onChange={(e) => setRepeated(e.target.checked)} />This person keeps contacting me</label>
        <label className="check"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />I don’t know who this is (random number or account)</label>
        <label className="check"><input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} />The person being targeted is under 18</label>
        <details className="more">
          <summary>{shot ? 'Screenshot attached' : 'Attach a screenshot (optional)'}</summary>
          {shot ? (
            <div className="stack"><img src={shot} alt="Attached screenshot" className="thumb" /><button className="btn ghost sm" onClick={() => setShot(null)}>Remove screenshot</button></div>
          ) : (
            <FileDrop accept="image/png,image/jpeg,image/webp" label="Choose screenshot" hint="Kept with the evidence. Text in screenshots is not read automatically — type the key lines above." onFile={async (f) => {
              if (f.size > 8 * 1024 * 1024) { toast('Screenshot is larger than 8 MB.', 'bad'); return; }
              try { setShot(await readFileDataUrl(f)); } catch (e) { toast((e as Error).message, 'bad'); }
            }} />
          )}
        </details>
        <button className="btn primary block" onClick={() => void analyze(null)}><Icon name="safety" size={16} />Check my safety</button>
        {error && <ErrorNote message={error} />}
      </section>

      {r && r.emergency.triggered && settings.aiEnabled && <EmergencyBlock evidence={r.emergency.evidence} />}
      <AiAnswerPanel request={aiReq} runKey={aiRun} />
      {r && (
        <div className="stack-lg" aria-live="polite">
          {r.emergency.triggered && !settings.aiEnabled && <EmergencyBlock evidence={r.emergency.evidence} />}
          <div className={`verdict ${r.primary === 'abuse' ? 'warn' : LEVEL[r.level].tone}`}>
            <div className="row-between"><div className="verdict-title">{r.primary === 'abuse' ? 'Abusive message, not a threat' : LEVEL[r.level].title}</div>{r.primary && <span className="badge">{CAT_NAME[r.primary]}</span>}</div>
            <p>{r.explanation}</p>
            {r.primary && <><RiskGauge risk={r.risk} /><p className="small muted num">Risk = likelihood {r.likelihood} × severity {r.severity} = {r.risk} / 25{r.emergency.triggered ? ' (emergency override applied)' : ''}</p></>}
          </div>

          {r.primary && (
            <label className="field"><span className="lbl">Did Solace get the type wrong?</span>
              <select value={r.primary} onChange={(e) => { const c = e.target.value as ThreatCategory; setOverride(c); void analyze(c, false); }}>
                {(Object.keys(CAT_NAME) as ThreatCategory[]).map((c) => <option key={c} value={c}>{CAT_NAME[c]}{r.hits.some((h) => h.category === c) ? ' (detected)' : ''}</option>)}
              </select>
            </label>
          )}

          {(r.hits.length > 0 || r.warningSigns.length > 0) && (
            <section className="section">
              <h3>Why</h3>
              {r.hits.map((h) => (
                <div key={h.category} className="subpanel small"><strong>{CAT_NAME[h.category]}</strong> (severity {h.severity})<ul className="plain muted">{h.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>
              ))}
              {r.warningSigns.length > 0 && (
                <div className="subpanel small"><strong>Warning signs ({r.warningSigns.length}) → likelihood {r.likelihood}</strong>
                  <ul className="plain">{r.warningSigns.map((s) => <li key={s.id}>{s.label}<div className="muted xs">{s.evidence.join(' / ')}</div></li>)}</ul></div>
              )}
            </section>
          )}

          {r.abuse && (
            <section className="section">
              <h3>What this message is</h3>
              <p>{r.abuse.meaning}</p>
              {r.toxicityMatches.length > 0 && <p className="small">Abusive words found: {r.toxicityMatches.slice(0, 6).map((m) => `“${m.text}”`).join(', ')}</p>}
              <div className="list">{r.abuse.options.map((o) => (
                <div key={o.title} className="list-item" style={{ alignItems: 'flex-start' }}><div className="grow"><strong>{o.title}</strong><div className="muted small">{o.detail}</div></div></div>
              ))}</div>
              <div className="subpanel stack">
                <h4>If you want to reply</h4>
                {r.abuse.replies.map((x) => <div key={x} className="row-between"><span className="small">{x}</span><CopyButton text={x} /></div>)}
              </div>
            </section>
          )}

          {r.guidance && (
            <>
              <section className="section">
                <h3>Technical analysis</h3>
                <p className="muted small">What the sender can actually do, and how to cut that off.</p>
                <div className="list">{r.guidance.technical.map((t) => (
                  <div key={t.title} className="list-item" style={{ alignItems: 'flex-start' }}><div className="grow"><strong>{t.title}</strong><div className="muted small">{t.detail}</div></div></div>
                ))}</div>
              </section>
              <section className="section">
                <h3>Legal options in India</h3>
                <p className="muted small">This is a crime you can report. Laws that may apply:</p>
                <div className="list">{r.guidance.laws.map((l) => (
                  <div key={l.law + l.section} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <span className="badge plain" style={{ flex: 'none' }}>{l.law} §{l.section}</span>
                    <div className="grow"><div className="small">{l.covers}</div><div className="muted xs">{l.why}</div></div>
                  </div>
                ))}</div>
                <h4>Where to report</h4>
                <div className="list">{r.guidance.report.map((x) => (
                  <div key={x.href} className="list-item"><div className="grow"><strong>{x.label}</strong><div className="muted xs">{x.when}</div></div>
                    <a className="btn sm" href={x.href} target={x.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{x.href.startsWith('tel') ? 'Call' : 'Open'}</a></div>
                ))}</div>
                <p className="muted xs">{r.guidance.disclaimer}</p>
              </section>
            </>
          )}

          {!r.abuse && <section className="section">
            <h3>What to do now</h3>
            {r.actionPlan.do.length > 0 && <div><h4 style={{ color: '#8ff0c1', marginBottom: 6 }}>Do</h4><ul className="plain do">{r.actionPlan.do.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {r.actionPlan.dont.length > 0 && <div><h4 style={{ color: '#ffb0b3', marginBottom: 6 }}>Don’t</h4><ul className="plain dont">{r.actionPlan.dont.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {r.actionPlan.contacts.length > 0 && (
              <div className="list">{r.actionPlan.contacts.map((c) => (
                <div key={c.value} className="list-item"><div className="grow"><strong>{c.label}</strong><div className="muted xs">{c.note}</div></div>
                  <a className="btn sm" href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{c.href.startsWith('tel') ? `Call ${c.value}` : 'Open portal'}</a></div>
              ))}</div>
            )}
          </section>}

          <div className="stack">
            {savedId ? <div className="notice good">Saved to the Evidence Locker with a SHA-256 fingerprint.</div>
              : r.level !== 'none' && settings.safetyIntroSeen && (
                <SaveEvidenceButton onSaved={setSavedId} build={() => ({
                  text, url: source?.url ?? 'manual-entry', platform: source?.platform ?? 'manual', senderLabel: sender.trim() || undefined,
                  screenshot: shot ?? undefined, category: r.primary ?? 'none', riskScore: r.risk, riskLevel: r.level, source: 'safety-copilot',
                })} />
              )}
            {saveError && <ErrorNote message={`Evidence was not saved: ${saveError}`} onRetry={() => void doSave(r)} />}
          </div>
          <p className="muted xs">{r.limitations.join(' ')}</p>
        </div>
      )}

      {intro && r && (
        <Modal title="Keep evidence automatically?" onClose={() => { setIntro(false); void updateSettings({ safetyIntroSeen: true, autoSaveSafetyEvidence: false }); }}>
          <p>When you run a safety check, Solace can save the messages{shot ? ', your screenshot' : ''}, the time, the source and the risk score to your Evidence Locker, with a tamper-check fingerprint.</p>
          <p className="muted small">It stays on this device. Only checks you start yourself are saved — Solace never watches your chats in the background. You can change this in Settings.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={async () => { setIntro(false); await updateSettings({ safetyIntroSeen: true, autoSaveSafetyEvidence: false }); }}>Ask each time</button>
            <button className="btn primary" onClick={async () => { setIntro(false); await updateSettings({ safetyIntroSeen: true, autoSaveSafetyEvidence: true }); if (r.level !== 'none') await doSave(r); }}>Save automatically</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
