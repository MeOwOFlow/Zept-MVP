import { describe, it, expect } from 'vitest';
import { suggestNextRound, formatNextRoundHint } from '../../src/lib/suggestion';
import type { SessionRecord } from '../../src/types/session';

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's_test',
    userId: 'local',
    goal: '考研',
    daysToExam: 100,
    startedAt: Date.now() - 1800_000,
    endedAt: Date.now(),
    status: 'completed',
    plannedDurationSec: 25 * 60,
    actualDurationSec: 25 * 60,
    isPomodoro: true,
    pomodoroCyclesCompleted: 1,
    interruptions: 0,
    interruptionEvents: [],
    startHour: 11,
    endHour: 12,
    preAssessment: null,
    postAssessment: { mood: 4, focus: 4 },
    breakMoods: [],
    ...overrides,
  };
}

describe('suggestNextRound', () => {
  it('离开 ≥ 3 次 → shorter，建议 20 分钟', () => {
    const session = makeSession({
      interruptions: 3,
      interruptionEvents: [
        { recoveredAt: 1, durationMs: 5000 },
        { recoveredAt: 2, durationMs: 5000 },
        { recoveredAt: 3, durationMs: 5000 },
      ],
      postAssessment: { mood: 4, focus: 4 },
    });
    const hint = suggestNextRound(session, '');
    expect(hint.kind).toBe('shorter');
    expect(hint.targetWorkMin).toBe(20);
    expect(hint.reason).toBe('leaves_or_low_focus');
  });

  it('focus ≤ 2 → shorter（即使零离开）', () => {
    const session = makeSession({
      interruptions: 0,
      interruptionEvents: [],
      postAssessment: { mood: 4, focus: 2 },
    });
    const hint = suggestNextRound(session, '');
    expect(hint.kind).toBe('shorter');
    expect(hint.targetWorkMin).toBe(20);
  });

  it('零离开 + focus ≥ 4 + 趋势不含下滑 → keep', () => {
    const session = makeSession({
      interruptions: 0,
      interruptionEvents: [],
      postAssessment: { mood: 4, focus: 5 },
    });
    const hint = suggestNextRound(session, '趋势：最近4次，情绪回升，专注稳定');
    expect(hint.kind).toBe('keep');
    expect(hint.reason).toBe('stable_high_focus');
  });

  it('趋势含下滑时不触发 keep（即使零离开高专注）', () => {
    const session = makeSession({
      interruptions: 0,
      interruptionEvents: [],
      postAssessment: { mood: 4, focus: 5 },
    });
    const hint = suggestNextRound(session, '趋势：最近4次，专注下滑');
    expect(hint.kind).not.toBe('keep');
  });

  it('休息情绪采样后 > 前 → break_more，建议 7 分钟', () => {
    const session = makeSession({
      interruptions: 1,
      interruptionEvents: [{ recoveredAt: 1, durationMs: 5000 }],
      postAssessment: { mood: 3, focus: 3 },
      breakMoods: [
        { cycleIndex: 0, mood: 1, timestamp: 1 },
        { cycleIndex: 1, mood: 3, timestamp: 2 },
      ],
    });
    const hint = suggestNextRound(session, '');
    expect(hint.kind).toBe('break_more');
    expect(hint.targetBreakMin).toBe(7);
    expect(hint.reason).toBe('break_recovering');
  });

  it('休息情绪采样前 > 后 → 不触发 break_more', () => {
    const session = makeSession({
      interruptions: 1,
      interruptionEvents: [{ recoveredAt: 1, durationMs: 5000 }],
      postAssessment: { mood: 3, focus: 3 },
      breakMoods: [
        { cycleIndex: 0, mood: 3, timestamp: 1 },
        { cycleIndex: 1, mood: 1, timestamp: 2 },
      ],
    });
    const hint = suggestNextRound(session, '');
    expect(hint.kind).not.toBe('break_more');
  });

  it('无明确信号 → null', () => {
    const session = makeSession({
      interruptions: 1,
      interruptionEvents: [{ recoveredAt: 1, durationMs: 5000 }],
      postAssessment: { mood: 3, focus: 3 },
      breakMoods: [],
    });
    const hint = suggestNextRound(session, '');
    expect(hint.kind).toBeNull();
    expect(hint.reason).toBe('no_clear_signal');
  });

  it('接受 userPattern 参数但不影响判断（MVP 预留）', () => {
    const session = makeSession({
      interruptions: 3,
      interruptionEvents: [
        { recoveredAt: 1, durationMs: 5000 },
        { recoveredAt: 2, durationMs: 5000 },
        { recoveredAt: 3, durationMs: 5000 },
      ],
    });
    const pattern = {
      typicalWorkDurationMin: 30,
      typicalBreakMin: 5,
      peakHours: [14, 15],
      moodBaseline: 4,
      focusBaseline: 4,
      leaveRatePerSession: 0.5,
      preferredMode: 'pomodoro' as const,
      usefulTopics: ['上午专注'],
      version: 1,
      updatedAt: Date.now(),
    };
    const hint = suggestNextRound(session, '', pattern);
    expect(hint.kind).toBe('shorter');
    // MVP 阶段 userPattern 不影响判断，只验证不报错
  });
});

describe('formatNextRoundHint', () => {
  it('shorter 带目标时长', () => {
    const text = formatNextRoundHint({
      kind: 'shorter',
      reason: 'leaves_or_low_focus',
      targetWorkMin: 20,
    });
    expect(text).toContain('20 分钟');
    expect(text).toContain('缩短');
  });

  it('keep 不带目标时长', () => {
    const text = formatNextRoundHint({
      kind: 'keep',
      reason: 'stable_high_focus',
    });
    expect(text).toContain('保持当前节奏');
  });

  it('break_more 带休息时长', () => {
    const text = formatNextRoundHint({
      kind: 'break_more',
      reason: 'break_recovering',
      targetBreakMin: 7,
    });
    expect(text).toContain('7 分钟');
    expect(text).toContain('休息');
  });

  it('null 返回空字符串', () => {
    const text = formatNextRoundHint({
      kind: null,
      reason: 'no_clear_signal',
    });
    expect(text).toBe('');
  });
});
