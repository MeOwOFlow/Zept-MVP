import { describe, it, expect } from "vitest";
import {
  getSampleCompleteness,
  isFlatline,
  getSessionConfidence,
  getDatasetConfidence,
  detectOutliers,
} from "../../src/lib/moodConfidence";
import type { SessionRecord } from "../../src/types/session";

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s_test",
    userId: "local",
    goal: "考研",
    daysToExam: 30,
    startedAt: Date.now(),
    endedAt: Date.now(),
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
    postAssessment: null,
    breakMoods: [],
    ...overrides,
  };
}

describe("getSampleCompleteness", () => {
  it("full: pre + break + post 三点都有", () => {
    const s = makeSession({
      preAssessment: { mood: 3 },
      breakMoods: [{ cycleIndex: 0, mood: 3, timestamp: Date.now() }],
      postAssessment: { mood: 4, focus: 4 },
    });
    expect(getSampleCompleteness(s)).toBe("full");
  });

  it("partial: pre + post 两点（缺 break）", () => {
    const s = makeSession({
      preAssessment: { mood: 3 },
      postAssessment: { mood: 4, focus: 4 },
    });
    expect(getSampleCompleteness(s)).toBe("partial");
  });

  it("minimal: 只有单点", () => {
    const s = makeSession({ postAssessment: { mood: 4, focus: 4 } });
    expect(getSampleCompleteness(s)).toBe("minimal");
  });

  it("breakMoods 中 mood=null 不计入", () => {
    const s = makeSession({
      preAssessment: { mood: 3 },
      breakMoods: [{ cycleIndex: 0, mood: null, timestamp: Date.now() }],
      postAssessment: { mood: 4, focus: 4 },
    });
    expect(getSampleCompleteness(s)).toBe("partial");
  });
});

describe("isFlatline", () => {
  it("≥3 点全同值返回 true", () => {
    const sessions = [
      makeSession({
        preAssessment: { mood: 3 },
        breakMoods: [{ cycleIndex: 0, mood: 3, timestamp: Date.now() }],
        postAssessment: { mood: 3, focus: 3 },
      }),
    ];
    expect(isFlatline(sessions)).toBe(true);
  });

  it("有变化返回 false", () => {
    const sessions = [
      makeSession({
        preAssessment: { mood: 3 },
        breakMoods: [{ cycleIndex: 0, mood: 2, timestamp: Date.now() }],
        postAssessment: { mood: 5, focus: 4 },
      }),
    ];
    expect(isFlatline(sessions)).toBe(false);
  });

  it("<3 点返回 false", () => {
    const sessions = [makeSession({ postAssessment: { mood: 4, focus: 4 } })];
    expect(isFlatline(sessions)).toBe(false);
  });
});

describe("getSessionConfidence", () => {
  it("full → high", () => {
    const s = makeSession({
      preAssessment: { mood: 3 },
      breakMoods: [{ cycleIndex: 0, mood: 3, timestamp: Date.now() }],
      postAssessment: { mood: 4, focus: 4 },
    });
    expect(getSessionConfidence(s)).toBe("high");
  });

  it("partial → medium", () => {
    const s = makeSession({
      preAssessment: { mood: 3 },
      postAssessment: { mood: 4, focus: 4 },
    });
    expect(getSessionConfidence(s)).toBe("medium");
  });

  it("minimal → low", () => {
    const s = makeSession({ postAssessment: { mood: 4, focus: 4 } });
    expect(getSessionConfidence(s)).toBe("low");
  });
});

describe("getDatasetConfidence", () => {
  it("空数据集返回 low（防御性）", () => {
    const result = getDatasetConfidence([]);
    expect(result.level).toBe("low");
    expect(result.totalPoints).toBe(0);
  });

  it("flatline 强制 low", () => {
    const sessions = Array.from({ length: 3 }, () =>
      makeSession({
        preAssessment: { mood: 3 },
        breakMoods: [{ cycleIndex: 0, mood: 3, timestamp: Date.now() }],
        postAssessment: { mood: 3, focus: 3 },
      }),
    );
    const result = getDatasetConfidence(sessions);
    expect(result.flatline).toBe(true);
    expect(result.level).toBe("low");
  });

  it("full 采样 ≥60% 且 ≥3 会话 → high", () => {
    const sessions = Array.from({ length: 5 }, () =>
      makeSession({
        preAssessment: { mood: 3 },
        breakMoods: [{ cycleIndex: 0, mood: 2, timestamp: Date.now() }],
        postAssessment: { mood: 5, focus: 4 },
      }),
    );
    const result = getDatasetConfidence(sessions);
    expect(result.level).toBe("high");
    expect(result.fullCount).toBe(5);
  });

  it("采样点 <3 → low", () => {
    const sessions = [
      makeSession({ postAssessment: { mood: 4, focus: 4 } }),
      makeSession({ postAssessment: { mood: 5, focus: 5 } }),
    ];
    const result = getDatasetConfidence(sessions);
    expect(result.level).toBe("low");
    expect(result.totalPoints).toBe(2);
  });
});

describe("detectOutliers", () => {
  it("<4 个点返回空数组", () => {
    expect(detectOutliers([1, 2, 3])).toEqual([]);
  });

  it("全部相同返回空（std=0，是 flatline 不是 outlier）", () => {
    expect(detectOutliers([5, 5, 5, 5])).toEqual([]);
  });

  it("2σ 偏离的点标记为 outlier", () => {
    // 8 个点，均值 ≈3.375，std ≈6.28，2σ ≈12.57
    // 20 偏离 3.375 = 16.625 > 12.57
    const outliers = detectOutliers([1, 1, 1, 1, 1, 1, 1, 20]);
    expect(outliers).toContain(7);
  });
});
