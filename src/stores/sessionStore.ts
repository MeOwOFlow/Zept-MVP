import { create } from 'zustand';
import type { SessionRecord, SessionStatus, SelfAssessment, PomodoroState } from '../types/session';
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
  pauseSession: () => void;
  resumeSession: () => void;
  tick: () => void;
  skipBreak: () => void;
  endSession: (postAssessment: SelfAssessment) => Promise<void>;
}

function statusForMode(mode: PomodoroState['mode']): SessionStatus {
  if (mode === 'work') return 'focusing';
  if (mode === 'long_break') return 'long_break';
  return 'break';
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  currentSession: null,
  pomodoroState: null,
  remainingSec: 0,
  isRunning: false,
  interruptions: 0,

  startSession: (user, isPomodoro) => {
    const session = createSession(user, isPomodoro);
    const pomodoroState = isPomodoro ? createPomodoroState() : null;
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
    });
  },

  pauseSession: () => {
    const cs = get().currentSession;
    if (!cs) return;
    set({ isRunning: false, currentSession: { ...cs, status: 'paused' } });
  },

  resumeSession: () => {
    const cs = get().currentSession;
    if (!cs) return;
    set({ isRunning: true, currentSession: { ...cs, status: 'focusing' } });
  },

  tick: () => {
    const { isRunning, pomodoroState, remainingSec, currentSession } = get();
    if (!isRunning || !pomodoroState || !currentSession) return;
    const total = getDurationSec(pomodoroState);
    const elapsed = total - remainingSec + 1;
    const result = pomodoroTick(pomodoroState, elapsed);
    if (!result.isComplete) {
      set({ remainingSec: result.remainingSec });
      return;
    }
    const newMode = nextMode(pomodoroState);
    const newCycles = pomodoroState.mode === 'work'
      ? pomodoroState.cyclesCompleted + 1
      : pomodoroState.cyclesCompleted;
    const newState: PomodoroState = { ...pomodoroState, mode: newMode, cyclesCompleted: newCycles };
    set({
      pomodoroState: newState,
      remainingSec: getDurationSec(newState),
      currentSession: { ...currentSession, status: statusForMode(newMode) },
    });
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
  },

  endSession: async (postAssessment) => {
    const { currentSession } = get();
    if (!currentSession) return;
    stopInterruptionTracking();
    const final = endSessionRecord(currentSession, postAssessment);
    await saveSession(final);
    set({ currentSession: null, pomodoroState: null, remainingSec: 0, isRunning: false });
  },
}));
