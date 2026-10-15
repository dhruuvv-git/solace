export default function Navbar({ onSignIn }) {
  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px',
        background: 'rgba(7, 5, 11, 0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Brand with 4th screenshot robot logo */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => scrollTo('hero')}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 0 16px rgba(168, 85, 247, 0.25)',
          }}
        >
          <img
            src="/solace-robot.png"
            alt="Solace"
            style={{
              width: 30,
              height: 30,
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
        <span style={{
          fontWeight: 900, color: '#ffffff', fontSize: 19,
          letterSpacing: '-0.02em', fontFamily: 'inherit',
        }}>
          Solace
        </span>
      </div>

      {/* Nav links matching dimensions from Screenshot 3 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        {[
          { num: '01', label: 'OVERVIEW', id: 'hero' },
          { num: '02', label: 'THE THREAT', id: 'not-alone' },
          { num: '03', label: 'RESPONSE PROTOCOL', id: 'solution' },
        ].map(link => (
          <button
            key={link.id}
            onClick={() => scrollTo(link.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: '#a78bfa',
              fontFamily: 'monospace', letterSpacing: '0.14em',
              transition: 'color 0.2s',
              padding: '6px 0',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#a78bfa'; }}
          >
            <span style={{ color: '#d946ef', marginRight: 6 }}>{link.num} //</span>
            {link.label}
          </button>
        ))}
      </div>

      {/* Sign In Button — Sleek pill matching Screenshot 3 */}
      <button
        onClick={onSignIn}
        style={{
          padding: '10px 24px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 700,
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #9b6ce8 0%, #7c3aed 50%, #5b21b6 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.18) inset, 0 1px 0 rgba(255,255,255,0.22) inset, 0 6px 20px rgba(124,58,237,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          fontFamily: 'inherit',
          letterSpacing: '0.02em',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
      >
        Sign In
      </button>
    </nav>
  );
}
