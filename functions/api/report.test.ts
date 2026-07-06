import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildReportPrompt, filterBlacklist, onRequestPost } from "./report";
import type { ReportPromptParams } from "./report";

const baseParams: ReportPromptParams = {
  scope: "daily",
  goal: "考研",
  daysToExam: 100,
  dateLabel: "2026年7月6日",
  sessionsCount: 3,
  totalDurationMin: 75,
  interruptions: 2,
  moodTrend: "3→4→4 稳住",
  streakDays: 4,
  topInsights: ["上午更专注", "情绪稳住了"],
  replyStyle: "balanced",
};

describe("buildReportPrompt", () => {
  it("包含目标、距考、连续专注天数", () => {
    const p = buildReportPrompt(baseParams);
    expect(p).toContain("考研");
    expect(p).toContain("100");
    expect(p).toContain("连续专注 4 天");
    expect(p).toContain("75 分钟");
  });

  it("daily 范围生成 100-200 字限制", () => {
    const p = buildReportPrompt(baseParams);
    expect(p).toContain("100-200 字");
    expect(p).toContain("今日报告");
    expect(p).toContain("明天的轻量期许");
  });

  it("weekly 范围生成 150-280 字限制 + 下周", () => {
    const p = buildReportPrompt({ ...baseParams, scope: "weekly" });
    expect(p).toContain("150-280 字");
    expect(p).toContain("本周报告");
    expect(p).toContain("下周的轻量期许");
  });

  it("包含合规约束（严禁诊断/不诊疗者）", () => {
    const p = buildReportPrompt(baseParams);
    expect(p).toContain("严禁诊断");
    expect(p).toContain("不是诊疗者");
  });

  it("连续专注 ≥2 天时 prompt 提示提及", () => {
    const p = buildReportPrompt({ ...baseParams, streakDays: 5 });
    expect(p).toContain("连续专注 ≥ 2 天");
  });

  it("连续专注 <2 天时 prompt 仍包含该规则（LLM 自行判断）", () => {
    const p = buildReportPrompt({ ...baseParams, streakDays: 1 });
    expect(p).toContain("连续专注 ≥ 2 天");
  });

  it("replyStyle=emotional 时语气像朋友在身旁", () => {
    const p = buildReportPrompt({ ...baseParams, replyStyle: "emotional" });
    expect(p).toContain("像朋友在身旁");
    expect(p).toContain("严禁直接罗列原始数字");
  });

  it("topInsights 为空时显示（暂无）", () => {
    const p = buildReportPrompt({ ...baseParams, topInsights: [] });
    expect(p).toContain("（暂无）");
  });

  it("包含「有用」洞察原文", () => {
    const p = buildReportPrompt(baseParams);
    expect(p).toContain("上午更专注");
    expect(p).toContain("情绪稳住了");
  });
});

describe("filterBlacklist (report)", () => {
  it("干净文本通过", () => {
    const r = filterBlacklist("今天你专注得很稳");
    expect(r.clean).toBe(true);
    expect(r.text).toBe("今天你专注得很稳");
  });

  it("命中黑名单返回空文本", () => {
    const r = filterBlacklist("建议就医检查");
    expect(r.clean).toBe(false);
    expect(r.text).toBe("");
  });
});

describe("onRequestPost (report)", () => {
  const env = { DEEPSEEK_API_KEY: "test-key" };

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功返回 200 + text", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "今天你三次专注都稳稳的，连续第四天了。" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("http://localhost/api/report", {
      method: "POST",
      body: JSON.stringify(baseParams),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.text).toContain("连续第四天");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
  });

  it("scope 非法返回 400", async () => {
    const req = new Request("http://localhost/api/report", {
      method: "POST",
      body: JSON.stringify({ ...baseParams, scope: "monthly" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(400);
  });

  it("LLM 返回黑名单词返回 422", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "建议就医" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const req = new Request("http://localhost/api/report", {
      method: "POST",
      body: JSON.stringify(baseParams),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(422);
  });

  it("DeepSeek 返回错误返回 502", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({ error: { message: "rate limit" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );
    const req = new Request("http://localhost/api/report", {
      method: "POST",
      body: JSON.stringify(baseParams),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(502);
  });

  it("fetch 抛错返回 504", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network failed");
    });
    const req = new Request("http://localhost/api/report", {
      method: "POST",
      body: JSON.stringify(baseParams),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(504);
  });
});
