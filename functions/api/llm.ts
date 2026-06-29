// Cloudflare Pages Function — DeepSeek API 代理
// 密钥从 env.DEEPSEEK_API_KEY 读取，不前端直调

const BLACKLIST = [
  '抑郁', '焦虑症', '抑郁症', '你应该', '建议就医',
  '诊断', '治疗', '药物', '处方',
];

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 10_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export interface PromptParams {
  goal: string;
  daysToExam: number;
  recentSummary: string;
  usefulSummary: string;
  curSummary: string;
  mood: number;
}

export function buildPrompt(p: PromptParams): string {
  return [
    '你是「凝时」，凝视用户每一刻专注的陪伴者，不是诊疗者。',
    '语气温和、像朋友一样，先看见数据，再说一句陪伴的话。',
    '不要评判对错、不要鸡汤、不要说教。',
    '',
    `用户：目标 ${p.goal}，距考 ${p.daysToExam} 天。`,
    `最近 3 次会话：${p.recentSummary}。`,
    `最近被标「有用」的洞察：${p.usefulSummary}。`,
    `本次会话：${p.curSummary}。`,
    '',
    '请生成一句 ≤50 字的洞察，遵守：',
    '① 必须引用本次会话的具体数据（时长/离开次数/情绪）',
    '② 先看见再陪伴——"25分钟零离开"是看见，"你真棒"是评判，前者才对',
    '③ 情绪 ≤2 时引导资源出口（校心理咨询/12320）',
    '④ 严禁诊断/医疗/处方词汇',
  ].join('\n');
}

export function filterBlacklist(text: string): { clean: boolean; text: string } {
  const hit = BLACKLIST.some((w) => text.includes(w));
  return { clean: !hit, text: hit ? '' : text };
}

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

// GET 直接访问 API（如浏览器地址栏）返回 405，避免 Cloudflare fallback 到前端页面
export async function onRequestGet(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'method not allowed, use POST' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, Allow: 'POST, OPTIONS' },
  });
}

export async function onRequestPost(ctx: {
  request: Request;
  env: { DEEPSEEK_API_KEY: string };
}): Promise<Response> {
  let body: PromptParams;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 注：黑名单只过滤 LLM 输出（postFilter），不预过滤用户输入
  // 用户 goal 可能合法包含"诊断学""药理学"等备考目标词，预过滤会误伤
  const prompt = buildPrompt(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = (await resp.json()) as DeepSeekResponse;
    if (!resp.ok || data.error) {
      return new Response(JSON.stringify({ error: data.error?.message ?? 'deepseek error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    const postFilter = filterBlacklist(text);
    if (!postFilter.clean) {
      return new Response(JSON.stringify({ error: 'blacklist hit' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : 'unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 504,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
