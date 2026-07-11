/**
 * @rn-status RN-READY-WITH-CONFIG
 * 业务编排层，本身不依赖 DOM。依赖 db.ts（saveInsight）与 llm.ts（callLLM），
 * 这两个文件迁移后即可在 RN 直接复用。
 */
import type {
  SessionRecord,
  Insight,
  SessionInsightMode,
} from '../types/session';
import type { ReplyStyle } from '../types/user';
import { saveInsight } from './db';
import { callLLM } from './llm';
import {
  shouldTriggerCareGate,
  shouldUseLLM,
  filterBlacklist,
  getConfidence,
  getFallbackInsight,
  CARE_GATE_RESOURCES,
} from './rules';

function fmtLeave(count: number, totalMs: number, longestMs: number): string {
  if (count === 0) return '未离开';
  const totalSec = Math.round(totalMs / 1000);
  const longestSec = Math.round(longestMs / 1000);
  const t = totalSec >= 60 ? `${Math.floor(totalSec / 60)}分${totalSec % 60}秒` : `${totalSec}秒`;
  const l = longestSec >= 60 ? `${Math.floor(longestSec / 60)}分${longestSec % 60}秒` : `${longestSec}秒`;
  return `离开${count}次共${t}，最长${l}`;
}

function leaveInfo(s: SessionRecord): { count: number; totalMs: number; longestMs: number } {
  const events = s.interruptionEvents ?? [];
  const totalMs = events.reduce((sum, e) => sum + e.durationMs, 0);
  const longestMs = events.length > 0 ? Math.max(...events.map((e) => e.durationMs)) : 0;
  return { count: s.interruptions, totalMs, longestMs };
}

function summarizeSessions(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return '无历史会话';
  return sessions
    .slice(0, 3)
    .map((s) => {
      const { count, totalMs, longestMs } = leaveInfo(s);
      return `${s.isPomodoro ? '番茄' : '自由'} ${Math.floor(s.actualDurationSec / 60)}分钟，${fmtLeave(count, totalMs, longestMs)}`;
    })
    .join('；');
}

function summarizeInsights(insights: Insight[]): string {
  if (insights.length === 0) return '无';
  return insights.map((i) => i.text).join('；');
}

function summarizeBreakMoods(session: SessionRecord): string {
  const moods = session.breakMoods ?? [];
  if (moods.length === 0) return '休息期间无情绪采样';
  const vals = moods.map((m) => m.mood).join('→');
  return `休息间情绪采样：${vals}`;
}

function summarizeDistractions(distractions: string[] | undefined): string {
  if (!distractions || distractions.length === 0) return '未记录容易分心项';
  return `容易分心：${distractions.join('、')}`;
}

function summarizeCurrent(session: SessionRecord): string {
  const mood = session.postAssessment?.mood ?? 3;
  const focus = session.postAssessment?.focus ?? 3;
  const { count, totalMs, longestMs } = leaveInfo(session);
  return `${session.isPomodoro ? '番茄' : '自由'} ${Math.floor(session.actualDurationSec / 60)}分钟，${fmtLeave(count, totalMs, longestMs)}，${summarizeBreakMoods(session)}，${summarizeDistractions(session.topDistractions)}，后评情绪${mood}，专注${focus}`;
}

function makeInsightId(): string {
  return `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function generateInsight(
  currentSession: SessionRecord,
  recentSessions: SessionRecord[],
  usefulInsights: Insight[],
  mode: SessionInsightMode = 'work',
  replyStyle: ReplyStyle = 'balanced',
): Promise<Insight> {
  const mood = currentSession.postAssessment?.mood ?? 3;
  const sessionId = currentSession.id;
  const now = Date.now();

  // 1. 关怀门：mood ≤ 2 → 尝试 LLM careMode，失败则兜底
  if (shouldTriggerCareGate(mood)) {
    try {
      const result = await callLLM({
        goal: currentSession.goal,
        daysToExam: currentSession.daysToExam,
        recentSummary: summarizeSessions(recentSessions),
        usefulSummary: summarizeInsights(usefulInsights),
        curSummary: summarizeCurrent(currentSession),
        mood,
        careMode: true,
        replyStyle,
      });

      if (result.success) {
        const filtered = filterBlacklist(result.text);
        const hasResources =
          filtered.text.includes(CARE_GATE_RESOURCES.counseling) &&
          filtered.text.includes(CARE_GATE_RESOURCES.hotline.replace(/ .*/, ''));
        if (filtered.clean && hasResources) {
          const insight: Insight = {
            id: makeInsightId(),
            sessionId,
            createdAt: now,
            text: filtered.text,
            source: 'care-llm',
            confidence: 'low',
            feedback: null,
            mood,
          };
          await saveInsight(insight);
          return insight;
        }
      }
    } catch {
      // 任何异常都落回兜底
    }

    const fb = getFallbackInsight(mood, mode, currentSession);
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
    const fb = getFallbackInsight(mood, mode, currentSession);
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
    replyStyle,
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
  const fb = getFallbackInsight(mood, mode, currentSession);
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
