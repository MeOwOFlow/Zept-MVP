/**
 * @rn-status WEB-ONLY (persistence) / RN-READY (state logic with adapter injection)
 * Zustand 在 RN 可用。但当前实现强耦合：
 *   - localStorage 持久化（RN 需替换为 AsyncStorage 或 MMKV）
 *   - saveSession 依赖 Dexie/IndexedDB（RN 需替换为 WatermelonDB / SQLite）
 * RN 迁移时需将持久化层抽象为可注入的 storage adapter，store 逻辑本身可复用。
 */
import { create } from 'zustand';
import type { SessionRecord, SessionStatus, SelfAssessment, PomodoroState, Rating, BreakMood } from '../types/session';
import type { UserProfile } from '../types/user';
import { saveSession } from '../lib/db';
import { createPomodoroState, nextMode, getDurationSec, tick as pomodoroTick, canSkip } from '../lib/pomodoro';
import { createSession, startInterruptionTracking, stopInterruptionTracking, endSession as endSessionRecord } from '../lib/session';
import { playChime, vibrate, notifyBackground } from '../lib/chime';

interface SessionStore {
  currentSession: SessionRecord | null;
  pomodoroState: PomodoroState | null;
  remainingSec: number;
  isRunning: boolean;
  interruptions: number;
  lastPersistedAt: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
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

const PERSIST_INTERVAL_MS = 5000;

const initialState = loadPersistedState();

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSession: initialState?.currentSession ?? null,
  pomodoroState: initialState?.pomodoroState ?? null,
  remainingSec: initialState?.remainingSec ?? 0,
  isRunning: false,
  interruptions: initialState?.interruptions ?? 0,
  lastPersistedAt: 0,
  soundEnabled: true,
  vibrationEnabled: true,

  startSession: (user, isPomodoro) => {
    const session = createSession(user, isPomodoro);
    const pomodoroState = isPomodoro && user.pomodoroConfig
      ? createPomodoroState(user.pomodoroConfig)
      : null;
    const remainingSec = pomodoroState ? getDurationSec(pomodoroState) : 0;
    set({
      currentSession: { ...session, status: 'focusing' },
      pomodoroState, remainingSec, isRunning: true, interruptions: 0,
      soundEnabled: user.soundEnabled ?? true,
      vibrationEnabled: user.vibrationEnabled ?? true,
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
    set({ lastPersistedAt: Date.now() });
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
    set({ lastPersistedAt: Date.now() });
  },

  resumeSession: () => {
    const cs = get().currentSession;
    if (!cs) return;
    set({ isRunning: true, currentSession: { ...cs, status: 'focusing' } });
    savePersistedState(getPersistableState());
    set({ lastPersistedAt: Date.now() });
  },

  tick: () => {
    const { isRunning, pomodoroState, remainingSec, currentSession } = get();
    if (!isRunning || !currentSession) return;
    // 自由模式（无番茄状态）：正计时，remainingSec 递增作为已过时长
    if (!pomodoroState) {
      set({ remainingSec: remainingSec + 1 });
      const now = Date.now();
      if (now - get().lastPersistedAt >= PERSIST_INTERVAL_MS) {
        savePersistedState(getPersistableState());
        set({ lastPersistedAt: now });
      }
      return;
    }
    const total = getDurationSec(pomodoroState);
    const elapsed = total - remainingSec + 1;
    const result = pomodoroTick(pomodoroState, elapsed);
    if (!result.isComplete) {
      set({ remainingSec: result.remainingSec });
      // 节流持久化：5 秒写一次 localStorage，减少每秒写盘开销
      const now = Date.now();
      if (now - get().lastPersistedAt >= PERSIST_INTERVAL_MS) {
        savePersistedState(getPersistableState());
        set({ lastPersistedAt: now });
      }
      return;
    }
    const newMode = nextMode(pomodoroState);
    if (newMode === 'done') {
      const newCycles = pomodoroState.cyclesCompleted + 1;
      const now = Date.now();
      const actualDurationSec = Math.max(0, Math.round((now - currentSession.startedAt) / 1000));
      // 全部完成：C-E-G 琶音 + 振动 + 后台通知
      const { soundEnabled, vibrationEnabled } = get();
      playChime("all-done", soundEnabled);
      vibrate(vibrationEnabled);
      notifyBackground("专注完成", "今天的番茄钟全部完成了，辛苦了");
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
    // 阶段切换提示音 + 振动 + 后台通知
    const { soundEnabled, vibrationEnabled } = get();
    if (newMode === 'short_break') {
      playChime("work-to-break", soundEnabled);
      vibrate(vibrationEnabled);
      notifyBackground("专注结束", "可以休息一下了");
    } else if (newMode === 'work') {
      playChime("break-to-work", soundEnabled);
      vibrate(vibrationEnabled);
      notifyBackground("休息结束", "回到专注吧");
    }
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
    set({ currentSession: null, pomodoroState: null, remainingSec: 0, isRunning: false, lastPersistedAt: Date.now() });
    savePersistedState(null);
  },
}));
