import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const exportAllMock = vi.hoisted(() => vi.fn(async () => ({ sessions: [], insights: [] })));
const clearAllMock = vi.hoisted(() => vi.fn(async () => undefined));
const mockNavigate = vi.hoisted(() => vi.fn());
const loadProfileMock = vi.hoisted(() => vi.fn(async () => undefined));
const setThemeMock = vi.hoisted(() => vi.fn(async () => undefined));
const setReplyStyleMock = vi.hoisted(() => vi.fn(async () => undefined));

const DEFAULT_PROFILE = {
  goal: '考研',
  examDate: '2026-12-21',
  topDistractions: ['手机'],
  onboarded: true,
  pomodoroConfig: null,
  theme: 'auto' as const,
  replyStyle: 'balanced' as const,
};

vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
vi.mock('../../src/lib/db', () => ({
  exportAll: exportAllMock,
  clearAll: clearAllMock,
}));
vi.mock('../../src/stores/userStore', () => ({
  useUserStore: (selector: (s: {
    profile: typeof DEFAULT_PROFILE | null;
    loadProfile: typeof loadProfileMock;
    setTheme: typeof setThemeMock;
    setReplyStyle: typeof setReplyStyleMock;
  }) => unknown) =>
    selector({
      profile: DEFAULT_PROFILE,
      loadProfile: loadProfileMock,
      setTheme: setThemeMock,
      setReplyStyle: setReplyStyleMock,
    }),
}));

import Settings from '../../src/pages/Settings';

beforeEach(() => {
  exportAllMock.mockClear();
  clearAllMock.mockClear();
  mockNavigate.mockClear();
  loadProfileMock.mockClear();
  setThemeMock.mockClear();
  setReplyStyleMock.mockClear();
});

describe('Settings - 渲染', () => {
  it('渲染外观与数据区（不含番茄配置）', () => {
    render(<Settings />);
    expect(screen.getByText('外观')).toBeInTheDocument();
    expect(screen.getByText('主题')).toBeInTheDocument();
    expect(screen.getByText('数据')).toBeInTheDocument();
    expect(screen.getByText('导出 JSON')).toBeInTheDocument();
    expect(screen.getByText('清空所有数据')).toBeInTheDocument();
    expect(screen.getByText('合规声明')).toBeInTheDocument();
    // 番茄配置已移至 Session 页
    expect(screen.queryByText('番茄设置')).not.toBeInTheDocument();
    expect(screen.queryByText('专注时长')).not.toBeInTheDocument();
  });

  it('主题默认选中"跟随系统"', () => {
    render(<Settings />);
    expect(screen.getByRole('button', { name: '跟随系统' })).toHaveClass('zept-chip--active');
  });
});

describe('Settings - 主题切换', () => {
  it('点击"日间"调用 setTheme(light)', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: '日间' }));
    expect(setThemeMock).toHaveBeenCalledTimes(1);
    expect(setThemeMock).toHaveBeenCalledWith('light');
  });

  it('点击"夜间"调用 setTheme(dark)', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: '夜间' }));
    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('点击"跟随系统"调用 setTheme(auto)', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: '跟随系统' }));
    expect(setThemeMock).toHaveBeenCalledWith('auto');
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
