import DriftWall from './DriftWall';
import { FadeUp } from './FadeUp';

export default function NotAloneSection() {
  return (
    <section
      id="not-alone"
      className="sol-section"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        padding: '120px 80px',
        background: 'linear-gradient(180deg, #faf7ff 0%, #ffffff 50%, #f5f0ff 100%)',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <div className="sol-grid-2" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 96,
          alignItems: 'center',
        }}>

          {/* Left: Text */}
          <div style={{ paddingLeft: 40 }}>
            <FadeUp delay={0}>
              <span style={{
                display: 'inline-block',
                fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
                letterSpacing: '0.2em', textTransform: 'uppercase',
                color: '#7c3aed',
                padding: '8px 20px', borderRadius: 999,
                background: '#ede9fe',
                border: '1px solid #ddd6fe',
                marginBottom: 40,
              }}>
                The Reality
              </span>
            </FadeUp>

            <FadeUp delay={80}>
              <h2 style={{
                fontSize: 'clamp(56px, 7vw, 96px)',
                fontWeight: 900,
                color: '#0f0a1a',
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                marginBottom: 32,
              }}>
                You are{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #7c3aed, #c026d3, #7c3aed)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  not alone.
                </span>
              </h2>
            </FadeUp>

            <FadeUp delay={160}>
              <p style={{
                fontSize: 20,
                color: '#4b5563',
                lineHeight: 1.8,
                marginBottom: 48,
                maxWidth: 480,
                fontWeight: 400,
              }}>
                India&apos;s amended IT rules mandate emergency 2-hour takedowns.
                We lock cryptographic proof in the first 60 minutes before
                evidence disappears.
              </p>
            </FadeUp>

            <FadeUp delay={240}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {['2-Hour Takedowns', 'SHA-256 Vault', '100% Client-Side'].map(tag => (
                  <span key={tag} style={{
                    padding: '10px 22px', borderRadius: 999,
                    fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: '#6d28d9',
                    background: '#fff',
                    border: '1px solid #ddd6fe',
                    boxShadow: '0 2px 8px rgba(124,58,237,0.08)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </FadeUp>
          </div>

          {/* Right: Visual placeholder (DriftWall will go here) */}
          <div>
            <FadeUp delay={100}>
              <div className="sol-drift" style={{
                height: 600,
                borderRadius: 32,
                background: 'linear-gradient(135deg, #f5f0ff 0%, #ede9fe 50%, #f0f9ff 100%)',
                border: '1px solid #ddd6fe',
                boxShadow: '0 32px 80px rgba(124,58,237,0.1)',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <DriftWall
                  columns={3}
                  tileWidth={260}
                  tileHeight={120}
                  gap={20}
                  radius={18}
                  tilt={10}
                  turn={-8}
                  depth={70}
                  speed={32}
                  lift={48}
                  dim={0.92}
                />
              </div>
            </FadeUp>
          </div>
        </div>
      </div>
    </section>
  );
}
