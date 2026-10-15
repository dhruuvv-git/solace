import { useEffect } from 'react';
import AuthModal from './components/AuthModal';
import HeroSection from './components/HeroSection';
import Navbar from './components/Navbar';
import NotAloneSection from './components/NotAloneSection';
import SolutionSection from './components/SolutionSection';
import DashboardView from './components/DashboardView';
import OnboardingView from './components/OnboardingView';
import { ToastProvider, useToast } from './components/Toaster';
import { AuthProvider, useAuth } from './lib/auth';
import { navigate, safeNext, useRoute } from './lib/router';
import { Mimi, useMimiStatus } from './lib/mimi';
import './index.css';

const DASH_TABS = ['overview', 'vault', 'deadlines', 'report', 'crisis', 'mimi', 'account'];

function Loading({ label = 'Opening Solace' }) {
  return (
    <div className="sol-loading" role="status" aria-live="polite">
      <div><img src="/solace-robot.png" alt="" />{label}…</div>
    </div>
  );
}

function Landing({ authMode, next, notice }) {
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn';
  const getStarted = () => (signedIn ? navigate(user.onboarding?.completed ? '/dashboard' : '/onboarding') : navigate('/signup'));
  const toast = useToast();

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", background: '#07050b' }}>
      <Navbar onSignIn={() => navigate('/signin')} onDashboard={() => navigate('/dashboard')} user={signedIn ? user : null} />
      <main>
        <HeroSection onGetStarted={getStarted} />
        <NotAloneSection />
        <SolutionSection onGetStarted={getStarted} />
      </main>

      <footer className="sol-footer" style={{ padding: '64px 80px', background: '#f0ebff', borderTop: '1px solid #ddd6fe' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/solace-robot.png" alt="Solace" style={{ width: 24, height: 24, objectFit: 'contain' }} />
            <span style={{ fontWeight: 800, color: '#1a1028', fontSize: 16, letterSpacing: '-0.01em' }}>Solace Response Desk</span>
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', maxWidth: 480, lineHeight: 1.7, margin: 0 }}>
            Privacy-first incident management for non-consensual synthetic media.
            All hashing performed client-side. Not legal advice.
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
            <a href="#/signup" style={{ color: '#7c3aed' }}>Create account</a>
            <a href="#/signin" style={{ color: '#7c3aed' }}>Sign in</a>
            <a href="/downloads/solace-extension.zip" download style={{ color: '#7c3aed' }}>Download Mimi for Chrome</a>
            <a href="tel:112" style={{ color: '#be123c' }}>In danger? Call 112</a>
          </div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#9ca3af', marginTop: 8 }}>Designed for survival &amp; rapid intervention · 2026</div>
        </div>
      </footer>

      {authMode && (
        <AuthModal
          mode={authMode}
          notice={notice}
          onModeChange={(m) => navigate(`/${m}${next ? `?next=${encodeURIComponent(next)}` : ''}`, { replace: true })}
          onClose={() => navigate('/', { replace: true })}
          onSuccess={(u, { created }) => {
            const dest = safeNext(next);
            if (!u.onboarding?.completed) navigate(`/onboarding?next=${encodeURIComponent(dest)}`, { replace: true });
            else { toast(created ? 'Account created.' : `Welcome back, ${u.name.split(' ')[0]}.`); navigate(dest, { replace: true }); }
          }}
        />
      )}
    </div>
  );
}

function Workspace({ tab, autoLink }) {
  const mimi = useMimiStatus();
  return <DashboardView tab={tab} autoLink={autoLink} mimiStatus={mimi} onTab={(t) => navigate(`/dashboard/${t}`)} />;
}

function Router() {
  const route = useRoute();
  const auth = useAuth();
  const protectedRoute = ['/dashboard', '/onboarding', '/connect'].includes(route.path);
  // Older Mimi builds open /connect. In the serverless site that route can
  // only take the user to the website's Mimi page; it cannot exchange API codes.
  const here = route.path === '/connect' ? '/dashboard/mimi' : route.path === '/dashboard' && route.sub ? `/dashboard/${route.sub}` : route.path;

  // The Vercel site keeps accounts in this browser. Mirror only the account
  // identity to Mimi in the same Chrome profile; credentials never leave the site.
  useEffect(() => {
    if (auth.status !== 'signedIn') return;
    const sync = () => Mimi.localAccount(auth.user).catch(() => {});
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [auth.status, auth.user]);
  useEffect(() => {
    if (auth.status === 'signedOut') Mimi.localAccount(null).catch(() => {});
  }, [auth.status]);

  // Guards: signed-out users go to sign-in (and come back afterwards); signed-in users skip the auth modal.
  useEffect(() => {
    if (auth.status === 'loading') return;
    if (protectedRoute && auth.status === 'signedOut') navigate(`/signin?next=${encodeURIComponent(here)}`, { replace: true });
    if ((route.path === '/signin' || route.path === '/signup') && auth.status === 'signedIn') {
      navigate(auth.user.onboarding?.completed ? safeNext(route.query.next) : `/onboarding?next=${encodeURIComponent(safeNext(route.query.next))}`, { replace: true });
    }
    if ((route.path === '/dashboard' || route.path === '/connect') && auth.status === 'signedIn' && !auth.user.onboarding?.completed) {
      navigate(`/onboarding?next=${encodeURIComponent(here)}`, { replace: true });
    }
  }, [auth.status, auth.user, route.path, route.raw, protectedRoute, here, route.query.next]);

  useEffect(() => { window.scrollTo(0, 0); }, [route.path]);
  useEffect(() => {
    document.title = route.path === '/dashboard' || route.path === '/connect' ? 'Solace — Workspace' : route.path === '/onboarding' ? 'Solace — Get started' : 'Solace — Privacy-First Rapid Response Workspace';
  }, [route.path]);

  if (auth.status === 'loading') return <Loading />;
  if (protectedRoute && auth.status !== 'signedIn') return <Loading label="Taking you to sign in" />;

  if (route.path === '/onboarding') return <OnboardingView next={route.query.next} />;
  if (route.path === '/connect') return auth.user.onboarding?.completed ? <Workspace tab="mimi" autoLink={false} /> : <Loading />;
  if (route.path === '/dashboard') {
    if (!auth.user.onboarding?.completed) return <Loading />;
    const tab = DASH_TABS.includes(route.sub) ? route.sub : 'overview';
    return <Workspace tab={tab} autoLink={false} />;
  }

  const authMode = route.path === '/signin' ? 'signin' : route.path === '/signup' ? 'signup' : null;
  let notice = null;
  if (authMode && auth.expired) notice = 'Your session expired. Please log in again.';
  else if (authMode && route.query.next === '/connect') notice = 'Log in to connect Mimi to your Solace account.';
  else if (authMode === 'signin' && route.query.next) notice = 'Please log in to continue.';
  if (auth.offline && authMode) notice = 'The Solace server isn’t reachable right now. If you’re running locally, start it with “npm run dev”.';
  return <Landing authMode={auth.status === 'signedIn' ? null : authMode} next={route.query.next} notice={notice} />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ToastProvider>
  );
}
