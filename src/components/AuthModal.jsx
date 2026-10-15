import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../lib/auth';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;

/** Same checks as the server (server/app.mjs → validateSignup); the server stays the authority. */
function validate(isSignUp, f) {
  const e = {};
  if (isSignUp && !f.name.trim()) e.name = 'Enter your name or a nickname.';
  if (!f.email.trim()) e.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'That email address doesn’t look right.';
  if (!f.password) e.password = isSignUp ? 'Choose a password.' : 'Enter your password.';
  else if (isSignUp && f.password.length < 8) e.password = 'Use at least 8 characters.';
  else if (isSignUp && (!/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password))) e.password = 'Use at least one letter and one number.';
  if (isSignUp && f.password && f.confirm !== f.password) e.confirm = 'Passwords don’t match.';
  return e;
}

function Field({ id, label, error, children, hint }) {
  return (
    <div className="sol-field">
      <label className="sol-label" htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="sol-error" id={`${id}-err`} role="alert">{error}</span> : hint ? <span className="sol-hint" id={`${id}-hint`}>{hint}</span> : null}
    </div>
  );
}

export default function AuthModal({ mode = 'signup', onModeChange, onClose, onSuccess, notice }) {
  const auth = useAuth();
  const isSignUp = mode === 'signup';
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const cardRef = useRef(null);
  const firstRef = useRef(null);

  useEffect(() => { setErrors({}); setFormError(null); firstRef.current?.focus(); }, [mode]);
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
      if (e.key === 'Tab' && cardRef.current) { // keep focus inside the dialog
        const els = cardRef.current.querySelectorAll('button, input, a[href]');
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [onClose, busy]);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const v = validate(isSignUp, f);
    setErrors(v);
    if (Object.keys(v).length) { cardRef.current?.querySelector(`#auth-${Object.keys(v)[0]}`)?.focus(); return; }
    setBusy(true);
    try {
      const user = isSignUp ? await auth.signUp(f.name.trim(), f.email.trim(), f.password) : await auth.signIn(f.email.trim(), f.password);
      onSuccess?.(user, { created: isSignUp });
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      if (err.code === 'email_taken') setFormError(<>An account with this email already exists. <button type="button" className="sol-btn sol-btn--link" onClick={() => onModeChange?.('signin')}>Log in instead</button></>);
      else setFormError(err.message);
      setF((x) => ({ ...x, password: err.code === 'invalid_credentials' ? '' : x.password, confirm: '' }));
    } finally {
      setBusy(false);
    }
  };

  const inputProps = (k) => ({ id: `auth-${k}`, className: 'sol-input', value: f[k], onChange: set(k), 'aria-invalid': errors[k] ? 'true' : undefined, 'aria-describedby': errors[k] ? `auth-${k}-err` : undefined, disabled: busy });

  return (
    <div className="sol-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div ref={cardRef} className="sol-auth-card sol-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button
          type="button" onClick={onClose} disabled={busy} aria-label="Close"
          style={{ position: 'absolute', top: 24, right: 24, width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ede9fe', border: 'none', cursor: 'pointer', color: '#7c3aed', transition: 'background 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ddd6fe'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#ede9fe'; }}
        >
          <X size={22} />
        </button>

        <div style={{ marginBottom: 36, paddingRight: 56 }}>
          <h2 id="auth-title" className="sol-auth-title" style={{ fontSize: 56, fontWeight: 900, color: '#0f0a1a', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 12 }}>
            {isSignUp ? 'Sign Up' : 'Log In'}
          </h2>
          <p style={{ fontSize: 16, color: '#6b7280', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
            {isSignUp ? 'Join Solace Workspace' : 'Welcome back to Solace'}
          </p>
        </div>

        {notice && <div className="sol-alert sol-alert--info" style={{ marginBottom: 20 }}>{notice}</div>}

        <form onSubmit={submit} noValidate className="sol-auth-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSignUp && (
              <Field id="auth-name" label="Name" error={errors.name}>
                <input ref={firstRef} type="text" autoComplete="name" placeholder="Full name or nickname" maxLength={80} {...inputProps('name')} />
              </Field>
            )}
            <Field id="auth-email" label="Email" error={errors.email}>
              <input ref={isSignUp ? undefined : firstRef} type="email" autoComplete="email" inputMode="email" placeholder="Email address" maxLength={254} {...inputProps('email')} />
            </Field>
            <Field id="auth-password" label="Password" error={errors.password} hint={isSignUp ? 'At least 8 characters, with a letter and a number.' : undefined}>
              <div className="sol-pass">
                <input type={show ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="Password" maxLength={128} {...inputProps('password')} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
              </div>
            </Field>
            {isSignUp && (
              <Field id="auth-confirm" label="Confirm password" error={errors.confirm}>
                <input type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm password" maxLength={128} {...inputProps('confirm')} />
              </Field>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 24 }}>
            {formError && <div className="sol-alert sol-alert--error" role="alert">{formError}</div>}
            <button type="submit" className="sol-btn sol-btn--primary sol-btn--lg sol-btn--block" disabled={busy} aria-busy={busy}>
              {busy && <span className="sol-spinner" aria-hidden="true" />}
              {busy ? (isSignUp ? 'Creating your account…' : 'Logging in…') : isSignUp ? 'Sign Up' : 'Log In'}
            </button>

            <div style={{ textAlign: 'center', fontSize: 15, color: '#6b7280', fontWeight: 500 }}>
              {isSignUp ? 'Already have an account? ' : 'Don’t have an account? '}
              <button type="button" className="sol-btn sol-btn--link" style={{ fontSize: 15 }} disabled={busy} onClick={() => onModeChange?.(isSignUp ? 'signin' : 'signup')}>
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, height: 1, background: '#ede9fe' }} />
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em' }}>ONE ACCOUNT</span>
              <div style={{ flex: 1, height: 1, background: '#ede9fe' }} />
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: '#4b5563', lineHeight: 1.55 }}>
              <li style={{ display: 'flex', gap: 10 }}><span aria-hidden="true" style={{ color: '#7c3aed', fontWeight: 900 }}>01</span>Same login for this workspace and the Mimi browser extension.</li>
              <li style={{ display: 'flex', gap: 10 }}><span aria-hidden="true" style={{ color: '#7c3aed', fontWeight: 900 }}>02</span>Evidence files are fingerprinted in your browser and never uploaded.</li>
              <li style={{ display: 'flex', gap: 10 }}><span aria-hidden="true" style={{ color: '#7c3aed', fontWeight: 900 }}>03</span>Your password is stored only as a salted scrypt hash.</li>
            </ul>
          </div>
        </form>

        <div className="sol-auth-foot" style={{ marginTop: 36, paddingTop: 22, borderTop: '1px solid #ede9fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontFamily: 'monospace', color: '#9ca3af', letterSpacing: '0.04em' }}>
          <span>Local hashing · No media uploads</span>
          <span>A nickname is fine — no real name needed</span>
        </div>
      </div>
    </div>
  );
}
