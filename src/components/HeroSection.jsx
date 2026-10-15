import BlurText from './BlurText';
import Aurora from './Aurora';

export default function HeroSection({ onGetStarted }) {
  return (
    <section
      id="hero"
      className="sol-hero"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '130px 32px 80px',
        background: '#07050b',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glowing color halos matching Screenshot 3 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '15%',
          transform: 'translateY(-50%)',
          width: 500,
          height: 380,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 212, 255, 0.16) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: '15%',
          transform: 'translateY(-50%)',
          width: 520,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Aurora WebGL Background Ribbon from React Bits */}
      <div
        style={{
          position: 'absolute',
          top: '48%',
          left: 0,
          right: 0,
          transform: 'translateY(-50%)',
          height: 650,
          width: '100%',
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
        }}
      >
        <Aurora
          colorStops={['#00d4ff', '#8b5cf6', '#ec4899', '#3b82f6', '#00d4ff']}
          amplitude={1.25}
          blend={0.5}
          height={0.55}
          speed={0.8}
          scale={1.0}
          glow={0.85}
          brightness={1.6}
          layers={3}
          intro={false}
          opacity={1.0}
        />
      </div>

      {/* Main Hero Container — Dimensions calibrated to Screenshot 3 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          maxWidth: 900,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Compact Pill Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 20px',
            borderRadius: 999,
            marginBottom: 36,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 0 24px rgba(168, 85, 247, 0.12)',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#d946ef',
              display: 'inline-block',
              boxShadow: '0 0 10px #d946ef',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.16em',
              color: '#e2e8f0',
              textTransform: 'uppercase',
            }}
          >
            Rapid Response Workspace
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(217, 70, 239, 0.15)',
              color: '#f0abfc',
              border: '1px solid rgba(217, 70, 239, 0.3)',
            }}
          >
            v1.0
          </span>
        </div>

        {/* Main Title: Solace with Screenshot 3 Proportions */}
        <div style={{ marginBottom: 18 }}>
          <BlurText
            text="Solace"
            delay={80}
            animateBy="words"
            direction="top"
            stepDuration={0.4}
            className="hero-title"
          />
        </div>

        {/* Subtitle with highly visible luminous accent */}
        <p
          style={{
            fontSize: 'clamp(22px, 3.2vw, 40px)',
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: 24,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          because you are{' '}
          <span
            style={{
              backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #38bdf8 60%, #00d4ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 900,
              display: 'inline-block',
              filter: 'drop-shadow(0 0 24px rgba(0, 212, 255, 0.75)) drop-shadow(0 4px 12px rgba(0, 0, 0, 0.9))',
            }}
          >
            not alone
          </span>
        </p>

        {/* Decorative soundwave / frequency bars like Screenshot 3 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginBottom: 26,
            opacity: 0.9,
          }}
        >
          {[10, 16, 26, 36, 44, 36, 26, 16, 10].map((h, i) => (
            <span
              key={i}
              style={{
                width: 3,
                height: h,
                borderRadius: 2,
                background: 'linear-gradient(to top, #7c3aed, #e879f9)',
                display: 'inline-block',
              }}
            />
          ))}
        </div>

        {/* Balanced Context Description */}
        <p
          style={{
            fontSize: 'clamp(15px, 1.2vw, 17px)',
            color: '#94a3b8',
            maxWidth: 620,
            margin: '0 auto 40px',
            lineHeight: 1.75,
            fontWeight: 400,
          }}
        >
          The first 60 minutes determine the outcome. Secure cryptographic proof,
          trigger statutory takedown deadlines, and regain control with zero cloud exposure.
        </p>

        {/* CTA Buttons calibrated to Screenshot 3 */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Primary High-Contrast White Pill Button */}
          <button
            onClick={onGetStarted}
            style={{
              padding: '14px 34px',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              color: '#07050b',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.01em',
              background: '#ffffff',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.4) inset, 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 40px rgba(168, 85, 247, 0.25)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow =
                '0 0 0 1px rgba(255,255,255,0.6) inset, 0 6px 28px rgba(255, 255, 255, 0.35), 0 0 50px rgba(168, 85, 247, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow =
                '0 0 0 1px rgba(255,255,255,0.4) inset, 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 40px rgba(168, 85, 247, 0.25)';
            }}
          >
            <span>Get Started</span>
            <span style={{ fontSize: 16 }}>→</span>
          </button>

          {/* Secondary Translucent Pill Button */}
          <button
            onClick={() =>
              document.getElementById('not-alone')?.scrollIntoView({ behavior: 'smooth' })
            }
            style={{
              padding: '14px 34px',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 600,
              color: '#e2e8f0',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              transition: 'transform 0.2s, background 0.2s, border-color 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'monospace',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(217, 70, 239, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
            }}
          >
            <span>Explore The Platform</span>
            <span style={{ fontSize: 14 }}>↓</span>
          </button>
        </div>
      </div>

      {/* Clean Scroll Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          opacity: 0.6,
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            letterSpacing: '0.24em',
            color: '#94a3b8',
            textTransform: 'uppercase',
          }}
        >
          SCROLL
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1 }}>⌄</span>
      </div>

      <style>{`
        .hero-title {
          font-size: clamp(56px, 8.5vw, 115px) !important;
          font-weight: 900 !important;
          color: #ffffff !important;
          letter-spacing: -0.03em !important;
          line-height: 1.0 !important;
          justify-content: center !important;
        }
      `}</style>
    </section>
  );
}
