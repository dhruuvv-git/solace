import { useEffect, useState } from 'react';
import { AccountCard } from '../account/AccountUI';
import { costThreshold } from '../engine/bayesian-fusion';
import { clearEvidence } from '../evidence/evidence-store';
import { FUSION, PATTERN } from '../shared/constants';
import { idb } from '../shared/idb';
import { clearHistory, clearPatterns } from '../shared/local-data';
import { DEFAULT_SETTINGS, kvRemove } from '../shared/settings';
import type { HarmCategory } from '../shared/types';
import { useApp } from './app-context';
import { Icon, Switch, useConfirm, useToast } from './components';
import { ensureGroqPermission } from '../ai/AiAnswer';
import { APP, safeWebsiteUrl } from '../shared/app-config';
import { GROQ_MODEL_CHOICES, testGroq, validateKey } from '../ai/groq';
import { hasAllSitesAccess, isExtension, openWebsite, removeAllSitesAccess, requestAllSitesAccess } from './env';

export function SettingsView() {
  const { settings: s, updateSettings, bump, mode } = useApp();
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const [allSites, setAllSites] = useState<boolean | null>(null);
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState<HarmCategory>('insult');
  const [weight, setWeight] = useState('0.6');
  const [thr, setThr] = useState(String(s.threshold));
  const [theta, setTheta] = useState(String(s.patternTheta));

  useEffect(() => { hasAllSitesAccess().then(setAllSites); }, []);
  useEffect(() => { setThr(String(s.threshold)); setTheta(String(s.patternTheta)); }, [s.threshold, s.patternTheta]);

  const set = async (p: Partial<typeof s>, msg = 'Setting saved') => { await updateSettings(p); toast(msg); };
  const ext = mode === 'extension' && isExtension();

  return (
    <div className="stack-lg">
      <div className="section-head"><h2>Settings</h2><p>Every option changes how the extension behaves on this device. <span className="badge plain">Version {typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : 'demo'}</span></p></div>

      {ext && <AccountCard />}

      <WebsiteSettings />

      <AiSettings />

      <section className="section panel">
        <h3>WhatsApp Web and Instagram</h3>
        {!ext && <p className="notice">These apply to the installed extension. In this demo they are saved but there are no web pages to act on.</p>}
        <Switch label="Enable on WhatsApp Web" checked={s.whatsappEnabled} onChange={(v) => set({ whatsappEnabled: v })} description="Adds the Solace button, warnings and selection tools on web.whatsapp.com." />
        <Switch label="Enable on Instagram" checked={s.instagramEnabled} onChange={(v) => set({ instagramEnabled: v })} description="Adds warnings, comment blurring and profile review on instagram.com." />
        <Switch label="Blur hurtful messages and comments" checked={s.abuseShieldBlur} onChange={(v) => set({ abuseShieldBlur: v })} description="Visible text matching the local word list is blurred with a label and a Reveal button. Nothing is deleted." />
        <Switch label="Warn while I type" checked={s.composerWarnings} onChange={(v) => set({ composerWarnings: v })} description="Shows a gentle note next to the message box if your draft may hurt someone. It never blocks or changes sending." />
        <Switch label="Show the floating Solace button" checked={s.floatingButton} onChange={(v) => set({ floatingButton: v })} />
        <Switch label="Track repeat senders automatically" checked={s.patternTracking} onChange={(v) => set({ patternTracking: v })} description="When a blurred message has a visible sender, store a salted fingerprint of the sender, the time and the score (no message text) for the Pattern Detector." />
      </section>

      {ext && (
        <section className="section panel">
          <h3>Image checks on other websites</h3>
          <p className="muted small">Right-click checks work on WhatsApp, Instagram and the page you’re on. Some sites load images from other servers; to fetch those, Solace needs permission to read images from all sites. It only uses it when you choose “Check image”.</p>
          <div className="row">
            <span className={`badge ${allSites ? 'good' : ''}`}>{allSites === null ? 'Checking…' : allSites ? 'Allowed' : 'Not allowed'}</span>
            {allSites ? (
              <button className="btn sm" onClick={async () => { const ok = await removeAllSitesAccess(); setAllSites(!ok ? true : false); toast(ok ? 'Access removed' : 'Could not remove access', ok ? 'ok' : 'bad'); }}>Remove access</button>
            ) : (
              <button className="btn sm" onClick={async () => { const ok = await requestAllSitesAccess(); setAllSites(ok); toast(ok ? 'Access granted' : 'Access not granted', ok ? 'ok' : 'bad'); }}>Allow image access on all sites</button>
            )}
          </div>
        </section>
      )}

      <section className="section panel">
        <h3>Evidence and history</h3>
        <Switch label="Keep a list of recent checks" checked={s.scanHistory} onChange={(v) => set({ scanHistory: v })} description="Only the check type and result are kept (never message text or images), up to 100 entries." />
        <Switch label="Save safety checks to the Evidence Locker automatically" checked={s.autoSaveSafetyEvidence} onChange={(v) => set({ autoSaveSafetyEvidence: v, safetyIntroSeen: true })} description="Only for checks you start in “Am I safe?”." />
        <Switch label="Include a screenshot when saving from a page" checked={s.includeScreenshots} onChange={(v) => set({ includeScreenshots: v })} />
      </section>

      <section className="section panel">
        <h3>Thresholds</h3>
        <p className="muted small">Images are called “Likely fake” when P(fake) is at or above this value, otherwise “Likely real”. 0.5 treats both mistakes as equally bad (t = C_FP/(C_FP+C_FN) = {costThreshold(FUSION.costFalsePositive, FUSION.costFalseNegative).toFixed(2)}); raise it if wrongly calling real photos fake worries you more.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 140px' }}><span className="lbl">Call it fake at P ≥</span><input type="number" step="0.05" min="0.2" max="0.8" value={thr} onChange={(e) => setThr(e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 100px' }}><span className="lbl">Bullying alert above</span><input type="number" step="0.1" min="1.1" max="10" value={theta} onChange={(e) => setTheta(e.target.value)} /></label>
        </div>
        <div className="row">
          <button className="btn sm primary" onClick={() => set({ threshold: Number(thr), patternTheta: Number(theta) }, 'Thresholds saved (out-of-range values were adjusted)')}>Save thresholds</button>
          <button className="btn ghost sm" onClick={() => set({ threshold: DEFAULT_SETTINGS.threshold, patternTheta: PATTERN.theta }, 'Defaults restored')}>Restore defaults</button>
        </div>
      </section>

      <section className="section panel">
        <h3>Your extra words</h3>
        <p className="muted small">Add slang or names used to bully someone in your group. Used by “Is it kind?” and the page warnings.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '2 1 140px' }}><span className="lbl">Word or phrase</span><input type="text" value={term} maxLength={60} onChange={(e) => setTerm(e.target.value)} /></label>
          <label className="field" style={{ flex: '1 1 120px' }}><span className="lbl">Type</span>
            <select value={cat} onChange={(e) => setCat(e.target.value as HarmCategory)}>
              <option value="insult">Insult</option><option value="profanity">Swearing / abuse</option><option value="threat">Threat</option><option value="body-shaming">Body shaming</option><option value="identity-hate">Identity hate</option><option value="sexual-harassment">Sexual harassment</option>
            </select></label>
          <label className="field" style={{ flex: '1 1 70px' }}><span className="lbl">Weight</span><input type="number" step="0.1" min="0.1" max="2" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        </div>
        <div><button className="btn sm" disabled={term.trim().length < 2} onClick={async () => {
          const w = Math.min(2, Math.max(0.1, Number(weight) || 0.6));
          await set({ customLexicon: [...s.customLexicon, { term: term.trim().toLowerCase(), category: cat, weight: w, lang: 'en' }] }, 'Word added');
          setTerm('');
        }}>Add word</button></div>
        {s.customLexicon.length > 0 && <div className="list">{s.customLexicon.map((e, i) => (
          <div key={e.term + i} className="list-item small"><span className="grow">{e.term} <span className="muted">({e.category}, w {e.weight})</span></span>
            <button className="btn ghost sm" aria-label={`Remove ${e.term}`} onClick={() => set({ customLexicon: s.customLexicon.filter((_, j) => j !== i) }, 'Word removed')}><Icon name="trash" size={14} /></button></div>
        ))}</div>}
      </section>

      <section className="section panel" id="privacy">
        <h3>Privacy</h3>
        <ul className="plain small">
          <li>All analysis runs inside your browser. Solace has no server and no analytics. Images and chats are never uploaded — except the text of a message check when you turn on Groq answers above.</li>
          <li>Stored on this device: settings, your Evidence Locker, recent check summaries, Pattern Detector scores (salted sender fingerprints) and image fingerprints you saved.</li>
          <li>Pages are read only when you act (right-click, select text, press a Solace button) or for features you switched on above.</li>
          <li>Solace never sends messages, reports accounts, calls anyone or changes your WhatsApp or Instagram settings.</li>
          <li>Uninstalling the extension deletes all of its local data.</li>
        </ul>
        <h4>Delete data</h4>
        <div className="row">
          <button className="btn danger sm" onClick={async () => { if (await confirm('Delete check history?', 'Recent check summaries will be deleted.', 'Delete')) { await clearHistory(); bump(); toast('History deleted'); } }}>Check history</button>
          <button className="btn danger sm" onClick={async () => { if (await confirm('Delete pattern history?', 'All sender scores will be deleted.', 'Delete')) { await clearPatterns(); bump(); toast('Pattern history deleted'); } }}>Pattern history</button>
          <button className="btn danger sm" onClick={async () => { if (await confirm('Delete all evidence?', 'Everything in the Evidence Locker will be deleted. Export first if you may need it.', 'Delete')) { await clearEvidence(); bump(); toast('Evidence deleted'); } }}>Evidence</button>
          <button className="btn danger sm" onClick={async () => { if (await confirm('Delete saved fingerprints?', 'Your known-fakes list and saved profile photo fingerprints will be deleted.', 'Delete')) { await idb.clear('refs'); bump(); toast('Fingerprints deleted'); } }}>Image fingerprints</button>
          <button className="btn danger sm" onClick={async () => { if (await confirm('Reset game?', 'Your rating and progress will be deleted.', 'Reset')) { await kvRemove('game'); toast('Game reset'); } }}>Game progress</button>
        </div>
      </section>
      {node}
    </div>
  );
}

