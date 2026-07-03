import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  formatDuration,
  startInterruptionTracking,
  stopInterruptionTracking,
  endSession,
} from '../../src/lib/session';
import type { UserProfile } from '../../src/types/user';

const user: UserProfile = {
  goal: '考研',
  examDate: '2026-12-21',
  topDistractions: ['手机'],
  onboarded: true,
  pomodoroConfig: { workDurationMin: 25, shortBreakMin: 5, targetCycles: 4 },
  theme: 'auto',
};

describe('createSession', () => {
  it('番茄模式：plannedDurationSec=25*60，isPomodoro=true', () => {
    const s = createSession(user, true);
    expect(s.isPomodoro).toBe(true);
    expect(s.plannedDurationSec).toBe(25 * 60);
    expect(s.status).toBe('planned');
    expect(s.interruptions).toBe(0);
    expect(s.interruptionEvents).toEqual([]);
    expect(s.breakMoods).toEqual([]);
    expect(s.id).toMatch(/^s_\d+_/);
    expect(s.userId).toBe('local');
    expect(s.goal).toBe('考研');
  });
  it('自由模式：plannedDurationSec=0，isPomodoro=false', () => {
    const s = createSession(user, false);
    expect(s.isPomodoro).toBe(false);
    expect(s.plannedDurationSec).toBe(0);
  });
});

describe('formatDuration', () => {
  it('格式化为分秒', () => {
    expect(formatDuration(1530)).toBe('25分30秒');
    expect(formatDuration(60)).toBe('1分0秒');
    expect(formatDuration(0)).toBe('0分0秒');
  });
});

describe('endSession', () => {
  it('计算实际时长、结束小时，写入自评并标记 completed', () => {
    vi.useFakeTimers();
    const start = new Date('2026-06-27T10:30:00').getTime();
    vi.setSystemTime(start);
    const s = createSession(user, true);
    const end = new Date('2026-06-27T10:55:00').getTime();
    vi.setSystemTime(end);
    const ended = endSession(s, { mood: 4, focus: 4 });
    expect(ended.endedAt).toBe(end);
    expect(ended.actualDurationSec).toBe(25 * 60);
    expect(ended.endHour).toBe(10);
    expect(ended.status).toBe('completed');
    expect(ended.postAssessment).toEqual({ mood: 4, focus: 4 });
    vi.useRealTimers();
  });
});

describe('interruption tracking', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stopInterruptionTracking();
    vi.useRealTimers();
  });

  const setVisible = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('隐藏 > 10s 恢复后计为一次中断', () => {
    const onRecover = vi.fn();
    startInterruptionTracking('s1', onRecover);
    setVisible('hidden');
    vi.advanceTimersByTime(15_000);
    setVisible('visible');
    expect(onRecover).toHaveBeenCalledTimes(1);
    expect(onRecover.mock.calls[0][0]).toMatchObject({ interruptions: 1, durationMs: 15_000 });
  });

  it('隐藏 < 10s 不计中断', () => {
    const onRecover = vi.fn();
    startInterruptionTracking('s1', onRecover);
    setVisible('hidden');
    vi.advanceTimersByTime(5_000);
    setVisible('visible');
    expect(onRecover).not.toHaveBeenCalled();
  });

  it('多次中断累加', () => {
    const onRecover = vi.fn();
    startInterruptionTracking('s1', onRecover);
    setVisible('hidden');
    vi.advanceTimersByTime(15_000);
    setVisible('visible');
    setVisible('hidden');
    vi.advanceTimersByTime(20_000);
    setVisible('visible');
    expect(onRecover).toHaveBeenCalledTimes(2);
    expect(onRecover.mock.calls[1][0].interruptions).toBe(2);
  });

  it('stopInterruptionTracking 后不再触发', () => {
    const onRecover = vi.fn();
    startInterruptionTracking('s1', onRecover);
    stopInterruptionTracking();
    setVisible('hidden');
    vi.advanceTimersByTime(15_000);
    setVisible('visible');
    expect(onRecover).not.toHaveBeenCalled();
  });
});
