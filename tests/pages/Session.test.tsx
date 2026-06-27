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

  it('渲染空闲态，不显示推荐区，按钮启用，显示自定义输入框', () => {
    render(<Session />);
    expect(screen.getByText('番茄模式')).toBeInTheDocument();
    expect(screen.getByText('自由模式')).toBeInTheDocument();
    expect(screen.getByText('开始专注')).toBeInTheDocument();
    expect(screen.getByText(/距考 \d+ 天/)).toBeInTheDocument();
    expect(screen.queryByText('常用推荐 · 点击即用')).not.toBeInTheDocument();
    expect(screen.getByText('专注时长')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '专注时长（分钟）' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '短休时长（分钟）' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '长休时长（分钟）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
  });

  it('已配置用户的输入框显示上次的值', () => {
    render(<Session />);
    expect(screen.getByRole('spinbutton', { name: '专注时长（分钟）' })).toHaveValue(25);
    expect(screen.getByRole('spinbutton', { name: '短休时长（分钟）' })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: '长休时长（分钟）' })).toHaveValue(15);
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

  it('显示推荐区，输入框为空，开始按钮禁用', () => {
    render(<Session />);
    expect(screen.getByText('常用推荐 · 点击即用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '经典番茄' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '深度专注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '冲刺模式' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '专注时长（分钟）' })).toHaveValue(null);
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('点击推荐后输入框填入值，按钮启用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByRole('button', { name: '经典番茄' }));
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: '专注时长（分钟）' })).toHaveValue(25);
      expect(screen.getByRole('spinbutton', { name: '短休时长（分钟）' })).toHaveValue(5);
      expect(screen.getByRole('spinbutton', { name: '长休时长（分钟）' })).toHaveValue(15);
    });
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
  });

  it('通过快捷 chips 选值后按钮启用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '45 分钟' }));
    const shortBreakField = screen.getByText('短休时长').closest('.zept-session__field') as HTMLElement;
    await user.click(within(shortBreakField).getByRole('button', { name: '10 分钟' }));
    const longBreakField = screen.getByText('长休时长').closest('.zept-session__field') as HTMLElement;
    await user.click(within(longBreakField).getByRole('button', { name: '20 分钟' }));
    await user.click(screen.getByRole('button', { name: '每 3 轮' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    });
  });

  it('通过自定义输入框输入任意分钟数后按钮启用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
    const workInput = screen.getByRole('spinbutton', { name: '专注时长（分钟）' });
    const shortInput = screen.getByRole('spinbutton', { name: '短休时长（分钟）' });
    const longInput = screen.getByRole('spinbutton', { name: '长休时长（分钟）' });
    await user.type(workInput, '35');
    await user.type(shortInput, '7');
    await user.type(longInput, '12');
    await user.click(screen.getByRole('button', { name: '每 4 轮' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    });
    // 35 不在快捷 chips 里，没有 chip 处于 active
    const workField = screen.getByText('专注时长').closest('.zept-session__field') as HTMLElement;
    const activeChips = within(workField).queryAllByRole('button', { pressed: true });
    expect(activeChips).toHaveLength(0);
  });

  it('选择"关闭长休"时长休输入框禁用且无需填值', async () => {
    const user = userEvent.setup();
    render(<Session />);
    const longInput = screen.getByRole('spinbutton', { name: '长休时长（分钟）' });
    expect(longInput).not.toBeDisabled();
    await user.type(screen.getByRole('spinbutton', { name: '专注时长（分钟）' }), '25');
    await user.type(screen.getByRole('spinbutton', { name: '短休时长（分钟）' }), '5');
    await user.click(screen.getByRole('button', { name: '关闭长休' }));
    await waitFor(() => {
      expect(longInput).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
  });
});
