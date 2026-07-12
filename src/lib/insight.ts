/**
 * @rn-status RN-READY-WITH-CONFIG
 * 业务编排层，本身不依赖 DOM。依赖 db.ts（saveInsight）与 llm.ts（callLLM），
 * 这两个文件迁移后即可在 RN 直接复用。
 */
import type {
  SessionRecord,
  Insight,
  SessionInsightMode,
  Rating,
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

const SCORE_LABELS = ['', '很差', '较差', '一般', '不错', '很好'] as const;

/**
 * 从最近 N 次会话计算趋势摘要。
 * sessions 为 newest-first（getRecentSessions 返回顺序），内部 reverse 为时间顺序。
 * 将会话分前后两半，比较情绪/专注/离开的方向变化。
 */
function summarizeTrend(sessions: SessionRecord[]): string {
  const chrono = [...sessions].reverse();
  if (chrono.length < 2) return '';

  const half = Math.floor(chrono.length / 2);
  const older = chrono.slice(0, half);
  const newer = chrono.slice(half);

  const avg = (arr: SessionRecord[], field: 'mood' | 'focus'): number => {
    const vals = arr
      .map((s) => s.postAssessment?.[field])
      .filter((v): v is Rating => v !== undefined && v !== null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const oldMood = avg(older, 'mood');
  const newMood = avg(newer, 'mood');
  const oldFocus = avg(older, 'focus');
  const newFocus = avg(newer, 'focus');
  const oldInterrupts = older.reduce((sum, s) => sum + s.interruptions, 0);
  const newInterrupts = newer.reduce((sum, s) => sum + s.interruptions, 0);

  const parts: string[] = [];
  const threshold = 0.3;

  if (oldMood > 0 && newMood > 0) {
    const dir = newMood > oldMood + threshold ? '回升' : newMood < oldMood - threshold ? '走低' : '平稳';
    parts.push(`情绪${dir}`);
  }
  if (oldFocus > 0 && newFocus > 0) {
    const dir = newFocus > oldFocus + threshold ? '提升' : newFocus < oldFocus - threshold ? '下滑' : '稳定';
    parts.push(`专注${dir}`);
  }
  if (oldInterrupts !== newInterrupts) {
    parts.push(newInterrupts < oldInterrupts ? '离开减少' : '离开增多');
  }

  if (parts.length === 0) return '';
  return `趋势：最近${chrono.length}次，${parts.join('，')}`;
}

function summarizeSessions(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return '无历史会话';
  const detail = sessions
    .slice(0, 3)
    .map((s) => {
      const { count, totalMs, longestMs } = leaveInfo(s);
      const mood = s.postAssessment?.mood;
      const focus = s.postAssessment?.focus;
      const moodLabel = mood ? `情绪${SCORE_LABELS[mood]}` : '未评情绪';
      const focusLabel = focus ? `专注${SCORE_LABELS[focus]}` : '未评专注';
      return `${s.isPomodoro ? '番茄' : '自由'} ${Math.floor(s.actualDurationSec / 60)}分钟，${fmtLeave(count, totalMs, longestMs)}，${moodLabel}，${focusLabel}`;
    })
    .join('；');
  const trend = summarizeTrend(sessions);
  return trend ? `${detail}。${trend}` : detail;
}

function summarizeInsights(insights: Insight[]): string {
  if (insights.length === 0) return '无';
  return insights
    .map((i) => `${i.text}（当时情绪${SCORE_LABELS[i.mood] ?? '未知'}）`)
    .join('；');
}

function summarizeBreakMoods(session: SessionRecord): string {
  const moods = session.breakMoods ?? [];
  if (moods.length === 0) return '休息期间无情绪采样';
  const vals = moods.map((m) => m.mood ? SCORE_LABELS[m.mood] : '未答').join('→');
  return `休息间情绪采样：${vals}`;
}

function summarizeDistractions(distractions: string[] | undefined): string {
  if (!distractions || distractions.length === 0) return '未记录容易分心项';
  return `容易分心：${distractions.join('、')}`;
}

function summarizeCurrent(session: SessionRecord): string {
  const mood = session.postAssessment?.mood ?? 3;
  const focus = session.postAssessment?.focus ?? 3;
  const preMood = session.preAssessment?.mood;
  const preMoodLabel = preMood ? `起始情绪${SCORE_LABELS[preMood]}` : '无起始情绪';
  const { count, totalMs, longestMs } = leaveInfo(session);
  return `${session.isPomodoro ? '番茄' : '自由'} ${Math.floor(session.actualDurationSec / 60)}分钟，${fmtLeave(count, totalMs, longestMs)}，${summarizeBreakMoods(session)}，${summarizeDistractions(session.topDistractions)}，${preMoodLabel}，后评情绪${SCORE_LABELS[mood]}，专注${SCORE_LABELS[focus]}`;
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