function AiSettings() {
  const { settings: s, updateSettings } = useApp();
  const toast = useToast();
  const [key, setKey] = useState(s.groqApiKey);
  const [model, setModel] = useState(s.groqModel);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setKey(s.groqApiKey); setModel(s.groqModel); }, [s.groqApiKey, s.groqModel]);
  return (
    <section className="section panel">
      <h3>AI answers (Groq)</h3>
      <p className="muted small">Optional. When on, Groq’s AI writes the answer for message checks in “Am I safe?” and “Is it kind?”, with Solace’s own analysis shown underneath as a backup. <strong>The message you check is sent to Groq’s servers</strong> using your own API key. Images, evidence and everything else stay on this device. Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>.</p>
      <Switch label="Let Groq answer message checks" checked={s.aiEnabled} onChange={async (v) => {
        if (v) {
          const allowed = await ensureGroqPermission(); // must run first, inside the click
          if (!allowed) { toast('Solace needs permission to contact api.groq.com.', 'bad'); return; }
          if (validateKey(key)) { await updateSettings({ groqApiKey: key.trim() }); }
        }
        await updateSettings({ aiEnabled: v, groqApiKey: key.trim(), groqModel: model });
        toast(v ? 'Groq answers turned on' : 'Groq answers turned off');
      }} description="Off by default. You can turn it off any time." />
      <label className="field"><span className="lbl">Groq API key</span>
        <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); setStatus(null); }} placeholder="gsk_…" />
        <span className="xs">Stored only in this browser. Anyone with access to this computer’s browser profile could read it.</span>
      </label>
      <label className="field"><span className="lbl">Model</span>
        <select value={GROQ_MODEL_CHOICES.includes(model) ? model : '__custom'} onChange={(e) => { if (e.target.value !== '__custom') setModel(e.target.value); else setModel(''); setStatus(null); }}>
          {GROQ_MODEL_CHOICES.map((m) => <option key={m} value={m}>{m}{m === 'openai/gpt-oss-120b' ? ' (recommended)' : ''}</option>)}
          <option value="__custom">Other…</option>
        </select>
        {!GROQ_MODEL_CHOICES.includes(model) && <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id from console.groq.com/docs/models" />}
      </label>
      <div className="row">
        <button className="btn sm primary" onClick={async () => { await updateSettings({ groqApiKey: key.trim(), groqModel: model.trim() || 'openai/gpt-oss-120b' }); toast('Saved'); }}>Save</button>
        <button className="btn sm" disabled={busy} onClick={async () => {
          setBusy(true); setStatus(null);
          try {
            if (!(await ensureGroqPermission())) throw new Error('Permission to contact api.groq.com was not granted.');
            const msg = await testGroq({ apiKey: key.trim(), model: model.trim() });
            await updateSettings({ groqApiKey: key.trim(), groqModel: model.trim() });
            setStatus({ ok: true, text: msg });
          } catch (e) { setStatus({ ok: false, text: (e as Error).message }); }
          finally { setBusy(false); }
        }}>{busy ? 'Testing…' : 'Test connection'}</button>
        {s.groqApiKey && <button className="btn ghost sm" onClick={async () => { await updateSettings({ groqApiKey: '', aiEnabled: false }); setKey(''); toast('Key removed'); }}>Remove key</button>}
      </div>
      {status && <div className={`notice ${status.ok ? 'good' : 'bad'}`}>{status.text}</div>}
    </section>
  );
}

