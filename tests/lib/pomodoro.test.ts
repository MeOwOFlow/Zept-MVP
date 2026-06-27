import { describe, it, expect } from 'vitest';
import {
  createPomodoroState,
  nextMode,
  getDurationSec,
  tick,
  canSkip,
  type PomodoroMode,
} from '../../src/lib/pomodoro';

describe('createPomodoroState', () => {
  it('默认 25/5/15，longBreakEvery=4，初始 work', () => {
    expect(createPomodoroState()).toEqual({
      mode: 'work',
      cyclesCompleted: 0,
      workDurationMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      longBreakEvery: 4,
    });
  });
  it('支持覆盖配置', () => {
    const s = createPomodoroState({ workDurationMin: 50, longBreakEvery: 3 });
    expect(s.workDurationMin).toBe(50);
    expect(s.longBreakEvery).toBe(3);
    expect(s.shortBreakMin).toBe(5);
  });
});

describe('nextMode', () => {
  it('work → short_break（cyclesCompleted=0）', () => {
    expect(nextMode(createPomodoroState())).toBe('short_break');
  });
  it('work → long_break（每 4 个周期）', () => {
    const s = { ...createPomodoroState(), cyclesCompleted: 3 };
    expect(nextMode(s)).toBe('long_break');
  });
  it('work → short_break（cyclesCompleted=1）', () => {
    const s = { ...createPomodoroState(), cyclesCompleted: 1 };
    expect(nextMode(s)).toBe('short_break');
  });
  it('short_break → work', () => {
    const s = { ...createPomodoroState(), mode: 'short_break' as PomodoroMode };
    expect(nextMode(s)).toBe('work');
  });
  it('long_break → work', () => {
    const s = { ...createPomodoroState(), mode: 'long_break' as PomodoroMode };
    expect(nextMode(s)).toBe('work');
  });
  it('longBreakEvery=0 关闭长休，work 永远 → short_break', () => {
    const s = { ...createPomodoroState({ longBreakEvery: 0 }), cyclesCompleted: 3 };
    expect(nextMode(s)).toBe('short_break');
  });
  it('自定义配置 work → long_break（每 3 轮）', () => {
    const s = { ...createPomodoroState({ longBreakEvery: 3 }), cyclesCompleted: 2 };
    expect(nextMode(s)).toBe('long_break');
  });
});

describe('getDurationSec', () => {
  it('work 模式返回 25*60', () => {
    expect(getDurationSec(createPomodoroState())).toBe(25 * 60);
  });
  it('short_break 返回 5*60', () => {
    expect(getDurationSec({ ...createPomodoroState(), mode: 'short_break' })).toBe(5 * 60);
  });
  it('long_break 返回 15*60', () => {
    expect(getDurationSec({ ...createPomodoroState(), mode: 'long_break' })).toBe(15 * 60);
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
    expect(canSkip({ ...createPomodoroState(), mode: 'long_break' })).toBe(true);
  });
});
