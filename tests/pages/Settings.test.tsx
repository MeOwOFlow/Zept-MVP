import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const exportAllMock = vi.hoisted(() => vi.fn(async () => ({ sessions: [], insights: [] })));
const clearAllMock = vi.hoisted(() => vi.fn(async () => undefined));
const mockNavigate = vi.hoisted(() => vi.fn());
const setProfileMock = vi.hoisted(() => vi.fn(async (_p: any) => undefined));
const loadProfileMock = vi.hoisted(() => vi.fn(async () => undefined));

const DEFAULT_PROFILE = {
  goal: '考研',
  examDate: '2026-12-21',
  topDistractions: ['手机'],
  onboarded: true,
  pomodoroConfig: { workDurationMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
};

vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
vi.mock('../../src/lib/db', () => ({
  exportAll: exportAllMock,
  clearAll: clearAllMock,
}));
vi.mock('../../src/stores/userStore', () => ({
  useUserStore: (selector: (s: {
    profile: typeof DEFAULT_PROFILE | null;
    setProfile: typeof setProfileMock;
    loadProfile: typeof loadProfileMock;
  }) => unknown) =>
    selector({
      profile: DEFAULT_PROFILE,
      setProfile: setProfileMock,
      loadProfile: loadProfileMock,
    }),
}));

import Settings from '../../src/pages/Settings';

beforeEach(() => {
  exportAllMock.mockClear();
  clearAllMock.mockClear();
  mockNavigate.mockClear();
  setProfileMock.mockClear();
  loadProfileMock.mockClear();
});

describe('Settings - 渲染', () => {
  it('渲染番茄配置区与数据区', () => {
    render(<Settings />);
    expect(screen.getByText('番茄设置')).toBeInTheDocument();
    expect(screen.getByText('专注时长')).toBeInTheDocument();
    expect(screen.getByText('短休时长')).toBeInTheDocument();
    expect(screen.getByText('长休时长')).toBeInTheDocument();
    expect(screen.getByText('长休触发')).toBeInTheDocument();
    expect(screen.getByText('导出 JSON')).toBeInTheDocument();
    expect(screen.getByText('清空所有数据')).toBeInTheDocument();
    expect(screen.getByText('合规声明')).toBeInTheDocument();
  });

  it('默认选中当前配置对应的 chip', () => {
    render(<Settings />);
    // 专注 25 / 短休 5 / 长休 15 / 每 4 轮（15 在短休/长休都存在，用 within 限定）
    expect(screen.getByRole('button', { name: '25 分钟' })).toHaveClass('zept-chip--active');
    expect(screen.getByRole('button', { name: '5 分钟' })).toHaveClass('zept-chip--active');
    const longBreakField = screen.getByText('长休时长').closest('.zept-settings__field') as HTMLElement;
    expect(within(longBreakField).getByRole('button', { name: '15 分钟' })).toHaveClass('zept-chip--active');
    expect(screen.getByRole('button', { name: '每 4 轮' })).toHaveClass('zept-chip--active');
  });
});

describe('Settings - 番茄配置', () => {
  it('点击专注时长 chip 调用 setProfile', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: '50 分钟' }));
    expect(setProfileMock).toHaveBeenCalledTimes(1);
    const arg = setProfileMock.mock.calls[0][0];
    expect(arg.pomodoroConfig.workDurationMin).toBe(50);
    expect(arg.pomodoroConfig.shortBreakMin).toBe(5); // 其他保持不变
  });

  it('点击短休 chip 更新 shortBreakMin', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    // 10 分钟在短休/长休都存在，用 within 限定到短休 field
    const shortBreakField = screen.getByText('短休时长').closest('.zept-settings__field') as HTMLElement;
    await user.click(within(shortBreakField).getByRole('button', { name: '10 分钟' }));
    const arg = setProfileMock.mock.calls[0][0].pomodoroConfig;
    expect(arg.shortBreakMin).toBe(10);
  });

  it('点击长休触发"关闭长休"后，长休时长 chips 被 disabled', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    // 初始长休 15 分钟 chip 可点击
    const longBreakField = screen.getByText('长休时长').closest('.zept-settings__field') as HTMLElement;
    expect(within(longBreakField).getByRole('button', { name: '15 分钟' })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: '关闭长休' }));
    expect(setProfileMock).toHaveBeenCalled();
    const arg = setProfileMock.mock.calls[0][0].pomodoroConfig;
    expect(arg.longBreakEvery).toBe(0);
  });

  it('长休触发选项支持每 2/3/4/5/6 轮', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: '每 3 轮' }));
    const arg = setProfileMock.mock.calls[0][0].pomodoroConfig;
    expect(arg.longBreakEvery).toBe(3);
  });
});

describe('Settings - 数据管理', () => {
  it('导出调用 exportAll', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByText('导出 JSON'));
    expect(exportAllMock).toHaveBeenCalledTimes(1);
  });

  it('清空数据需二次确认', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByText('清空所有数据'));
    expect(screen.getByText('确认清空')).toBeInTheDocument();
    await user.click(screen.getByText('确认清空'));
    expect(clearAllMock).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding');
  });
});