function WebsiteSettings() {
  const { settings: s, updateSettings } = useApp();
  const toast = useToast();
  const [url, setUrl] = useState(s.websiteUrl || APP.websiteUrl);
  useEffect(() => { setUrl(s.websiteUrl || APP.websiteUrl); }, [s.websiteUrl]);
  const valid = !!safeWebsiteUrl(url);
  return (
    <section className="section panel">
      <h3>Website</h3>
      <p className="muted small">The <strong>Website</strong> button and {APP.assistant}’s menu open this link. The website can also detect {APP.assistant}, open it and send messages to check, if its address is listed in <code>solace.config.json</code> (extension ID <code>{APP.extensionId}</code>).</p>
      <label className="field"><span className="lbl">Website link</span>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-site.example/" />
        {!valid && <span className="xs" style={{ color: '#ffb0b3' }}>Enter a full link starting with https:// or http://</span>}
      </label>
      <div className="row">
        <button className="btn sm primary" disabled={!valid} onClick={async () => { await updateSettings({ websiteUrl: url.trim() === APP.websiteUrl ? '' : url.trim() }); toast('Website link saved'); }}>Save</button>
        <button className="btn sm" disabled={!valid} onClick={() => openWebsite(url)}>Open</button>
        {s.websiteUrl && <button className="btn ghost sm" onClick={async () => { await updateSettings({ websiteUrl: '' }); toast('Reset to the default link'); }}>Reset</button>}
      </div>
    </section>
  );
}
