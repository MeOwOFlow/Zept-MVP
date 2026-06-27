import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSession,
  getSession,
  getRecentSessions,
  saveInsight,
  getInsight,
  getUsefulInsights,
  updateInsightFeedback,
  saveUser,
  getUser,
  clearAll,
  exportAll,
} from '../../src/lib/db';
import type { SessionRecord, Insight, UserProfile } from '../../src/types';

const mockSession = (id: string, startedAt: number): SessionRecord => ({
  id,
  userId: 'local',
  goal: '刷leetcode',
  daysToExam: 30,
  startedAt,
  endedAt: null,
  status: 'completed',
  plannedDurationSec: 1500,
  actualDurationSec: 1500,
  isPomodoro: true,
  pomodoroCyclesCompleted: 1,
  interruptions: 0,
  interruptionEvents: [],
  startHour: 9,
  endHour: 9,
  preAssessment: null,
  postAssessment: null,
});

const mockInsight = (id: string, sessionId: string, createdAt: number): Insight => ({
  id,
  sessionId,
  text: '上午专注度更高',
  source: 'llm',
  confidence: 'high',
  feedback: null,
  mood: 4,
  createdAt,
});

const mockUser = (): UserProfile => ({
  goal: '考研',
  examDate: '2026-12-21',
  topDistractions: ['手机', '微信'],
  onboarded: true,
  pomodoroConfig: { workDurationMin: 25, shortBreakMin: 5, targetCycles: 4 },
  theme: 'auto',
});

describe('db', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('saveSession 写入后 getSession 可读取', async () => {
    const session = mockSession('s1', 1000);
    await saveSession(session);
    const got = await getSession('s1');
    expect(got).toEqual(session);
  });

  it('getSession 不存在时返回 undefined', async () => {
    const got = await getSession('not-exist');
    expect(got).toBeUndefined();
  });

  it('getRecentSessions 按 startedAt 倒序返回前 N 条', async () => {
    await saveSession(mockSession('s1', 1000));
    await saveSession(mockSession('s2', 3000));
    await saveSession(mockSession('s3', 2000));
    const recent = await getRecentSessions(2);
    expect(recent.map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('saveInsight 写入后 getInsight 可读取', async () => {
    const insight = mockInsight('i1', 's1', 5000);
    await saveInsight(insight);
    const got = await getInsight('i1');
    expect(got).toEqual(insight);
  });

  it('getUsefulInsights 仅返回 feedback=useful 且按 createdAt 倒序', async () => {
    await saveInsight({ ...mockInsight('i1', 's1', 1000), feedback: 'useful' });
    await saveInsight({ ...mockInsight('i2', 's1', 2000), feedback: 'useless' });
    await saveInsight({ ...mockInsight('i3', 's1', 3000), feedback: 'useful' });
    const useful = await getUsefulInsights(5);
    expect(useful.map((i) => i.id)).toEqual(['i3', 'i1']);
  });

  it('updateInsightFeedback 更新反馈字段', async () => {
    await saveInsight(mockInsight('i1', 's1', 1000));
    await updateInsightFeedback('i1', 'useful');
    const got = await getInsight('i1');
    expect(got?.feedback).toBe('useful');
  });

  it('saveUser 写入后 getUser 读取（singleton）', async () => {
    await saveUser(mockUser());
    const got = await getUser();
    expect(got?.goal).toBe('考研');
    expect(got?.examDate).toBe('2026-12-21');
  });

  it('saveUser 多次写入只保留一条', async () => {
    await saveUser(mockUser());
    await saveUser({ ...mockUser(), goal: '高考' });
    const got = await getUser();
    expect(got?.goal).toBe('高考');
  });

  it('getUser 未初始化时返回 undefined', async () => {
    const got = await getUser();
    expect(got).toBeUndefined();
  });

  it('clearAll 清空所有表', async () => {
    await saveSession(mockSession('s1', 1000));
    await saveInsight(mockInsight('i1', 's1', 1000));
    await saveUser(mockUser());
    await clearAll();
    expect(await getSession('s1')).toBeUndefined();
    expect(await getInsight('i1')).toBeUndefined();
    expect(await getUser()).toBeUndefined();
  });

  it('exportAll 返回全部数据', async () => {
    await saveSession(mockSession('s1', 1000));
    await saveInsight(mockInsight('i1', 's1', 1000));
    await saveUser(mockUser());
    const all = await exportAll();
    expect(all.sessions).toHaveLength(1);
    expect(all.insights).toHaveLength(1);
    expect(all.user).toBeDefined();
  });
});
