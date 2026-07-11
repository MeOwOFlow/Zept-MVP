import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useUserStore } from './stores/userStore';
import { checkDataVersion } from './lib/db';
import { STORAGE_KEYS } from './lib/storage-keys';
import Welcome from './pages/Welcome';
import Onboarding from './pages/Onboarding';
import Session from './pages/Session';
import Insights from './pages/Insights';
import Settings from './pages/Settings';
import './styles/app.css';

const NAV_ITEMS = [
  { to: '/session', label: '番茄钟', icon: 'timer' },
  { to: '/insights', label: '洞察', icon: 'insights' },
  { to: '/settings', label: '我的', icon: 'person' },
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
    // 首屏先以 auto 应用主题，避免 profile 加载前出现深色 FOUC
    document.documentElement.setAttribute('data-theme', 'auto');
    // 启动时校验数据完整性：部署后老数据字段缺失会自动补默认值
    Promise.all([loadProfile(), checkDataVersion()])
      .catch((err) => console.error('startup data check failed', err))
      .finally(() => setReady(true));
  }, [loadProfile]);

  if (!ready) return null;

  const isOnboarding = location.pathname === '/onboarding';
  const isWelcome = location.pathname === '/welcome';

  // 首次访问且未看过 welcome 且无 profile → 跳 welcome
  // 已有 profile 的老用户不再看 welcome（避免每次清空数据后被拦截）
  const shouldShowWelcome = !profile && !localStorage.getItem(STORAGE_KEYS.WELCOME_SEEN);

  return (
    <div className="zept-app">
      <main className="zept-app__content">
        <Routes>
          <Route
            path="/"
            element={
              shouldShowWelcome ? (
                <Navigate to="/welcome" replace />
              ) : profile === null ? (
                <Navigate to="/onboarding" replace />
              ) : (
                <Navigate to="/session" replace />
              )
            }
          />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/session" element={<Session />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {!isOnboarding && !isWelcome && <NavBar />}
    </div>
  );
}
