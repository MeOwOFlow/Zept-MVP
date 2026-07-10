import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const exportAllMock = vi.hoisted(() => vi.fn(async () => ({ sessions: [], insights: [] })));
const clearAllMock = vi.hoisted(() => vi.fn(async () => undefined));
const mockNavigate = vi.hoisted(() => vi.fn());
const loadProfileMock = vi.hoisted(() => vi.fn(async () => undefined));
const setThemeMock = vi.hoisted(() => vi.fn(async () => undefined));
const setReplyStyleMock = vi.hoisted(() => vi.fn(async () => undefined));
const setTopDistractionsMock = vi.hoisted(() => vi.fn(async () => undefined));
const setSoundEnabledMock = vi.hoisted(() => vi.fn(async () => undefined));
const setVibrationEnabledMock = vi.hoisted(() => vi.fn(async () => undefined));
const resetProfileMock = vi.hoisted(() => vi.fn());

const DEFAULT_PROFILE = {
  goal: '考研',
  examDate: '2026-12-21',
  topDistractions: ['手机'],
  onboarded: true,
  pomodoroConfig: null,
  theme: 'auto' as const,
  replyStyle: 'balanced' as const,
  soundEnabled: true,
  vibrationEnabled: true,
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
    setTopDistractions: typeof setTopDistractionsMock;
    setSoundEnabled: typeof setSoundEnabledMock;
    setVibrationEnabled: typeof setVibrationEnabledMock;
    resetProfile: typeof resetProfileMock;
  }) => unknown) =>
    selector({
      profile: DEFAULT_PROFILE,
      loadProfile: loadProfileMock,
      setTheme: setThemeMock,
      setReplyStyle: setReplyStyleMock,
      setTopDistractions: setTopDistractionsMock,
      setSoundEnabled: setSoundEnabledMock,
      setVibrationEnabled: setVibrationEnabledMock,
      resetProfile: resetProfileMock,
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
  setTopDistractionsMock.mockClear();
  setSoundEnabledMock.mockClear();
  setVibrationEnabledMock.mockClear();
  resetProfileMock.mockClear();
});

describe('Settings - 渲染', () => {
  it('渲染外观与数据区（不含番茄配置）', () => {
    render(<Settings />);
    expect(screen.getByText('外观')).toBeInTheDocument();
    expect(screen.getByText('主题')).toBeInTheDocument();
    expect(screen.getByText('数据')).toBeInTheDocument();
    expect(screen.getByText('导出 JSON')).toBeInTheDocument();
    expect(screen.getByText('清空所有数据')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /合规声明/ })).toBeInTheDocument();
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
    expect(resetProfileMock).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding');
  });
});

describe('Settings - 提示音', () => {
  it('渲染提示音卡片，默认开启', () => {
    render(<Settings />);
    expect(screen.getByText('提示音')).toBeInTheDocument();
    expect(screen.getByText('阶段切换提示音')).toBeInTheDocument();
    expect(screen.getByText('振动反馈')).toBeInTheDocument();
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    expect(switches[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('点击提示音开关调用 setSoundEnabled(false)', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);  // 第一个是提示音开关
    expect(setSoundEnabledMock).toHaveBeenCalledWith(false);
  });
});

describe('Settings - 容易分心的事', () => {
  it('渲染分心项卡片并显示已选项', () => {
    render(<Settings />);
    expect(screen.getByText('容易分心的事')).toBeInTheDocument();
    expect(screen.getByLabelText('移除 手机')).toBeInTheDocument();
  });

  it('点击预设项添加/移除分心项', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole('button', { name: '短视频' }));
    expect(setTopDistractionsMock).toHaveBeenCalledWith(['手机', '短视频']);
  });

  it('点击已选项移除分心项', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByLabelText('移除 手机'));
    expect(setTopDistractionsMock).toHaveBeenCalledWith([]);
  });

  it('自定义输入并添加', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const input = screen.getByLabelText('自定义分心项');
    await user.type(input, ' 杂念 ');
    await user.click(screen.getByRole('button', { name: '添加' }));
    expect(setTopDistractionsMock).toHaveBeenCalledWith(['手机', '杂念']);
  });

  it('按回车添加自定义项', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const input = screen.getByLabelText('自定义分心项');
    await user.type(input, '噪音{enter}');
    expect(setTopDistractionsMock).toHaveBeenCalledWith(['手机', '噪音']);
  });

  it('重复自定义项不添加', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const input = screen.getByLabelText('自定义分心项');
    await user.type(input, '手机{enter}');
    expect(setTopDistractionsMock).not.toHaveBeenCalled();
  });
});
