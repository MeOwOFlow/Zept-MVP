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
  careMode?: boolean;
  replyStyle?: 'rational' | 'emotional' | 'balanced';
}

function buildCarePrompt(): string {
  return [
    '你是「凝时」，用户的陪伴者，不是诊疗者。',
    '用户当前情绪评分较低，你的唯一任务是：温和承认情绪 + 提供资源出口。',
    '',
    '请生成一句 ≤40 字的回应，必须同时满足：',
    `① 必须包含"校心理咨询中心"和"12356 心理援助热线"`,
    '② 只描述感受，不分析原因、不给建议、不诊断',
    '③ 语气像朋友在身旁，不要鸡汤、不要说教',
    '④ 严禁出现任何疾病名称、诊断、治疗、药物、处方相关词汇',
    '',
    '示例（仅作格式参考，不要照搬）：',
    '"现在确实不容易，累了就歇会儿。可以找校心理咨询中心聊聊，或拨打12356心理援助热线。"',
  ].join('\n');
}

const REPLY_STYLE_TONES: Record<string, string> = {
  rational: '用数据说话，直给不绕弯，少用感叹号和情绪词。',
  emotional: '偏感性，像朋友在身旁，可以温暖但不要鸡汤。',
  balanced: '先看见数据，再说一句陪伴，理性与温度并重。',
};

function buildNormalPrompt(p: PromptParams): string {
  const tone = REPLY_STYLE_TONES[p.replyStyle ?? 'balanced'] ?? REPLY_STYLE_TONES.balanced;
  return [
    '你是「凝时」，凝视用户每一刻专注的陪伴者，不是诊疗者。',
    `语气要求：${tone}`,
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
    '③ 情绪 ≤2 时引导资源出口（校心理咨询/12356）',
    '④ 严禁诊断/医疗/处方词汇',
  ].join('\n');
}

export function buildPrompt(p: PromptParams): string {
  return p.careMode ? buildCarePrompt() : buildNormalPrompt(p);
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
