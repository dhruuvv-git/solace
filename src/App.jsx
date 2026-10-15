import { useState } from 'react';
import AuthModal from './components/AuthModal';
import HeroSection from './components/HeroSection';
import Navbar from './components/Navbar';
import NotAloneSection from './components/NotAloneSection';
import SolutionSection from './components/SolutionSection';
import DashboardView from './components/DashboardView';
import './index.css';

export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [user, setUser] = useState({ name: 'Survivor' });
  const [authOpen, setAuthOpen] = useState(false);

  const openAuth = () => setAuthOpen(true);
  const closeAuth = () => setAuthOpen(false);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setCurrentView('dashboard');
    setAuthOpen(false);
  };

  const handleLogout = () => {
    setCurrentView('landing');
  };

  if (currentView === 'dashboard') {
    return <DashboardView user={user} onLogout={handleLogout} />;
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", background: '#07050b' }}>
      <Navbar onSignIn={openAuth} />

      <main>
        <HeroSection onGetStarted={openAuth} />
        <NotAloneSection />
        <SolutionSection onGetStarted={openAuth} />
      </main>

      {/* Footer */}
      <footer style={{
        padding: '64px 80px',
        background: '#f0ebff',
        borderTop: '1px solid #ddd6fe',
      }}>
        <div style={{
          maxWidth: 1400, margin: '0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/solace-robot.png"
              alt="Solace"
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            <span style={{ fontWeight: 800, color: '#1a1028', fontSize: 16, letterSpacing: '-0.01em' }}>
              Solace Response Desk
            </span>
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', maxWidth: 480, lineHeight: 1.7, margin: 0 }}>
            Privacy-first incident management for non-consensual synthetic media.
            All hashing performed client-side. Not legal advice.
          </p>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#9ca3af', marginTop: 8 }}>
            Designed for survival & rapid intervention · 2026
          </div>
        </div>
      </footer>

      {authOpen && <AuthModal onClose={closeAuth} onSuccess={handleAuthSuccess} />}
    </div>
  );
}
