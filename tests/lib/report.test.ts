import { describe, it, expect, vi, beforeEach } from "vitest";

const callReportLLMMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/llm", () => ({
  callReportLLM: callReportLLMMock,
}));

import {
  generateDailyReport,
  generateWeeklyReport,
  getDailyPeriodKey,
  getWeeklyPeriodKey,
  formatDailyLabel,
  formatWeeklyLabel,
} from "../../src/lib/report";
import type { SessionRecord } from "../../src/types/session";
import type { UserProfile } from "../../src/types/user";

const NOW = new Date("2026-07-08T10:00:00+08:00").getTime(); // 周三，本周还有前两天数据
const DAY_MS = 86_400_000;

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s_test",
    userId: "local",
    goal: "考研",
    daysToExam: 30,
    startedAt: NOW - 1500_000,
    endedAt: NOW,
    status: "completed",
    plannedDurationSec: 25 * 60,
    actualDurationSec: 25 * 60,
    isPomodoro: true,
    pomodoroCyclesCompleted: 1,
    interruptions: 0,
    interruptionEvents: [],
    startHour: 9,
    endHour: 10,
    preAssessment: null,
    postAssessment: { mood: 4, focus: 4 },
    breakMoods: [],
    ...overrides,
  };
}

const baseProfile: UserProfile = {
  goal: "考研",
  examDate: "2026-08-15",
  topDistractions: [],
  onboarded: true,
  pomodoroConfig: null,
  theme: "auto",
  replyStyle: "balanced",
};

beforeEach(() => {
  callReportLLMMock.mockReset();
});

describe("period key helpers", () => {
  it("getDailyPeriodKey 返回 YYYY-MM-DD", () => {
    const ts = new Date("2026-07-06T15:30:00+08:00").getTime();
    expect(getDailyPeriodKey(ts)).toBe("2026-07-06");
  });

  it("getWeeklyPeriodKey 返回 YYYY-Www（ISO 周）", () => {
    // 2026-07-06 是周一，属于 2026-W28
    const ts = new Date("2026-07-06T10:00:00+08:00").getTime();
    expect(getWeeklyPeriodKey(ts)).toBe("2026-W28");
  });

  it("formatDailyLabel 中文长格式", () => {
    const ts = new Date("2026-07-06T10:00:00+08:00").getTime();
    expect(formatDailyLabel(ts)).toBe("2026年7月6日");
  });

  it("formatWeeklyLabel 中文长格式", () => {
    const ts = new Date("2026-07-06T10:00:00+08:00").getTime();
    expect(formatWeeklyLabel(ts)).toBe("2026年第28周");
  });

  it("getWeeklyPeriodKey 跨年边界：2027-01-01 周五属于 2026-W53", () => {
    const ts = new Date("2027-01-01T10:00:00+08:00").getTime();
    expect(getWeeklyPeriodKey(ts)).toBe("2026-W53");
  });

  it("getWeeklyPeriodKey 跨年边界：2025-01-01 周三属于 2025-W01", () => {
    const ts = new Date("2025-01-01T10:00:00+08:00").getTime();
    expect(getWeeklyPeriodKey(ts)).toBe("2025-W01");
  });

  it("getWeeklyPeriodKey 跨年边界：2024-12-30 周一属于 2025-W01", () => {
    const ts = new Date("2024-12-30T10:00:00+08:00").getTime();
    expect(getWeeklyPeriodKey(ts)).toBe("2025-W01");
  });
});

