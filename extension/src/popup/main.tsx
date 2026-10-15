import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LEXICON } from '../engine/data/lexicon';
import { analyzeMisinformation } from '../engine/misinformation';
import { analyzeThreat } from '../engine/threat-analysis';
import { analyzeToxicity } from '../engine/toxicity';
import type { PanelJob, PingReply } from '../shared/messaging';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '../shared/settings';
import { Icon } from '../ui/components';
import { openWebsite } from '../ui/env';
import { APP } from '../shared/app-config';
import '../ui/theme.css';
import { AccountCard } from '../account/AccountUI';

async function openPanel(job?: PanelJob) {
  const win = await chrome.windows.getCurrent();
  if (job) await chrome.storage.session.set({ pendingJob: job });
  await chrome.sidePanel.open({ windowId: win.id! });
  window.close();
}

function Popup() {
  const [status, setStatus] = useState<{ label: string; reply: PingReply | null } | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let label = 'this page';
      try { const h = new URL(tab?.url ?? '').hostname; if (h === 'web.whatsapp.com') label = 'WhatsApp Web'; else if (h.endsWith('instagram.com')) label = 'Instagram'; } catch { /* no permission for url */ }
      let reply: PingReply | null = null;
      if (tab?.id) { try { reply = await chrome.tabs.sendMessage(tab.id, { type: 'TL_PING' }); } catch { reply = null; } }
      setStatus({ label, reply });
    })();
  }, []);

  const toggle = async (k: 'abuseShieldBlur' | 'composerWarnings') => setSettings(await saveSettings({ [k]: !settings[k] }));

  return (
    <div className="stack" style={{ width: 340, padding: 14 }}>
      <div className="row-between">
        <strong className="row" style={{ fontSize: 17 }}><img className="brand-logo" src="icons/icon-128.png" alt="" width={28} height={28} />Mimi</strong>
        <span className="badge good">On-device</span>
      </div>
      <p className="small muted">
        {status === null ? 'Checking this page…' : status.reply ? `Active on ${status.label}.` : `Page tools are not running on ${status.label}. Right-click text or images to check them${status.label !== 'this page' ? ', or reload the page' : ''}.`}
      </p>
      <button className="btn primary block" onClick={() => openPanel().catch((e) => setError((e as Error).message))}><Icon name="panel" size={16} />Open Mimi</button>
      <button className="btn block" onClick={async () => { const s = await getSettings(); if (!openWebsite(s.websiteUrl || APP.websiteUrl)) setError('Set the website link in Settings'); else window.close(); }}>Open website</button>
      <label className="field"><span className="lbl">Quick check</span>
        <textarea rows={3} value={text} onChange={(e) => { setText(e.target.value); setSummary(null); }} placeholder="Paste a message" />
      </label>
      <div className="row">
        <button className="btn sm" disabled={!text.trim()} onClick={() => {
          const m = analyzeMisinformation(text), t = analyzeToxicity(text, [...LEXICON, ...settings.customLexicon]), th = analyzeThreat(text);
          setSummary([`Hoax-style: ${m.level}`, `Hurtful: ${t.level}`, `Threat: ${th.primary ? `${th.level} (${th.risk}/25)` : 'none found'}`]);
        }}>Check</button>
        <button className="btn sm" disabled={!text.trim()} onClick={() => openPanel({ id: `p${Date.now()}`, createdAt: Date.now(), kind: 'text', mode: 'safety', text, source: { url: 'manual-entry', platform: 'web' } }).catch((e) => setError((e as Error).message))}>Open in Am I safe?</button>
      </div>
      {summary && <ul className="plain small">{summary.map((s) => <li key={s}>{s}</li>)}</ul>}
      {summary?.some((s) => s.includes('emergency')) && <a className="btn danger block" href="tel:112">Call 112</a>}
      <AccountCard compact />
      <hr className="divider" />
      <label className="check"><input type="checkbox" checked={settings.abuseShieldBlur} onChange={() => toggle('abuseShieldBlur')} />Blur hurtful messages on WhatsApp/Instagram</label>
      <label className="check"><input type="checkbox" checked={settings.composerWarnings} onChange={() => toggle('composerWarnings')} />Warn while I type</label>
      {error && <p className="notice bad small">Could not open the panel: {error}. Use the side panel button in Chrome’s toolbar.</p>}
      <p className="xs muted">In danger now? Call <a href="tel:112">112</a>. Cyber crime: <a href="tel:1930">1930</a>.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
