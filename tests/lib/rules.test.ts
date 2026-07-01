import { describe, it, expect } from 'vitest';
import {
  BLACKLIST_WORDS,
  CARE_GATE_RESOURCES,
  shouldUseLLM,
  shouldTriggerCareGate,
  filterBlacklist,
  getConfidence,
  getFallbackInsight,
} from '../../src/lib/rules';
import type { SessionRecord } from '../../src/types/session';

const makeSession = (daysAgo: number): SessionRecord => ({
  id: `s_${daysAgo}`,
  userId: 'local',
  goal: '考研',
  daysToExam: 60,
  startedAt: Date.now() - daysAgo * 86400000,
  endedAt: null,
  status: 'completed',
  plannedDurationSec: 1500,
  actualDurationSec: 1500,
  isPomodoro: true,
  pomodoroCyclesCompleted: 1,
  interruptions: 0,
  interruptionEvents: [],
  startHour: 10,
  endHour: 10,
  preAssessment: null,
  postAssessment: null,
});

describe('BLACKLIST_WORDS', () => {
  it('包含必要的敏感词', () => {
    expect(BLACKLIST_WORDS).toContain('抑郁');
    expect(BLACKLIST_WORDS).toContain('焦虑症');
    expect(BLACKLIST_WORDS).toContain('诊断');
    expect(BLACKLIST_WORDS).toContain('治疗');
    expect(BLACKLIST_WORDS).toContain('处方');
  });
});

describe('CARE_GATE_RESOURCES', () => {
  it('包含咨询中心与热线', () => {
    expect(CARE_GATE_RESOURCES.counseling).toBe('校心理咨询中心');
    expect(CARE_GATE_RESOURCES.hotline).toBe('12356 心理援助热线');
  });
});

describe('shouldUseLLM', () => {
  it('数据 < 3 天也返回 true（放宽门槛，首次即可调LLM）', () => {
    expect(shouldUseLLM([makeSession(1), makeSession(2)])).toBe(true);
  });
  it('数据 >= 3 天返回 true', () => {
    expect(shouldUseLLM([makeSession(1), makeSession(2), makeSession(3)])).toBe(true);
  });
  it('空数据也返回 true（首次专注即调LLM）', () => {
    expect(shouldUseLLM([])).toBe(true);
  });
});

describe('shouldTriggerCareGate', () => {
  it('mood <= 2 触发', () => {
    expect(shouldTriggerCareGate(1)).toBe(true);
    expect(shouldTriggerCareGate(2)).toBe(true);
  });
  it('mood >= 3 不触发', () => {
    expect(shouldTriggerCareGate(3)).toBe(false);
    expect(shouldTriggerCareGate(5)).toBe(false);
  });
});

describe('filterBlacklist', () => {
  it('命中黑名单返回 clean:false 且清空文本', () => {
    expect(filterBlacklist('你可能患有抑郁症')).toEqual({ clean: false, text: '' });
    expect(filterBlacklist('建议就医检查')).toEqual({ clean: false, text: '' });
  });
  it('干净文本原样返回', () => {
    expect(filterBlacklist('今天专注表现不错')).toEqual({ clean: true, text: '今天专注表现不错' });
  });
});

describe('getConfidence', () => {
  it('low：会话数 < 3', () => {
    expect(getConfidence(0, false)).toBe('low');
    expect(getConfidence(2, true)).toBe('low');
  });
  it('medium：3 <= 会话数 < 7', () => {
    expect(getConfidence(3, false)).toBe('medium');
    expect(getConfidence(6, true)).toBe('medium');
  });
  it('high：会话数 >= 7 且 LLM 成功', () => {
    expect(getConfidence(7, true)).toBe('high');
  });
  it('LLM 失败时至多 medium', () => {
    expect(getConfidence(20, false)).toBe('medium');
  });
});

describe('getFallbackInsight', () => {
  it('low mood (<=2) 包含关怀资源出口', () => {
    const t = getFallbackInsight(1, 'work');
    expect(t.text).toContain(CARE_GATE_RESOURCES.counseling);
    expect(t.text).toContain(CARE_GATE_RESOURCES.hotline);
    expect(t.source).toBe('care');
  });
  it('low mood 不含任何黑名单词', () => {
    const t = getFallbackInsight(2, 'work');
    for (const w of BLACKLIST_WORDS) {
      expect(t.text).not.toContain(w);
    }
  });
  it('mid mood (3) 返回鼓励语', () => {
    const t = getFallbackInsight(3, 'work');
    expect(t.text).toMatch(/坚持|进步|状态/);
    expect(t.source).toBe('template');
  });
  it('high mood (>=4) 返回正向语', () => {
    const t = getFallbackInsight(5, 'work');
    expect(t.text.length).toBeGreaterThan(5);
    expect(t.source).toBe('template');
  });
});
