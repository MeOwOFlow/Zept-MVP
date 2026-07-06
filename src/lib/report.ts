/**
 * @rn-status RN-READY-WITH-CONFIG
 * 洞察日报/周报生成
 * lib 层，不依赖 React，为 RN 迁移预留
 *
 * 流程：
 * 1. 按时间范围筛选已完成会话
 * 2. 聚合统计（次数/时长/中断/情绪轨迹/连续天数/top 洞察）
 * 3. 调 LLM 生成报告文本
 * 4. 失败时降级为模板文案
 *
 * 持久化由 UI 层负责（PWA 用 localStorage，RN 用 AsyncStorage）
 */

import type { SessionRecord, Insight } from "../types/session";
import type { UserProfile } from "../types/user";
import { callReportLLM } from "./llm";
import { computeStreakDays } from "./streak";

export interface FocusReport {
  scope: "daily" | "weekly";
  periodKey: string;       // e.g., '2026-07-06' 或 '2026-W27'
  dateLabel: string;       // e.g., '2026年7月6日' 或 '2026年第27周'
  text: string;
  generatedAt: number;
  source: "llm" | "fallback";
  sessionsCount: number;
  totalDurationMin: number;
}

const MS_PER_DAY = 86_400_000;

// ---------- 时间范围 ----------

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ISO 日期：2026-07-06 */
export function getDailyPeriodKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 周键：2026-W27（按 ISO 8601 周一为起始） */
export function getWeeklyPeriodKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  // 调整到本周四（ISO 周以包含周四的年份为准）
  const day = d.getDay() || 7; // 0=Sunday → 7
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - day + 4);
  const year = thursday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / MS_PER_DAY + jan1.getDay() + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function formatDailyLabel(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatWeeklyLabel(ts: number = Date.now()): string {
  const key = getWeeklyPeriodKey(ts);
  const [year, week] = key.split("-W");
  return `${year}年第${parseInt(week, 10)}周`;
}

function getDailyRange(ts: number = Date.now()): { start: number; end: number } {
  const start = startOfDay(ts);
  return { start, end: start + MS_PER_DAY };
}

function getWeeklyRange(ts: number = Date.now()): { start: number; end: number } {
  const d = new Date(ts);
  const day = d.getDay() || 7; // 周日=7
  const monday = startOfDay(d.getTime() - (day - 1) * MS_PER_DAY);
  return { start: monday, end: monday + 7 * MS_PER_DAY };
}

// ---------- 数据聚合 ----------

function filterSessionsByRange(
  sessions: SessionRecord[],
  start: number,
  end: number,
): SessionRecord[] {
  return sessions.filter(
    (s) =>
      s.status === "completed" &&
      s.startedAt >= start &&
      s.startedAt < end,
  );
}

function extractMoodPoints(sessions: SessionRecord[]): number[] {
  const pts: number[] = [];
  for (const s of sessions) {
    if (s.preAssessment) pts.push(s.preAssessment.mood);
    for (const b of s.breakMoods) {
      if (b.mood !== null) pts.push(b.mood);
    }
    if (s.postAssessment) pts.push(s.postAssessment.mood);
  }
  return pts;
}

/** 情绪轨迹文案：3→4→5 稳步上升 / 4→4→4 平稳 / 无采样 */
function summarizeMoodTrend(sessions: SessionRecord[]): string {
  const pts = extractMoodPoints(sessions);
  if (pts.length === 0) return "无情绪采样";
  const arrow = pts.join("→");
  if (pts.length < 2) return arrow;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let trend: string;
  if (last - first >= 2) trend = "稳步上升";
  else if (last - first === 1) trend = "略有回升";
  else if (first - last >= 2) trend = "在走低";
  else if (first - last === 1) trend = "略有小幅下滑";
  else trend = "平稳";
  return `${arrow} ${trend}`;
}

function pickTopInsights(
  insights: Insight[],
  sessions: SessionRecord[],
  max = 3,
): string[] {
  const sessionIds = new Set(sessions.map((s) => s.id));
  // 期间内所有洞察，按时间倒序
  const inPeriod = insights
    .filter((i) => sessionIds.has(i.sessionId))
    .sort((a, b) => b.createdAt - a.createdAt);
  // 优先取标「有用」的，不足再用其他洞察补齐
  const useful = inPeriod.filter((i) => i.feedback === "useful");
  const others = inPeriod.filter((i) => i.feedback !== "useful");
  return [...useful, ...others].slice(0, max).map((i) => i.text);
}

// ---------- 降级文案 ----------

function fallbackDailyReport(
  sessions: SessionRecord[],
  streakDays: number,
  dateLabel: string,
): string {
  if (sessions.length === 0) {
    return `${dateLabel}，今天还没有专注记录。需要的时候，我在。`;
  }
  const totalMin = sessions.reduce((s, x) => s + x.actualDurationSec, 0);
  const min = Math.round(totalMin / 60);
  const streakHint =
    streakDays >= 2 ? ` 已经是第 ${streakDays} 天了。` : "";
  return `今天你完成了 ${sessions.length} 次专注，累计 ${min} 分钟。${streakHint}能这样持续着，已经很了不起了。明天见。`;
}

function fallbackWeeklyReport(
  sessions: SessionRecord[],
  streakDays: number,
  dateLabel: string,
): string {
  if (sessions.length === 0) {
    return `${dateLabel}，这周还没有专注记录。下周再开始，也没关系。`;
  }
  const totalMin = sessions.reduce((s, x) => s + x.actualDurationSec, 0);
  const hours = Math.round(totalMin / 3600);
  const min = Math.round(totalMin / 60);
  const dur = hours >= 1 ? `${hours} 小时` : `${min} 分钟`;
  const streakHint =
    streakDays >= 2 ? ` 已经连续 ${streakDays} 天。` : "";
  return `这周你完成了 ${sessions.length} 次专注，累计 ${dur}。${streakHint}一周下来，能看出你的坚持。下周继续，慢慢来。`;
}

// ---------- 主入口 ----------

interface ReportInput {
  sessions: SessionRecord[];
  insights: Insight[];
  profile: UserProfile;
  now?: number;
}

export async function generateDailyReport(input: ReportInput): Promise<FocusReport> {
  const now = input.now ?? Date.now();
  const { start, end } = getDailyRange(now);
  return generateReport({
    ...input,
    scope: "daily",
    start,
    end,
    now,
    fallback: fallbackDailyReport,
  });
}

export async function generateWeeklyReport(input: ReportInput): Promise<FocusReport> {
  const now = input.now ?? Date.now();
  const { start, end } = getWeeklyRange(now);
  return generateReport({
    ...input,
    scope: "weekly",
    start,
    end,
    now,
    fallback: fallbackWeeklyReport,
  });
}

interface GenerateReportArgs extends ReportInput {
  scope: "daily" | "weekly";
  start: number;
  end: number;
  now: number;
  fallback: (s: SessionRecord[], streak: number, label: string) => string;
}

async function generateReport(args: GenerateReportArgs): Promise<FocusReport> {
  const { sessions, insights, profile, scope, start, end, now, fallback } = args;
  const periodKey =
    scope === "daily" ? getDailyPeriodKey(now) : getWeeklyPeriodKey(now);
  const dateLabel =
    scope === "daily" ? formatDailyLabel(now) : formatWeeklyLabel(now);

  const periodSessions = filterSessionsByRange(sessions, start, end);
  const totalDurationSec = periodSessions.reduce(
    (s, x) => s + x.actualDurationSec,
    0,
  );
  const totalDurationMin = Math.round(totalDurationSec / 60);
  const interruptions = periodSessions.reduce((s, x) => s + x.interruptions, 0);
  const moodTrend = summarizeMoodTrend(periodSessions);
  const streakDays = computeStreakDays(sessions, now);
  const topInsights = pickTopInsights(insights, periodSessions);

  // 无会话也允许生成（陪伴文案）
  const result = await callReportLLM({
    scope,
    goal: profile.goal,
    daysToExam: profile.examDate
      ? Math.max(0, Math.round((new Date(profile.examDate + "T00:00:00").getTime() - startOfDay(now)) / MS_PER_DAY))
      : 0,
    dateLabel,
    sessionsCount: periodSessions.length,
    totalDurationMin,
    interruptions,
    moodTrend,
    streakDays,
    topInsights,
    replyStyle: profile.replyStyle,
  });

  if (result.success) {
    return {
      scope,
      periodKey,
      dateLabel,
      text: result.text,
      generatedAt: now,
      source: "llm",
      sessionsCount: periodSessions.length,
      totalDurationMin,
    };
  }

  return {
    scope,
    periodKey,
    dateLabel,
    text: fallback(periodSessions, streakDays, dateLabel),
    generatedAt: now,
    source: "fallback",
    sessionsCount: periodSessions.length,
    totalDurationMin,
  };
}
