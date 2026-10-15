import { useState } from 'react';
import { FadeUp } from './FadeUp';
import TextType from './TextType';

const steps = [
  {
    step: '01',
    header: 'Triage & Countdown',
    summary: "Instant categorization & live tracker for India's 2-hour to 36-hour statutory platform takedown deadlines.",
    accent: '#a855f7',
    accentBg: 'rgba(168,85,247,0.1)',
  },
  {
    step: '02',
    header: 'Evidence Vault',
    summary: 'Local SHA-256 seal and timestamp. Zero cloud uploads. Court-admissible chain of custody.',
    accent: '#3b82f6',
    accentBg: 'rgba(59,130,246,0.1)',
  },
  {
    step: '03',
    header: 'Aftercare',
    summary: 'Compassionate recovery support, guided panic de-escalation with Mimi, and anonymous peer listening circles.',
    accent: '#f59e0b',
    accentBg: 'rgba(245,158,11,0.1)',
  },
  {
    step: '04',
    header: '1-Click Notice',
    summary: 'Pre-drafted formal legal notice for platform Grievance Officers & GAC appeals.',
    accent: '#10b981',
    accentBg: 'rgba(16,185,129,0.1)',
  },
  {
    step: '05',
    header: 'Mimi Companion',
    summary: 'Smart browser protection, automated evidence capture, and an empathetic voice whenever you need support.',
    accent: '#ec4899',
    accentBg: 'rgba(236,72,153,0.1)',
    isMimi: true,
  },
];

export default function SolutionSection({ onGetStarted }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  return (
    <section
      id="solution"
      className="sol-section"
      style={{
        padding: '140px 80px 160px',
        background: 'linear-gradient(180deg, #f5f0ff 0%, #faf8ff 50%, #f0ebff 100%)',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 96 }}>
          <FadeUp delay={0}>
            <span style={{
              display: 'inline-block',
              fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#7c3aed',
              padding: '8px 20px', borderRadius: 999,
              background: '#ede9fe',
              border: '1px solid #ddd6fe',
              marginBottom: 36,
            }}>
              Response Protocol
            </span>
          </FadeUp>

          <FadeUp delay={80}>
            <h2 style={{
              fontSize: 'clamp(40px, 5vw, 64px)',
              fontWeight: 900,
              color: '#0f0a1a',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              marginBottom: 24,
            }}>
              Reach out.{' '}
              <span style={{
                backgroundImage: 'linear-gradient(135deg, #7c3aed, #c026d3)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                display: 'inline-block',
              }}>
                <TextType
                  as="span"
                  text={[
                    'We guide every step.',
                    'We secure evidence locally.',
                    'We enforce statutory takedowns.'
                  ]}
                  typingSpeed={65}
                  pauseDuration={2200}
                  deletingSpeed={35}
                  loop={true}
                  showCursor={true}
                  cursorCharacter="|"
                  cursorClassName="text-purple-600 font-normal"
                />
              </span>
            </h2>
          </FadeUp>

          <FadeUp delay={160}>
            <p style={{
              fontSize: 20,
              color: '#6b7280',
              maxWidth: 560,
              margin: '0 auto',
              lineHeight: 1.7,
              fontWeight: 400,
            }}>
              A privacy-first response workspace for the first 2 hours after discovery.
            </p>
          </FadeUp>
        </div>

        {/* Step Cards */}
        <div className="sol-grid-5" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 20,
          marginBottom: 100,
        }}>
          {steps.map((item, idx) => (
            <FadeUp key={item.step} delay={200 + idx * 70}>
              <div
                style={{
                  padding: '36px 26px',
                  borderRadius: 24,
                  background: '#ffffff',
                  border: item.isMimi ? '1px solid #ddd6fe' : '1px solid #ede9fe',
                  boxShadow: item.isMimi ? '0 4px 28px rgba(168,85,247,0.12)' : '0 4px 24px rgba(124,58,237,0.07)',
                  transition: 'transform 0.25s, box-shadow 0.25s',
                  cursor: 'default',
                  height: '100%',
                  minHeight: 280,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
                onMouseEnter={e => {
                  setHoveredIdx(idx);
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(124,58,237,0.14)';
                }}
                onMouseLeave={e => {
                  setHoveredIdx(null);
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = item.isMimi ? '0 4px 28px rgba(168,85,247,0.12)' : '0 4px 24px rgba(124,58,237,0.07)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 34, fontWeight: 900,
                    color: '#ddd6fe', lineHeight: 1,
                  }}>
                    {item.step}
                  </span>
                  {item.isMimi ? (
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: 'rgba(168, 85, 247, 0.12)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        display: 'grid',
                        placeItems: 'center',
                        boxShadow: '0 0 16px rgba(168, 85, 247, 0.25)',
                        transition: 'transform 0.25s ease',
                        transform: hoveredIdx === idx ? 'scale(1.12)' : 'scale(1)',
                      }}
                      title="Mimi Companion"
                    >
                      <img
                        src={hoveredIdx === idx ? '/robot-jump.gif' : '/solace-robot.png'}
                        alt="Mimi"
                        style={{ width: 26, height: 26, objectFit: 'contain' }}
                      />
                    </div>
                  ) : (
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: item.accent,
                      boxShadow: `0 0 12px ${item.accent}`,
                      flexShrink: 0,
                    }} />
                  )}
                </div>

                <h3 style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: '#1a1028',
                  letterSpacing: '-0.01em',
                }}>
                  {item.header}
                </h3>

                <p style={{
                  fontSize: 14,
                  color: '#6b7280',
                  lineHeight: 1.65,
                  fontWeight: 400,
                }}>
                  {item.summary}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', paddingTop: 20 }}>
          <FadeUp delay={500}>
            <button
              className="sol-cta-big"
              onClick={onGetStarted}
              style={{
                padding: '24px 72px',
                borderRadius: 999,
                fontSize: 20,
                fontWeight: 800,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.01em',
                background: 'linear-gradient(160deg, #9b6ce8 0%, #7c3aed 50%, #5b21b6 100%)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.15) inset, 0 2px 0 rgba(255,255,255,0.2) inset, 0 20px 60px rgba(124,58,237,0.45), 0 8px 24px rgba(0,0,0,0.15)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                marginBottom: 20,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
            >
              Start your case — it&apos;s free
            </button>
            <p style={{
              marginTop: 20,
              fontSize: 14,
              color: '#9ca3af',
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}>
              Zero cloud uploads · Anonymous option · Client-side encryption
            </p>
          </FadeUp>
        </div>

      </div>
    </section>
  );
}
