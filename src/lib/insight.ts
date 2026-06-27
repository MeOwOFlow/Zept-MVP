import type {
  SessionRecord,
  Insight,
  PomodoroState,
} from '../types/session';
import { saveInsight } from './db';
import { callLLM } from './llm';
import {
  shouldTriggerCareGate,
  shouldUseLLM,
  filterBlacklist,
  getConfidence,
  getFallbackInsight,
} from './rules';

function summarizeSessions(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return '无历史会话';
  return sessions
    .slice(0, 3)
    .map((s) => `${s.isPomodoro ? '番茄' : '自由'} ${Math.floor(s.actualDurationSec / 60)}分钟，中断${s.interruptions}次`)
    .join('；');
}

function summarizeInsights(insights: Insight[]): string {
  if (insights.length === 0) return '无';
  return insights.map((i) => i.text).join('；');
}

function summarizeCurrent(session: SessionRecord): string {
  const mood = session.postAssessment?.mood ?? 3;
  const focus = session.postAssessment?.focus ?? 3;
  return `${session.isPomodoro ? '番茄' : '自由'} ${Math.floor(session.actualDurationSec / 60)}分钟，中断${session.interruptions}次，情绪${mood}，专注${focus}`;
}

function makeInsightId(): string {
  return `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function generateInsight(
  currentSession: SessionRecord,
  recentSessions: SessionRecord[],
  usefulInsights: Insight[],
  mode: PomodoroState['mode'] = 'work',
): Promise<Insight> {
  const mood = currentSession.postAssessment?.mood ?? 3;
  const sessionId = currentSession.id;
  const now = Date.now();

  // 1. 关怀门：mood ≤ 2 → care 兜底
  if (shouldTriggerCareGate(mood)) {
    const fb = getFallbackInsight(mood, mode);
    const insight: Insight = {
      id: makeInsightId(),
      sessionId,
      createdAt: now,
      text: fb.text,
      source: 'care',
      confidence: 'low',
      feedback: null,
      mood,
    };
    await saveInsight(insight);
    return insight;
  }

  // 2. 数据充分性：不足 3 天 → template 兜底
  if (!shouldUseLLM(recentSessions)) {
    const fb = getFallbackInsight(mood, mode);
    const insight: Insight = {
      id: makeInsightId(),
      sessionId,
      createdAt: now,
      text: fb.text,
      source: 'template',
      confidence: getConfidence(recentSessions.length, false),
      feedback: null,
      mood,
    };
    await saveInsight(insight);
    return insight;
  }

  // 3. 调 LLM
  const result = await callLLM({
    goal: currentSession.goal,
    daysToExam: currentSession.daysToExam,
    recentSummary: summarizeSessions(recentSessions),
    usefulSummary: summarizeInsights(usefulInsights),
    curSummary: summarizeCurrent(currentSession),
    mood,
  });

  // 4. LLM 成功 + 黑名单通过 → source=llm
  if (result.success) {
    const filtered = filterBlacklist(result.text);
    if (filtered.clean) {
      const insight: Insight = {
        id: makeInsightId(),
        sessionId,
        createdAt: now,
        text: filtered.text,
        source: 'llm',
        confidence: getConfidence(recentSessions.length, true),
        feedback: null,
        mood,
      };
      await saveInsight(insight);
      return insight;
    }
  }

  // 5. LLM 失败/黑名单 → fallback
  const fb = getFallbackInsight(mood, mode);
  const insight: Insight = {
    id: makeInsightId(),
    sessionId,
    createdAt: now,
    text: fb.text,
    source: 'fallback',
    confidence: 'low',
    feedback: null,
    mood,
  };
  await saveInsight(insight);
  return insight;
}
