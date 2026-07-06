// Cloudflare Pages Function — DeepSeek API 代理（洞察日报/周报）
// 与 /api/llm 同构，但 prompt 与 max_tokens 不同（报告更长）

const BLACKLIST = [
  "抑郁", "焦虑症", "抑郁症", "你应该", "建议就医",
  "诊断", "治疗", "药物", "处方",
];

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const TIMEOUT_MS = 15_000; // 报告生成稍长

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export interface ReportPromptParams {
  scope: "daily" | "weekly";
  goal: string;
  daysToExam: number;
  dateLabel: string;
  sessionsCount: number;
  totalDurationMin: number;
  interruptions: number;
  moodTrend: string;
  streakDays: number;
  topInsights: string[];
  replyStyle?: "rational" | "emotional" | "balanced";
}

const REPLY_STYLE_TONE: Record<string, string> = {
  rational: "语气冷静、直接，像一位懂数据的同行者，先给事实再给一句简短结论。",
  emotional: "语气像朋友在身旁，温柔、克制、不说教，鼓励要落到具体行为上。严禁直接罗列原始数字。",
  balanced: "语气平和，先看见再陪伴，既有事实也有温度。",
};

export function buildReportPrompt(p: ReportPromptParams): string {
  const tone = REPLY_STYLE_TONE[p.replyStyle ?? "balanced"];
  const scopeLabel = p.scope === "daily" ? "今日" : "本周";
  const charLimit = p.scope === "daily" ? "100-200" : "150-280";
  const topInsightsText =
    p.topInsights.length > 0
      ? p.topInsights.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
      : "  （暂无）";

  return [
    `你是「凝时」，凝视用户每一刻专注的陪伴者，不是诊疗者。`,
    `语气：${tone}`,
    `不要评判对错、不要空泛鸡汤、不要说教；鼓励如果给，必须基于数据或行为。`,
    ``,
    `用户：目标「${p.goal}」，距考 ${p.daysToExam} 天。`,
    `时间：${p.dateLabel}。`,
    ``,
    `${scopeLabel}专注概览：`,
    `- 完成 ${p.sessionsCount} 次专注`,
    `- 累计 ${p.totalDurationMin} 分钟`,
    `- 离开 ${p.interruptions} 次`,
    `- 情绪轨迹：${p.moodTrend}`,
    `- 连续专注 ${p.streakDays} 天`,
    `- 用户标记「有用」的洞察：`,
    topInsightsText,
    ``,
    `请生成一段 ${charLimit} 字的「${scopeLabel}报告」，必须：`,
    `① 开头用一句话凝视${scopeLabel}的努力（基于上述数据，不要空泛）`,
    `② 中间回顾${scopeLabel}的专注状态（情绪起伏、专注质量，用陪伴的语气）`,
    `③ 如果连续专注 ≥ 2 天，自然地提及这个连续（如"这已经是第N天了"），不要机械罗列`,
    `④ 结尾一句对${p.scope === "daily" ? "明天" : "下周"}的轻量期许（不说教、不鸡汤）`,
    `⑤ 严禁诊断/医疗/处方/疾病名称词汇`,
    `⑥ 不要分点列示，用一段连贯的话写出来`,
  ].join("\n");
}

export function filterBlacklist(text: string): { clean: boolean; text: string } {
  const hit = BLACKLIST.some((w) => text.includes(w));
  return { clean: !hit, text: hit ? "" : text };
}

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

export async function onRequestGet(): Promise<Response> {
  return new Response(JSON.stringify({ error: "method not allowed, use POST" }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, Allow: "POST, OPTIONS" },
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(ctx: {
  request: Request;
  env: { DEEPSEEK_API_KEY: string };
}): Promise<Response> {
  let body: ReportPromptParams;
  try {
    body = (await ctx.request.json()) as ReportPromptParams;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (body.scope !== "daily" && body.scope !== "weekly") {
    return new Response(JSON.stringify({ error: "invalid scope" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const prompt = buildReportPrompt(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400, // 报告更长
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = (await resp.json()) as DeepSeekResponse;
    if (!resp.ok || data.error) {
      return new Response(JSON.stringify({ error: data.error?.message ?? "deepseek error" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const postFilter = filterBlacklist(text);
    if (!postFilter.clean) {
      return new Response(JSON.stringify({ error: "blacklist hit" }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : "unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 504,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
