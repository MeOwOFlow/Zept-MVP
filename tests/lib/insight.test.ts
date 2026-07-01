import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const saveInsightMock = vi.hoisted(() => vi.fn(async (_insight: Insight) => undefined));
vi.mock('../../src/lib/db', () => ({
  saveInsight: saveInsightMock,
}));

const callLLMMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/llm', () => ({
  callLLM: callLLMMock,
}));

import { generateInsight } from '../../src/lib/insight';
import type { SessionRecord, Insight } from '../../src/types/session';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-27T12:00:00Z').getTime();

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's_test',
    userId: 'local',
    goal: '考研',
    daysToExam: 100,
    startedAt: NOW - 1800_000,
    endedAt: NOW,
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
    ...overrides,
  };
}

function makeOldSession(daysAgo: number): SessionRecord {
  return makeSession({
    id: `s_old_${daysAgo}`,
    startedAt: NOW - daysAgo * DAY_MS,
    endedAt: NOW - daysAgo * DAY_MS + 1800_000,
  });
}

const usefulInsights: Insight[] = [
  {
    id: 'i_1', sessionId: 's_x', createdAt: NOW - 1 * DAY_MS,
    text: '上午专注度更高', source: 'llm', confidence: 'high',
    feedback: 'useful', mood: 4,
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  saveInsightMock.mockClear();
  callLLMMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateInsight', () => {
  it('mood ≤ 2 触发关怀门，LLM 成功时 source=care-llm', async () => {
    callLLMMock.mockResolvedValue({
      success: true,
      text: '现在不容易，累了就歇会儿。可以找校心理咨询中心聊聊，或拨打12356心理援助热线。',
    });
    const session = makeSession({ postAssessment: { mood: 2, focus: 2 } });
    const insight = await generateInsight(session, [makeOldSession(5)], usefulInsights);
    expect(insight.source).toBe('care-llm');
    expect(insight.mood).toBe(2);
    expect(insight.text).toContain('心理咨询中心');
    expect(insight.text).toContain('12356');
    expect(callLLMMock).toHaveBeenCalledTimes(1);
    expect(saveInsightMock).toHaveBeenCalledTimes(1);
  });

  it('mood ≤ 2 但 LLM 输出缺资源 → 落回 source=care 兜底', async () => {
    callLLMMock.mockResolvedValue({ success: true, text: '今天辛苦了，早点休息。' });
    const session = makeSession({ postAssessment: { mood: 1, focus: 1 } });
    const insight = await generateInsight(session, [makeOldSession(5)], usefulInsights);
    expect(insight.source).toBe('care');
    expect(insight.text).toContain('心理咨询中心');
    expect(insight.text).toContain('12356');
    expect(saveInsightMock).toHaveBeenCalledTimes(1);
  });

  it('无历史会话也调 LLM（首次专注即有真实洞察）', async () => {
    callLLMMock.mockResolvedValue({ success: true, text: '首次专注25分钟零离开，节奏稳健。' });
    const session = makeSession();
    const insight = await generateInsight(session, [], usefulInsights);
    expect(insight.source).toBe('llm');
    expect(callLLMMock).toHaveBeenCalledTimes(1);
  });

  it('LLM 成功 → source=llm', async () => {
    callLLMMock.mockResolvedValue({ success: true, text: '你上午专注度更高' });
    const session = makeSession();
    const insight = await generateInsight(session, [makeOldSession(5)], usefulInsights);
    expect(insight.source).toBe('llm');
    expect(insight.text).toBe('你上午专注度更高');
  });

  it('LLM 返回黑名单词 → source=fallback', async () => {
    callLLMMock.mockResolvedValue({ success: true, text: '建议就医检查' });
    const session = makeSession();
    const insight = await generateInsight(session, [makeOldSession(5)], usefulInsights);
    expect(insight.source).toBe('fallback');
  });

  it('LLM 失败 → source=fallback', async () => {
    callLLMMock.mockResolvedValue({ success: false, text: '', error: 'timeout' });
    const session = makeSession();
    const insight = await generateInsight(session, [makeOldSession(5)], usefulInsights);
    expect(insight.source).toBe('fallback');
    expect(insight.confidence).toBe('low');
  });

  it('所有分支都调用 saveInsight 持久化', async () => {
    callLLMMock.mockResolvedValue({ success: true, text: '测试洞察' });
    const session = makeSession();
    await generateInsight(session, [makeOldSession(5)], usefulInsights);
    expect(saveInsightMock).toHaveBeenCalledTimes(1);
    const saved = saveInsightMock.mock.calls[0][0] as Insight;
    expect(saved.sessionId).toBe('s_test');
  });
});
