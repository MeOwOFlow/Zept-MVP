import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserProfile } from '../src/types/user';

const { profileMock, loadProfileMock } = vi.hoisted(() => ({
  profileMock: { current: null as UserProfile | null },
  loadProfileMock: vi.fn(async () => undefined),
}));

vi.mock('../src/stores/userStore', () => ({
  useUserStore: (selector: (s: { profile: UserProfile | null; loadProfile: () => Promise<void>; setProfile: (p: UserProfile) => Promise<void> }) => unknown) =>
    selector({
      profile: profileMock.current,
      loadProfile: loadProfileMock,
      setProfile: vi.fn(async () => undefined),
    }),
}));

vi.mock('../src/pages/Onboarding', () => ({
  default: () => <div data-testid="onboarding-page">Onboarding</div>,
}));
vi.mock('../src/pages/Session', () => ({
  default: () => <div data-testid="session-page">Session</div>,
}));
vi.mock('../src/pages/Insights', () => ({
  default: () => <div data-testid="insights-page">Insights</div>,
}));
vi.mock('../src/pages/Settings', () => ({
  default: () => <div data-testid="settings-page">Settings</div>,
}));

import App from '../src/App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  beforeEach(() => {
    profileMock.current = null;
    loadProfileMock.mockClear();
  });

  it('未 onboarded 时 / 重定向到 /onboarding', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
    });
  });

  it('已 onboarded 时 / 重定向到 /session', async () => {
    profileMock.current = {
      goal: '考研', examDate: '2026-12-21', topDistractions: [], onboarded: true,
      pomodoroConfig: { workDurationMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      theme: 'auto',
    };
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByTestId('session-page')).toBeInTheDocument();
    });
  });

  it('onboarding 页隐藏底部导航栏', async () => {
    renderAt('/onboarding');
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
    });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('session 页显示底部导航栏', async () => {
    renderAt('/session');
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  it('导航栏含 专注/洞察/设置 三个链接', async () => {
    renderAt('/session');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '专注' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '洞察' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
    });
  });
});
