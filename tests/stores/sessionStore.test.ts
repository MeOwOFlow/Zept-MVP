import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionsPutMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/db', () => ({
  db: { sessions: { put: sessionsPutMock } },
  saveSession: vi.fn(async (s: any) => sessionsPutMock(s)),
}));
vi.mock('../../src/lib/session', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/session')>('../../src/lib/session');
  return {
    ...actual,
    startInterruptionTracking: vi.fn(),
    stopInterruptionTracking: vi.fn(),
  };
});

import { useSessionStore } from '../../src/stores/sessionStore';
import type { UserProfile } from '../../src/types/user';

const user: UserProfile = {
  goal: '考研', daysToExam: 100, topDistractions: ['手机'], onboarded: true,
};

beforeEach(() => {
  useSessionStore.setState({
    currentSession: null, pomodoroState: null,
    remainingSec: 0, isRunning: false, interruptions: 0,
  });
  sessionsPutMock.mockReset();
});

describe('sessionStore - startSession', () => {
  it('番茄会话初始化 work 模式，剩余 25*60', () => {
    useSessionStore.getState().startSession(user, true);
    const s = useSessionStore.getState();
    expect(s.currentSession!.status).toBe('focusing');
    expect(s.pomodoroState!.mode).toBe('work');
    expect(s.remainingSec).toBe(25 * 60);
    expect(s.isRunning).toBe(true);
  });

  it('自由会话无 pomodoroState', () => {
    useSessionStore.getState().startSession(user, false);
    expect(useSessionStore.getState().pomodoroState).toBeNull();
  });
});

describe('sessionStore - tick', () => {
  it('每秒递减', () => {
    useSessionStore.getState().startSession(user, true);
    useSessionStore.getState().tick();
    expect(useSessionStore.getState().remainingSec).toBe(25 * 60 - 1);
  });

  it('到 0 切换 work → short_break', () => {
    useSessionStore.getState().startSession(user, true);
    useSessionStore.setState({ remainingSec: 1 });
    useSessionStore.getState().tick();
    const s = useSessionStore.getState();
    expect(s.pomodoroState!.mode).toBe('short_break');
    expect(s.pomodoroState!.cyclesCompleted).toBe(1);
    expect(s.remainingSec).toBe(5 * 60);
  });
});

describe('sessionStore - endSession', () => {
  it('写入自评、持久化、清空运行态', async () => {
    useSessionStore.getState().startSession(user, true);
    await useSessionStore.getState().endSession({ mood: 4, focus: 4 });
    expect(sessionsPutMock).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().currentSession).toBeNull();
    expect(useSessionStore.getState().isRunning).toBe(false);
  });
});
