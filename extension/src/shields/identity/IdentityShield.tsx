/** Shield 3 - Is it really them? Lookalike usernames, reused photos, account risk. */
import { useEffect, useState } from 'react';
import { compareUsernames, profileRisk } from '../../engine/identity-analysis';
import { hashImageBytes } from '../../engine/image-client';
import { hammingDistance, isMatch } from '../../engine/known-fakes';
import { fmt } from '../../engine/math';
import { IMAGE } from '../../shared/constants';
import { addHistory, addRef, deleteRef, listRefs, type RefEntry } from '../../shared/local-data';
import type { ProfileInputs, ProfileRiskResult, UsernameSimilarity } from '../../shared/types';
import type { SourceInfo } from '../../shared/messaging';
import { useApp } from '../../ui/app-context';
import { DiffView, ErrorNote, EvidenceScale, FileDrop, Icon, readFileBytes, useToast } from '../../ui/components';
import { SourceLine, useObjectUrl } from '../shared';

type Tri = 'unknown' | 'yes' | 'no';
const tri = (v: Tri) => (v === 'unknown' ? null : v === 'yes');
const numOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) || Number(s) < 0 ? null : Number(s));

export function IdentityShield() {
  const { takeIncoming, incoming } = useApp();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [sim, setSim] = useState<UsernameSimilarity | null>(null);

  // profile form
  const [username, setUsername] = useState('');
  const [followers, setFollowers] = useState('');
  const [following, setFollowing] = useState('');
  const [posts, setPosts] = useState('');
  const [isNew, setIsNew] = useState<Tri>('unknown');
  const [money, setMoney] = useState<Tri>('unknown');
  const [observed, setObserved] = useState<Set<string>>(new Set());
  const [risk, setRisk] = useState<ProfileRiskResult | null>(null);
  const [source, setSource] = useState<SourceInfo | undefined>();
  const [photoA, setPhotoA] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const [photoAError, setPhotoAError] = useState<string | null>(null);

  useEffect(() => {
    const inc = takeIncoming('identity');
    if (!inc) return;
    const p = inc.profile;
    setUsername(p.username); setA(p.username);
    setFollowers(p.followers != null ? String(p.followers) : '');
    setFollowing(p.following != null ? String(p.following) : '');
    setPosts(p.posts != null ? String(p.posts) : '');
    setObserved(new Set([p.followers != null && 'followers', p.following != null && 'following', p.posts != null && 'posts'].filter(Boolean) as string[]));
    setSource(inc.source);
    setRisk(null);
    if (inc.imageBytes) setPhotoA({ bytes: inc.imageBytes, name: `${p.username} profile photo` });
    setPhotoAError(inc.imageError ?? null);
  }, [incoming, takeIncoming]);

  const runRisk = () => {
    const inp: ProfileInputs = {
      username, newAccount: tri(isNew), followers: numOrNull(followers), following: numOrNull(following), posts: numOrNull(posts), asksMoneyOrOtp: tri(money),
      source: {
        followers: observed.has('followers') ? 'observed' : 'user', following: observed.has('following') ? 'observed' : 'user',
        posts: observed.has('posts') ? 'observed' : 'user', newAccount: 'user', asksMoneyOrOtp: 'user',
      },
    };
    const r = profileRisk(inp);
    setRisk(r);
    addHistory({ shield: 'identity', title: username ? `Profile @${username.replace(/^@/, '')}` : 'Profile review', outcome: `${r.level} risk (p = ${fmt(r.p)})`, tone: r.level === 'high' ? 'bad' : r.level === 'medium' ? 'warn' : 'good' });
  };

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h2>Is it really them?</h2>
        <p>Spot lookalike usernames, reused profile photos and accounts that behave like scams. These are warning signs, not proof — confirm through a channel you already trust.</p>
      </div>

      <section className="section panel">
        <h3>Compare two usernames</h3>
        <div className="stack">
          <label className="field"><span className="lbl">The real account you know</span><input type="text" value={a} maxLength={60} onChange={(e) => { setA(e.target.value); setSim(null); }} placeholder="rahul_sharma" /></label>
          <label className="field"><span className="lbl">The account that contacted you</span><input type="text" value={b} maxLength={60} onChange={(e) => { setB(e.target.value); setSim(null); }} placeholder="rahul_sharrna" /></label>
          <div className="row"><button className="btn primary" disabled={!a.trim() || !b.trim()} onClick={() => {
            const r = compareUsernames(a, b); setSim(r);
            addHistory({ shield: 'identity', title: 'Username comparison', outcome: r.flagged ? `Lookalike (${Math.round(r.sim * 100)}%)` : r.identical ? 'Identical' : `Different (${Math.round(r.sim * 100)}%)`, tone: r.flagged ? 'warn' : 'neutral' });
          }}>Compare</button></div>
        </div>
        {sim && (
          <div className={`verdict ${sim.flagged ? 'warn' : 'neutral'}`}>
            <div className="verdict-title">{sim.flagged ? 'Possible lookalike' : sim.identical ? 'Same username' : 'Not a close lookalike'}</div>
            <p>{sim.explanation}</p>
            <dl className="kv">
              <dt>Original</dt><dd><DiffView ops={sim.diff} side="a" /></dd>
              <dt>Other</dt><dd><DiffView ops={sim.diff} side="b" /></dd>
              <dt>Normalised</dt><dd><code>{sim.normA}</code> vs <code>{sim.normB}</code></dd>
              <dt>Similarity</dt><dd className="num">1 − {sim.distance} / {Math.max([...sim.normA].length, [...sim.normB].length)} = {fmt(sim.sim)} (flag at ≥ {sim.threshold})</dd>
            </dl>
            {sim.substitutions.length > 0 && <p className="xs muted">Undone before comparing: {sim.substitutions.join('; ')}.</p>}
          </div>
        )}
      </section>

      <PhotoCompare initialA={photoA} initialAError={photoAError} />

      <section className="section panel">
        <h3>Review an account</h3>
        <SourceLine source={source} />
        <p className="muted small">Fill in only what you can see. Leave anything unknown blank — it will be marked unavailable, not guessed.</p>
        <label className="field"><span className="lbl">Username</span><input type="text" value={username} maxLength={60} onChange={(e) => setUsername(e.target.value)} /></label>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {([['Followers', followers, setFollowers, 'followers'], ['Following', following, setFollowing, 'following'], ['Posts', posts, setPosts, 'posts']] as const).map(([lbl, v, set, key]) => (
            <label key={lbl} className="field" style={{ flex: '1 1 90px' }}><span className="lbl">{lbl}</span>
              <input type="number" min={0} value={v} onChange={(e) => { set(e.target.value); setObserved((o) => { const n = new Set(o); n.delete(key); return n; }); }} />
              {observed.has(key) && <span className="xs">Read from the page</span>}
            </label>
          ))}
        </div>
        <TriChoice label="Does the account look newly created?" value={isNew} onChange={setIsNew} />
        <TriChoice label="Has it asked you for money, a password or an OTP?" value={money} onChange={setMoney} />
        <div className="row"><button className="btn primary" onClick={runRisk}>Assess risk</button></div>
        {risk && (
          <div className="stack">
            <div className={`verdict ${risk.level === 'high' ? 'bad' : risk.level === 'medium' ? 'warn' : 'good'}`}>
              <div className="verdict-title">{risk.level === 'high' ? 'High risk' : risk.level === 'medium' ? 'Some risk' : 'Low risk'}</div>
              <p>{risk.explanation}</p>
              <p className="small muted num">p = σ({fmt(risk.logit)}) = {fmt(risk.p)}</p>
            </div>
            <EvidenceScale max={3} leftLabel="" rightLabel="Riskier" rows={[
              { id: 'b0', name: 'Starting point β₀', value: -2.2 },
              ...risk.features.map((f) => ({ id: f.id, name: f.label, sub: `${f.display}${f.source && f.available ? ` (${f.source === 'observed' ? 'seen on page' : 'you entered'})` : ''}`, value: f.available ? f.contribution : null })),
            ]} />
            <p className="xs muted">{risk.missingPolicy}</p>
            <div className="subpanel">
              <h4>Safety steps</h4>
              <ul className="plain small do">
                <li>Contact the real person through a number or account you already had.</li>
                <li>Never share OTPs, PINs or passwords — no genuine friend or bank needs them.</li>
                <li>Report impersonation using the platform’s report option.</li>
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TriChoice({ label, value, onChange }: { label: string; value: Tri; onChange: (v: Tri) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>{label}</legend>
      <div className="row">{(['yes', 'no', 'unknown'] as Tri[]).map((t) => (
        <button key={t} type="button" aria-pressed={value === t} className={`btn sm ${value === t ? 'primary' : ''}`} onClick={() => onChange(t)}>{t === 'unknown' ? 'Don’t know' : t === 'yes' ? 'Yes' : 'No'}</button>
      ))}</div>
    </fieldset>
  );
}

function PhotoCompare({ initialA, initialAError }: { initialA: { bytes: Uint8Array; name: string } | null; initialAError: string | null }) {
  const toast = useToast();
  const { refreshKey, bump } = useApp();
  const [A, setA] = useState<{ bytes: Uint8Array; name: string; hash?: string } | null>(null);
  const [B, setB] = useState<{ bytes: Uint8Array; name: string; hash?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RefEntry[]>([]);
  const [label, setLabel] = useState('');
  const urlA = useObjectUrl(A?.bytes ?? null), urlB = useObjectUrl(B?.bytes ?? null);

  useEffect(() => { if (initialA) void load(initialA.bytes, initialA.name, setA); }, [initialA]);
  useEffect(() => { listRefs('profile-photo').then(setSaved).catch(() => setSaved([])); }, [refreshKey]);

  async function load(bytes: Uint8Array, name: string, set: typeof setA) {
    setError(null);
    try { set({ bytes, name, hash: await hashImageBytes(bytes) }); }
    catch (e) { setError((e as Error).message); }
  }

  const d = A?.hash && B?.hash ? hammingDistance(A.hash, B.hash) : null;
  const savedMatches = A?.hash ? saved.map((s) => ({ s, d: hammingDistance(A.hash!, s.hash) })).filter((x) => isMatch(x.d)).sort((x, y) => x.d - y.d) : [];

  return (
    <section className="section panel">
      <h3>Is this profile photo reused?</h3>
      <p className="muted small">Compares two pictures with a 64-bit fingerprint (dHash). Near-duplicates (distance ≤ {IMAGE.dhash.matchDistance}) suggest the same photo was copied. It does not recognise faces and does not search the internet.</p>
      {initialAError && <ErrorNote message={initialAError} />}
      {error && <ErrorNote message={error} />}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {([['Suspicious account’s photo', A, setA, urlA], ['Real person’s photo', B, setB, urlB]] as const).map(([lbl, v, set, url]) => (
          <div key={lbl} className="stack" style={{ flex: '1 1 150px', gap: 6 }}>
            <strong className="small">{lbl}</strong>
            {v && url ? (
              <>
                <img src={url} alt={lbl} className="thumb" style={{ maxHeight: 140 }} />
                <code className="xs">{v.hash}</code>
                <button className="btn ghost sm" onClick={() => set(null)}>Remove</button>
              </>
            ) : (
              <FileDrop accept="image/*" label="Choose photo" hint="or drop it here" onFile={async (f) => load(await readFileBytes(f), f.name, set)} />
            )}
          </div>
        ))}
      </div>
      {d !== null && (
        <div className={`verdict ${isMatch(d) ? 'warn' : 'neutral'}`}>
          <div className="verdict-title">{isMatch(d) ? 'Same or near-identical photo' : 'Different photos'}</div>
          <p className="num">Hamming distance d = popcount(h₁ ⊕ h₂) = {d} of 64 bits ({isMatch(d) ? `≤ ${IMAGE.dhash.matchDistance}: match` : `> ${IMAGE.dhash.matchDistance}: no match`}).</p>
          <p className="small">{isMatch(d) ? 'A copied photo is a common impersonation trick — but the same photo can also be shared legitimately. It does not verify identity.' : 'Not a copy, but a different photo does not prove the account is genuine.'}</p>
        </div>
      )}
      {A?.hash && (
        <div className="stack">
          {savedMatches.length > 0 && <div className="notice warn"><strong>Matches your saved photos:</strong> {savedMatches.map((m) => `${m.s.label} (d = ${m.d})`).join(', ')}</div>}
          <div className="row">
            <input type="text" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Priya’s real photo" style={{ flex: '1 1 160px', width: 'auto' }} />
            <button className="btn sm" onClick={async () => {
              try { await addRef(label || A.name, A.hash!, 'profile-photo'); bump(); setLabel(''); toast('Photo fingerprint saved on this device'); }
              catch (e) { toast((e as Error).message, 'bad'); }
            }}>Save first photo’s fingerprint</button>
          </div>
        </div>
      )}
      {saved.length > 0 && (
        <details className="more"><summary>Saved photo fingerprints ({saved.length})</summary>
          <div className="list">{saved.map((s) => (
            <div key={s.id} className="list-item"><div className="grow small">{s.label}<br /><code className="xs">{s.hash}</code></div>
              <button className="btn ghost sm" aria-label={`Delete ${s.label}`} onClick={async () => { await deleteRef(s.id); bump(); }}><Icon name="trash" size={14} /></button></div>
          ))}</div>
        </details>
      )}
    </section>
  );
}
