import { useState } from 'react';
import { X } from 'lucide-react';

export default function AuthModal({ onClose, onSuccess }) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (onSuccess) {
      onSuccess({ name: name.trim() || (isSignUp ? 'Dhruv' : 'Dhruv') });
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'rgba(10, 6, 18, 0.42)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 900,
          borderRadius: 40,
          padding: '64px 72px',
          background: '#ffffff',
          border: '1px solid rgba(221, 214, 254, 0.6)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.18), 0 0 50px rgba(168, 85, 247, 0.08)',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 28, right: 28,
            width: 48, height: 48, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#ede9fe', border: 'none', cursor: 'pointer',
            color: '#7c3aed', transition: 'background 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#ddd6fe'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#ede9fe'; }}
          aria-label="Close"
        >
          <X size={22} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{
            fontSize: 56, fontWeight: 900, color: '#0f0a1a',
            letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 12,
          }}>
            {isSignUp ? 'Sign Up' : 'Log In'}
          </h2>
          <p style={{ fontSize: 17, color: '#6b7280', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
            {isSignUp ? 'Join Solace Workspace' : 'Welcome back to Solace'}
          </p>
        </div>

        {/* Two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'start' }}>

          {/* Left: inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isSignUp && (
              <input
                type="text" placeholder="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{
                  width: '100%', padding: '18px 24px', borderRadius: 16,
                  fontSize: 16, fontWeight: 500, color: '#1a1028',
                  background: 'rgba(255,255,255,0.9)',
                  border: '1.5px solid #ddd6fe',
                  outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 4px rgba(168,85,247,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = '#ddd6fe'; e.target.style.boxShadow = 'none'; }}
              />
            )}
            <input
              type="email" placeholder="Email Address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', padding: '18px 24px', borderRadius: 16,
                fontSize: 16, fontWeight: 500, color: '#1a1028',
                background: 'rgba(255,255,255,0.9)',
                border: '1.5px solid #ddd6fe',
                outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 4px rgba(168,85,247,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = '#ddd6fe'; e.target.style.boxShadow = 'none'; }}
            />
            <input
              type="password" placeholder="Password"
              style={{
                width: '100%', padding: '18px 24px', borderRadius: 16,
                fontSize: 16, fontWeight: 500, color: '#1a1028',
                background: 'rgba(255,255,255,0.9)',
                border: '1.5px solid #ddd6fe',
                outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 4px rgba(168,85,247,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = '#ddd6fe'; e.target.style.boxShadow = 'none'; }}
            />
            {isSignUp && (
              <input
                type="password" placeholder="Confirm Password"
                style={{
                  width: '100%', padding: '18px 24px', borderRadius: 16,
                  fontSize: 16, fontWeight: 500, color: '#1a1028',
                  background: 'rgba(255,255,255,0.9)',
                  border: '1.5px solid #ddd6fe',
                  outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 4px rgba(168,85,247,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = '#ddd6fe'; e.target.style.boxShadow = 'none'; }}
              />
            )}
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Primary button — glossy */}
            <button
              onClick={handleSubmit}
              style={{
                width: '100%', padding: '20px 32px',
                borderRadius: 999, fontSize: 18, fontWeight: 800, color: '#fff',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'linear-gradient(160deg, #9b6ce8 0%, #7c3aed 50%, #5b21b6 100%)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.2) inset, 0 2px 0 rgba(255,255,255,0.25) inset, 0 16px 48px rgba(124,58,237,0.4)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {isSignUp ? 'Sign Up' : 'Log In'}
            </button>

            {/* Switch */}
            <div style={{ textAlign: 'center', fontSize: 15, color: '#6b7280', fontWeight: 500 }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#7c3aed', fontWeight: 700, fontSize: 15,
                  fontFamily: 'inherit', textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, height: 1, background: '#ede9fe' }} />
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#ede9fe' }} />
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={() => handleSubmit()}
              style={{
                width: '100%', padding: '16px 24px', borderRadius: 14,
                fontSize: 15, fontWeight: 700, color: '#374151',
                border: '1.5px solid #ede9fe', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(124,58,237,0.06)',
                transition: 'background 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#faf8ff'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.06)'; }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12.5s.7 2.8 1.9 5.2l3.7-2.9z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 17.4C3.7 21.1 7.5 24 12 24z" />
              </svg>
              {isSignUp ? 'Sign up with Google' : 'Log in with Google'}
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => handleSubmit()}
              style={{
                width: '100%', padding: '16px 24px', borderRadius: 14,
                fontSize: 15, fontWeight: 700, color: '#374151',
                border: '1.5px solid #ede9fe', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(124,58,237,0.06)',
                transition: 'background 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#faf8ff'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.06)'; }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {isSignUp ? 'Sign up with Facebook' : 'Log in with Facebook'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 48, paddingTop: 28,
          borderTop: '1px solid #ede9fe',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, fontFamily: 'monospace', color: '#9ca3af',
          letterSpacing: '0.04em',
        }}>
          <span>End-to-end encrypted · Local hashing</span>
          <span>Anonymous mode available</span>
        </div>
      </div>
    </div>
  );
}
