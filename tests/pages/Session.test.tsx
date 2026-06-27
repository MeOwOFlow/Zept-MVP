import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const startSessionMock = vi.hoisted(() => vi.fn());
const endSessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const generateInsightMock = vi.hoisted(() => vi.fn());
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
  useUserStore: (selector: (s: { profile: { goal: string; examDate: string; topDistractions: string[]; onboarded: boolean; pomodoroConfig: { workDurationMin: number; shortBreakMin: number; longBreakMin: number; longBreakEvery: number } } }) => unknown) =>
    selector({
      profile: {
        goal: '考研', examDate: '2026-12-21', topDistractions: ['手机'], onboarded: true,
        pomodoroConfig: { workDurationMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      },
    }),
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
  mockState.currentSession = null;
  mockState.pomodoroState = null;
  mockState.remainingSec = 0;
  mockState.isRunning = false;
  mockState.interruptions = 0;
});

describe('Session', () => {
  it('渲染空闲态和模式选择', () => {
    render(<Session />);
    expect(screen.getByText('番茄模式')).toBeInTheDocument();
    expect(screen.getByText('自由模式')).toBeInTheDocument();
    expect(screen.getByText('开始专注')).toBeInTheDocument();
    // examDate 2026-12-21，距考天数随当前日期动态变化，只验证前缀
    expect(screen.getByText(/距考 \d+ 天/)).toBeInTheDocument();
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
