import type { PomodoroState } from '../types/session';

export type PomodoroMode = PomodoroState['mode'];

export interface PomodoroConfig {
  workDurationMin?: number;
  shortBreakMin?: number;
  longBreakMin?: number;
  longBreakEvery?: number;
}

export function createPomodoroState(config: PomodoroConfig = {}): PomodoroState {
  return {
    mode: 'work',
    cyclesCompleted: 0,
    workDurationMin: config.workDurationMin ?? 25,
    shortBreakMin: config.shortBreakMin ?? 5,
    longBreakMin: config.longBreakMin ?? 15,
    longBreakEvery: config.longBreakEvery ?? 4,
  };
}

export function nextMode(state: PomodoroState): PomodoroMode {
  if (state.mode === 'work') {
    if (state.longBreakEvery <= 0) return 'short_break';
    const nextCycle = state.cyclesCompleted + 1;
    return nextCycle % state.longBreakEvery === 0 ? 'long_break' : 'short_break';
  }
  return 'work';
}

export function getDurationSec(state: PomodoroState): number {
  switch (state.mode) {
    case 'work': return state.workDurationMin * 60;
    case 'short_break': return state.shortBreakMin * 60;
    case 'long_break': return state.longBreakMin * 60;
  }
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
  return state.mode === 'short_break' || state.mode === 'long_break';
}
