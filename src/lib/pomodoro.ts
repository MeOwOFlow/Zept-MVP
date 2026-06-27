import type { PomodoroState } from '../types/session';

export type PomodoroMode = PomodoroState['mode'];

export interface PomodoroConfig {
  workDurationMin?: number;
  shortBreakMin?: number;
}

export function createPomodoroState(config: PomodoroConfig = {}): PomodoroState {
  return {
    mode: 'work',
    cyclesCompleted: 0,
    workDurationMin: config.workDurationMin ?? 25,
    shortBreakMin: config.shortBreakMin ?? 5,
  };
}

export function nextMode(state: PomodoroState): PomodoroMode {
  return state.mode === 'work' ? 'short_break' : 'work';
}

export function getDurationSec(state: PomodoroState): number {
  return state.mode === 'work' ? state.workDurationMin * 60 : state.shortBreakMin * 60;
}

export interface TickResult {
  state: PomodoroState;
  remainingSec: number;
  isComplete: boolean;
}

export function tick(state: PomodoroState, elapsedSec: number): TickResult {
  const total = getDurationSec(state);
  const remainingSec = Math.max(0, total - elapsedSec);
  return { state, remainingSec, isComplete: remainingSec === 0 };
}

export function canSkip(state: PomodoroState): boolean {
  return state.mode === 'short_break';
}
