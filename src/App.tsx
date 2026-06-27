import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useUserStore } from './stores/userStore';
import Onboarding from './pages/Onboarding';
import Session from './pages/Session';
import Insights from './pages/Insights';
import Settings from './pages/Settings';
import './styles/app.css';

const NAV_ITEMS = [
  { to: '/session', label: '专注', icon: 'timer' },
  { to: '/insights', label: '洞察', icon: 'insights' },
  { to: '/settings', label: '设置', icon: 'settings' },
] as const;

function NavBar() {
  const location = useLocation();
  return (
    <nav className="zept-nav" role="navigation" aria-label="主导航">
      {NAV_ITEMS.map((item) => {
        const active = location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`zept-nav__item${active ? ' zept-nav__item--active' : ''}`}
            aria-label={item.label}
          >
            <span className="material-symbols-rounded zept-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="zept-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function App() {
  const profile = useUserStore((s) => s.profile);
  const loadProfile = useUserStore((s) => s.loadProfile);
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadProfile().finally(() => setReady(true));
  }, [loadProfile]);

  if (!ready) return null;

  const isOnboarding = location.pathname === '/onboarding';

  return (
    <div className="zept-app">
      <main className="zept-app__content">
        <Routes>
          <Route
            path="/"
            element={
              profile === null ? (
                <Navigate to="/onboarding" replace />
              ) : (
                <Navigate to="/session" replace />
              )
            }
          />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/session" element={<Session />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {!isOnboarding && <NavBar />}
    </div>
  );
}
