import { describe, it, expect } from 'vitest';
import {
  createPomodoroState,
  nextMode,
  isLastWorkCycle,
  getDurationSec,
  tick,
  canSkip,
  type PomodoroMode,
} from '../../src/lib/pomodoro';

describe('createPomodoroState', () => {
  it('默认 25/5/4轮，初始 work', () => {
    expect(createPomodoroState()).toEqual({
      mode: 'work',
      cyclesCompleted: 0,
      workDurationMin: 25,
      shortBreakMin: 5,
      targetCycles: 4,
    });
  });
  it('支持覆盖配置', () => {
    const s = createPomodoroState({ workDurationMin: 50, shortBreakMin: 10, targetCycles: 6 });
    expect(s.workDurationMin).toBe(50);
    expect(s.shortBreakMin).toBe(10);
    expect(s.targetCycles).toBe(6);
  });
});

describe('isLastWorkCycle', () => {
  it('cyclesCompleted+1 >= targetCycles 时为 true', () => {
    const s = createPomodoroState({ targetCycles: 4 });
    expect(isLastWorkCycle(s)).toBe(false);
    expect(isLastWorkCycle({ ...s, cyclesCompleted: 3 })).toBe(true);
    expect(isLastWorkCycle({ ...s, cyclesCompleted: 2 })).toBe(false);
  });
});

describe('nextMode', () => {
  it('work → short_break（未到最后一轮）', () => {
    expect(nextMode(createPomodoroState())).toBe('short_break');
  });
  it('work → done（最后一轮完成）', () => {
    const s = { ...createPomodoroState(), cyclesCompleted: 3 };
    expect(nextMode(s)).toBe('done');
  });
  it('short_break → work', () => {
    const s = { ...createPomodoroState(), mode: 'short_break' as PomodoroMode };
    expect(nextMode(s)).toBe('work');
  });
});

describe('getDurationSec', () => {
  it('work 模式返回 25*60', () => {
    expect(getDurationSec(createPomodoroState())).toBe(25 * 60);
  });
  it('short_break 返回 5*60', () => {
    expect(getDurationSec({ ...createPomodoroState(), mode: 'short_break' })).toBe(5 * 60);
  });
});

describe('tick', () => {
  it('返回剩余秒数，未完成', () => {
    const r = tick(createPomodoroState(), 30);
    expect(r.remainingSec).toBe(25 * 60 - 30);
    expect(r.isComplete).toBe(false);
  });
  it('elapsed 达到 total 标记完成', () => {
    const r = tick(createPomodoroState(), 25 * 60);
    expect(r.isComplete).toBe(true);
    expect(r.remainingSec).toBe(0);
  });
  it('超出 total 时 remaining 钳制为 0', () => {
    const r = tick(createPomodoroState(), 25 * 60 + 100);
    expect(r.remainingSec).toBe(0);
    expect(r.isComplete).toBe(true);
  });
  it('不修改原 state（纯函数）', () => {
    const s = createPomodoroState();
    tick(s, 100);
    expect(s.cyclesCompleted).toBe(0);
  });
});

describe('canSkip', () => {
  it('work 阶段禁止跳过', () => {
    expect(canSkip(createPomodoroState())).toBe(false);
  });
  it('break 阶段允许跳过', () => {
    expect(canSkip({ ...createPomodoroState(), mode: 'short_break' })).toBe(true);
  });
});
