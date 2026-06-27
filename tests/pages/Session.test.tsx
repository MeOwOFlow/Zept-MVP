import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserProfile } from '../../src/types/user';

const startSessionMock = vi.hoisted(() => vi.fn());
const endSessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const generateInsightMock = vi.hoisted(() => vi.fn());
const setProfileMock = vi.hoisted(() => vi.fn(async () => undefined));

const CONFIGURED_PROFILE: UserProfile = {
  goal: '考研', examDate: '2026-12-21', topDistractions: ['手机'], onboarded: true,
  pomodoroConfig: { workDurationMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  theme: 'auto',
};

const UNCONFIGURED_PROFILE: UserProfile = {
  goal: '考研', examDate: '2026-12-21', topDistractions: ['手机'], onboarded: true,
  pomodoroConfig: null,
  theme: 'auto',
};

const profileMock = vi.hoisted(() => ({ current: null as UserProfile | null }));

const mockState = vi.hoisted(() => ({
  currentSession: null,
  pomodoroState: null,
  remainingSec: 0,
  isRunning: false,
  interruptions: 0,
  startSession: startSessionMock,
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  tick: vi.fn(),
  skipBreak: vi.fn(),
  endSession: endSessionMock,
}));

vi.mock('../../src/stores/userStore', () => ({
  useUserStore: (selector: (s: { profile: UserProfile | null; setProfile: typeof setProfileMock }) => unknown) =>
    selector({ profile: profileMock.current, setProfile: setProfileMock }),
}));
vi.mock('../../src/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));
vi.mock('../../src/lib/insight', () => ({
  generateInsight: generateInsightMock,
}));
vi.mock('../../src/lib/db', () => ({
  getRecentSessions: vi.fn(async () => []),
  getUsefulInsights: vi.fn(async () => []),
  updateInsightFeedback: vi.fn(async () => undefined),
}));

import Session from '../../src/pages/Session';

beforeEach(() => {
  startSessionMock.mockClear();
  endSessionMock.mockClear();
  generateInsightMock.mockClear();
  setProfileMock.mockClear();
  mockState.currentSession = null;
  mockState.pomodoroState = null;
  mockState.remainingSec = 0;
  mockState.isRunning = false;
  mockState.interruptions = 0;
});

describe('Session - 已配置用户', () => {
  beforeEach(() => {
    profileMock.current = CONFIGURED_PROFILE;
  });

  it('渲染空闲态，不显示推荐区，按钮启用', () => {
    render(<Session />);
    expect(screen.getByText('番茄模式')).toBeInTheDocument();
    expect(screen.getByText('自由模式')).toBeInTheDocument();
    expect(screen.getByText('开始专注')).toBeInTheDocument();
    expect(screen.getByText(/距考 \d+ 天/)).toBeInTheDocument();
    // 已配置用户不显示推荐区
    expect(screen.queryByText('常用推荐 · 点击即用')).not.toBeInTheDocument();
    // 显示配置区
    expect(screen.getByText('专注时长')).toBeInTheDocument();
    // 按钮启用
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
  });

  it('点击开始调用 startSession', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByText('开始专注'));
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ goal: '考研', examDate: '2026-12-21' }),
      true,
    );
  });

  it('可切换到自由模式', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByText('自由模式'));
    await user.click(screen.getByText('开始专注'));
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.any(Object),
      false,
    );
  });
});

describe('Session - 未配置用户', () => {
  beforeEach(() => {
    profileMock.current = UNCONFIGURED_PROFILE;
  });

  it('显示推荐区，开始按钮禁用', () => {
    render(<Session />);
    expect(screen.getByText('常用推荐 · 点击即用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '经典番茄' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '深度专注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '冲刺模式' })).toBeInTheDocument();
    // 未选完时长，按钮禁用
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('点击推荐后按钮启用，点击开始调用 setProfile + startSession', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByRole('button', { name: '经典番茄' }));
    // 选完后按钮启用
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '开始专注' }));
    // 首次配置会持久化
    expect(setProfileMock).toHaveBeenCalledTimes(1);
    expect(startSessionMock).toHaveBeenCalledTimes(1);
    const updatedProfile = (setProfileMock.mock.calls[0] as unknown as [UserProfile] | undefined)?.[0];
    expect(updatedProfile?.pomodoroConfig).toEqual({
      workDurationMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4,
    });
  });

  it('手动选完 4 项时长后按钮启用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '50 分钟' }));
    // 10 分钟在短休/长休都存在，用 within 限定到短休 field
    const shortBreakField = screen.getByText('短休时长').closest('.zept-session__field') as HTMLElement;
    await user.click(within(shortBreakField).getByRole('button', { name: '10 分钟' }));
    // 20 分钟在专注/长休都存在，用 within 限定到长休 field
    const longBreakField = screen.getByText('长休时长').closest('.zept-session__field') as HTMLElement;
    await user.click(within(longBreakField).getByRole('button', { name: '20 分钟' }));
    await user.click(screen.getByRole('button', { name: '每 3 轮' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    });
  });
});
