import { create } from 'zustand';
import type { SessionRecord, SessionStatus, SelfAssessment, PomodoroState, Rating, BreakMood } from '../types/session';
import type { UserProfile } from '../types/user';
import { saveSession } from '../lib/db';
import { createPomodoroState, nextMode, getDurationSec, tick as pomodoroTick, canSkip } from '../lib/pomodoro';
import { createSession, startInterruptionTracking, stopInterruptionTracking, endSession as endSessionRecord } from '../lib/session';

interface SessionStore {
  currentSession: SessionRecord | null;
  pomodoroState: PomodoroState | null;
  remainingSec: number;
  isRunning: boolean;
  interruptions: number;
  startSession: (user: UserProfile, isPomodoro: boolean) => void;
  setPreMood: (mood: Rating) => void;
  setBreakMood: (mood: 1 | 2 | 3 | null) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  tick: () => void;
  skipBreak: () => void;
  endSession: (postAssessment: SelfAssessment) => Promise<void>;
}

function statusForMode(mode: PomodoroState['mode']): SessionStatus {
  if (mode === 'work') return 'focusing';
  return 'break';
}

// ---------- localStorage 持久化 ----------
// 只持久化运行态数据，isRunning 恢复为 false（安全默认，刷新后变 paused）
const STORAGE_KEY = 'zept-session-state';

interface PersistedState {
  currentSession: SessionRecord;
  pomodoroState: PomodoroState;
  remainingSec: number;
  interruptions: number;
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.currentSession
      || parsed.currentSession.status === 'completed'
      || parsed.currentSession.status === 'abandoned') {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedState(state: PersistedState | null): void {
  try {
    if (state === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // localStorage 满或禁用时静默失败
  }
}

function getPersistableState(): PersistedState | null {
  const { currentSession, pomodoroState, remainingSec, interruptions } = useSessionStore.getState();
  if (!currentSession || !pomodoroState) return null;
  if (currentSession.status === 'completed' || currentSession.status === 'abandoned') return null;
  return { currentSession, pomodoroState, remainingSec, interruptions };
}

const initialState = loadPersistedState();

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSession: initialState?.currentSession ?? null,
  pomodoroState: initialState?.pomodoroState ?? null,
  remainingSec: initialState?.remainingSec ?? 0,
  isRunning: false,
  interruptions: initialState?.interruptions ?? 0,

  startSession: (user, isPomodoro) => {
    const session = createSession(user, isPomodoro);
    const pomodoroState = isPomodoro && user.pomodoroConfig
      ? createPomodoroState(user.pomodoroConfig)
      : null;
    const remainingSec = pomodoroState ? getDurationSec(pomodoroState) : 0;
    set({
      currentSession: { ...session, status: 'focusing' },
      pomodoroState, remainingSec, isRunning: true, interruptions: 0,
    });
    startInterruptionTracking(session.id, ({ interruptions, recoveredAt, durationMs }) => {
      set({ interruptions });
      const cs = get().currentSession;
      if (!cs) return;
      set({
        currentSession: {
          ...cs, interruptions,
          interruptionEvents: [...cs.interruptionEvents, { recoveredAt, durationMs }],
        },
      });
      savePersistedState(getPersistableState());
    });
    savePersistedState(getPersistableState());
  },

  setPreMood: (mood) => {
    const cs = get().currentSession;
    if (!cs) return;
    set({ currentSession: { ...cs, preAssessment: { mood } } });
    savePersistedState(getPersistableState());
  },

  setBreakMood: (mood) => {
    const { currentSession, pomodoroState } = get();
    if (!currentSession || !pomodoroState) return;
    const cycleIndex = pomodoroState.cyclesCompleted;
    // 同一个 break 只记录一次
    if (currentSession.breakMoods.some((b) => b.cycleIndex === cycleIndex)) return;
    const entry: BreakMood = { cycleIndex, mood, timestamp: Date.now() };
    set({
      currentSession: {
        ...currentSession,
        breakMoods: [...currentSession.breakMoods, entry],
      },
    });
    savePersistedState(getPersistableState());
  },

  pauseSession: () => {
    const cs = get().currentSession;
    if (!cs) return;
    set({ isRunning: false, currentSession: { ...cs, status: 'paused' } });
    savePersistedState(getPersistableState());
  },

  resumeSession: () => {
    const cs = get().currentSession;
    if (!cs) return;
    set({ isRunning: true, currentSession: { ...cs, status: 'focusing' } });
    savePersistedState(getPersistableState());
  },

  tick: () => {
    const { isRunning, pomodoroState, remainingSec, currentSession } = get();
    if (!isRunning || !pomodoroState || !currentSession) return;
    const total = getDurationSec(pomodoroState);
    const elapsed = total - remainingSec + 1;
    const result = pomodoroTick(pomodoroState, elapsed);
    if (!result.isComplete) {
      set({ remainingSec: result.remainingSec });
      // 每秒持久化 remainingSec，保证刷新后恢复正确倒计时
      savePersistedState(getPersistableState());
      return;
    }
    const newMode = nextMode(pomodoroState);
    if (newMode === 'done') {
      const newCycles = pomodoroState.cyclesCompleted + 1;
      const now = Date.now();
      const actualDurationSec = Math.max(0, Math.round((now - currentSession.startedAt) / 1000));
      const completedSession: SessionRecord = {
        ...currentSession,
        status: 'completed',
        endedAt: now,
        endHour: new Date(now).getHours(),
        actualDurationSec,
        pomodoroCyclesCompleted: newCycles,
      };
      // 先落库，即使用户在 postAssess 刷新也不会丢失整段专注
      saveSession(completedSession).catch((err) => {
        console.error('failed to save completed session', err);
      });
      stopInterruptionTracking();
      set({
        isRunning: false,
        pomodoroState: { ...pomodoroState, cyclesCompleted: newCycles },
        currentSession: completedSession,
      });
      savePersistedState(getPersistableState());
      return;
    }
    const newCycles = pomodoroState.mode === 'work'
      ? pomodoroState.cyclesCompleted + 1
      : pomodoroState.cyclesCompleted;
    const newState: PomodoroState = { ...pomodoroState, mode: newMode, cyclesCompleted: newCycles };
    set({
      pomodoroState: newState,
      remainingSec: getDurationSec(newState),
      currentSession: { ...currentSession, status: statusForMode(newMode), pomodoroCyclesCompleted: newCycles },
    });
    savePersistedState(getPersistableState());
  },

  skipBreak: () => {
    const { pomodoroState, currentSession } = get();
    if (!pomodoroState || !currentSession || !canSkip(pomodoroState)) return;
    const newState: PomodoroState = { ...pomodoroState, mode: 'work' };
    set({
      pomodoroState: newState,
      remainingSec: getDurationSec(newState),
      currentSession: { ...currentSession, status: 'focusing' },
    });
    savePersistedState(getPersistableState());
  },

  endSession: async (postAssessment) => {
    const { currentSession } = get();
    if (!currentSession) return;
    stopInterruptionTracking();
    const final = endSessionRecord(currentSession, postAssessment);
    await saveSession(final);
    set({ currentSession: null, pomodoroState: null, remainingSec: 0, isRunning: false });
    savePersistedState(null);
  },
}));
