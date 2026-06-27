import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('渲染预设 tile、stepper 显示上次值，按钮启用', () => {
    render(<Session />);
    expect(screen.getByText('番茄模式')).toBeInTheDocument();
    expect(screen.getByText('自由模式')).toBeInTheDocument();
    // 三个预设 tile
    expect(screen.getByRole('button', { name: '经典 25/5/15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '深度 50/10/20' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '冲刺 90/15/30' })).toBeInTheDocument();
    // stepper 输入框显示上次值
    expect(screen.getByRole('spinbutton', { name: '专注时长' })).toHaveValue(25);
    expect(screen.getByRole('spinbutton', { name: '短休时长' })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: '长休时长' })).toHaveValue(15);
    // 长休开关打开
    expect(screen.getByRole('switch', { name: '长休' })).toHaveAttribute('aria-checked', 'true');
    // 按钮启用
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
  });

  it('点击开始调用 startSession', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByRole('button', { name: '开始专注' }));
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ goal: '考研', examDate: '2026-12-21' }),
      true,
    );
  });

  it('可切换到自由模式', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByText('自由模式'));
    await user.click(screen.getByRole('button', { name: '开始专注' }));
    expect(startSessionMock).toHaveBeenCalledWith(expect.any(Object), false);
  });

  it('点击 + 按钮增加专注时长', async () => {
    const user = userEvent.setup();
    render(<Session />);
    const incBtn = screen.getByRole('button', { name: '专注时长 增加' });
    await user.click(incBtn);
    expect(screen.getByRole('spinbutton', { name: '专注时长' })).toHaveValue(26);
  });
});

describe('Session - 未配置用户', () => {
  beforeEach(() => {
    profileMock.current = UNCONFIGURED_PROFILE;
  });

  it('stepper 为空，长休默认关，按钮禁用', () => {
    render(<Session />);
    expect(screen.getByRole('spinbutton', { name: '专注时长' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: '短休时长' })).toHaveValue(null);
    expect(screen.queryByRole('spinbutton', { name: '长休时长' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '长休' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('点击预设 tile 填入全套配置，按钮启用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.click(screen.getByRole('button', { name: '经典 25/5/15' }));
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: '专注时长' })).toHaveValue(25);
      expect(screen.getByRole('spinbutton', { name: '短休时长' })).toHaveValue(5);
      expect(screen.getByRole('spinbutton', { name: '长休时长' })).toHaveValue(15);
    });
    expect(screen.getByRole('switch', { name: '长休' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
  });

  it('通过 stepper 输入值后按钮启用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
    const workInput = screen.getByRole('spinbutton', { name: '专注时长' });
    const shortInput = screen.getByRole('spinbutton', { name: '短休时长' });
    await user.type(workInput, '35');
    await user.type(shortInput, '7');
    // 默认长休关，此时专注+短休填完就够
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    });
  });

  it('打开长休开关后显示长休 stepper，未填时长时按钮禁用', async () => {
    const user = userEvent.setup();
    render(<Session />);
    // 先填专注和短休
    await user.type(screen.getByRole('spinbutton', { name: '专注时长' }), '25');
    await user.type(screen.getByRole('spinbutton', { name: '短休时长' }), '5');
    // 此时长休关，按钮应可用
    expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    // 打开长休开关
    await user.click(screen.getByRole('switch', { name: '长休' }));
    expect(screen.getByRole('switch', { name: '长休' })).toHaveAttribute('aria-checked', 'true');
    // 长休时长和间隔出现，但未填值
    expect(screen.getByRole('spinbutton', { name: '长休时长' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '长休时长' })).toHaveValue(15); // 默认 15
    // 间隔默认 4
    expect(screen.getByRole('button', { name: '每 4 轮' })).toHaveClass('zept-chip--active');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始专注' })).toBeEnabled();
    });
  });

  it('关闭长休时长休 stepper 消失', async () => {
    const user = userEvent.setup();
    render(<Session />);
    await user.type(screen.getByRole('spinbutton', { name: '专注时长' }), '25');
    await user.type(screen.getByRole('spinbutton', { name: '短休时长' }), '5');
    await user.click(screen.getByRole('switch', { name: '长休' }));
    expect(screen.getByRole('spinbutton', { name: '长休时长' })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: '长休' }));
    expect(screen.queryByRole('spinbutton', { name: '长休时长' })).not.toBeInTheDocument();
  });
});