describe("generateDailyReport - LLM 成功", () => {
  it("聚合今日会话并调 LLM", async () => {
    callReportLLMMock.mockResolvedValue({
      success: true,
      text: "今天你三次专注都稳稳的，已经是第4天了。",
    });

    const sessions = [
      makeSession({ id: "s1", startedAt: NOW - 1000, actualDurationSec: 1500 }),
      makeSession({ id: "s2", startedAt: NOW - 500, actualDurationSec: 1500 }),
    ];
    const report = await generateDailyReport({
      sessions,
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    expect(report.source).toBe("llm");
    expect(report.scope).toBe("daily");
    expect(report.sessionsCount).toBe(2);
    expect(report.totalDurationMin).toBe(50); // 3000s / 60
    expect(report.text).toContain("第4天");
    expect(callReportLLMMock).toHaveBeenCalledTimes(1);

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.scope).toBe("daily");
    expect(args.sessionsCount).toBe(2);
    expect(args.totalDurationMin).toBe(50);
  });

  it("只统计今日会话，跨日的不计入", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "ok" });

    const yesterday = NOW - DAY_MS;
    await generateDailyReport({
      sessions: [
        makeSession({ id: "old", startedAt: yesterday - 1000 }),
        makeSession({ id: "today", startedAt: NOW - 1000 }),
      ],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.sessionsCount).toBe(1);
  });

  it("情绪轨迹包含 pre/break/post 所有点", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "ok" });

    await generateDailyReport({
      sessions: [
        makeSession({
          id: "s1",
          startedAt: NOW - 1000,
          preAssessment: { mood: 3 },
          breakMoods: [{ cycleIndex: 0, mood: 3, timestamp: NOW - 800 }],
          postAssessment: { mood: 5, focus: 4 },
        }),
      ],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.moodTrend).toContain("3→3→5");
  });

  it("moodTrend 显示上升趋势", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "ok" });

    await generateDailyReport({
      sessions: [
        makeSession({
          id: "s1",
          startedAt: NOW - 2000,
          preAssessment: { mood: 2 },
          postAssessment: { mood: 4, focus: 4 },
        }),
      ],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.moodTrend).toContain("稳步上升");
  });

  it("无情绪采样时 moodTrend 显示「无情绪采样」", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "ok" });

    await generateDailyReport({
      sessions: [
        makeSession({
          id: "s1",
          preAssessment: null,
          postAssessment: null,
          breakMoods: [],
        }),
      ],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.moodTrend).toBe("无情绪采样");
  });

  it("topInsights 优先取本期间内标记有用的洞察", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "ok" });

    const todaySession = makeSession({ id: "s1", startedAt: NOW - 1000 });
    const oldSession = makeSession({ id: "s2", startedAt: NOW - DAY_MS * 5 });

    await generateDailyReport({
      sessions: [todaySession, oldSession],
      insights: [
        {
          id: "i1",
          sessionId: "s1",
          createdAt: NOW - 500,
          text: "今日有用的洞察",
          source: "llm",
          confidence: "high",
          feedback: "useful",
          mood: 4,
        },
        {
          id: "i2",
          sessionId: "s2",
          createdAt: NOW - DAY_MS * 5,
          text: "旧的洞察",
          source: "llm",
          confidence: "high",
          feedback: "useful",
          mood: 4,
        },
      ],
      profile: baseProfile,
      now: NOW,
    });

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.topInsights).toEqual(["今日有用的洞察"]);
  });

  it("replyStyle 透传到 LLM 调用", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "ok" });

    await generateDailyReport({
      sessions: [],
      insights: [],
      profile: { ...baseProfile, replyStyle: "emotional" },
      now: NOW,
    });

    const args = callReportLLMMock.mock.calls[0][0];
    expect(args.replyStyle).toBe("emotional");
  });
});

describe("generateDailyReport - LLM 失败降级", () => {
  it("LLM 失败时返回 fallback 文案", async () => {
    callReportLLMMock.mockResolvedValue({
      success: false,
      text: "",
      error: "502",
    });

    const report = await generateDailyReport({
      sessions: [
        makeSession({ id: "s1", startedAt: NOW - 1000, actualDurationSec: 1500 }),
      ],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    expect(report.source).toBe("fallback");
    expect(report.text).toContain("1 次专注");
    expect(report.text).toContain("25 分钟");
  });

  it("无会话时 fallback 给出陪伴文案", async () => {
    callReportLLMMock.mockResolvedValue({
      success: false,
      text: "",
      error: "502",
    });

    const report = await generateDailyReport({
      sessions: [],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    expect(report.source).toBe("fallback");
    expect(report.text).toContain("还没有专注记录");
  });

  it("连续专注 ≥2 天时 fallback 包含「第 N 天」", async () => {
    callReportLLMMock.mockResolvedValue({
      success: false,
      text: "",
      error: "502",
    });

    const sessions = [
      makeSession({ id: "s_today", startedAt: NOW - 1000 }),
      makeSession({ id: "s_y", startedAt: NOW - DAY_MS - 1000 }),
      makeSession({ id: "s_y2", startedAt: NOW - DAY_MS * 2 - 1000 }),
    ];

    const report = await generateDailyReport({
      sessions,
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    expect(report.text).toContain("第 3 天");
  });
});

describe("generateWeeklyReport", () => {
  it("聚合本周会话", async () => {
    callReportLLMMock.mockResolvedValue({ success: true, text: "本周不错" });

    const report = await generateWeeklyReport({
      sessions: [
        makeSession({ id: "s1", startedAt: NOW - 1000, actualDurationSec: 3600 }),
        makeSession({ id: "s2", startedAt: NOW - DAY_MS, actualDurationSec: 3600 }),
        // 上周的应被排除
        makeSession({ id: "s_old", startedAt: NOW - DAY_MS * 8, actualDurationSec: 3600 }),
      ],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    expect(report.scope).toBe("weekly");
    expect(report.sessionsCount).toBe(2);
    expect(report.totalDurationMin).toBe(120);
    expect(report.dateLabel).toContain("周");
  });

  it("weekly fallback 文案在 LLM 失败时启用", async () => {
    callReportLLMMock.mockResolvedValue({
      success: false,
      text: "",
      error: "down",
    });

    const report = await generateWeeklyReport({
      sessions: [],
      insights: [],
      profile: baseProfile,
      now: NOW,
    });

    expect(report.source).toBe("fallback");
    expect(report.text).toContain("这周");
  });
});
