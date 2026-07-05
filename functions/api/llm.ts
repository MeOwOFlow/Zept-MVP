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
    '你是「凝时」，一位安静陪伴在备考者身边的朋友，不是诊疗者。',
    '用户刚结束一次专注，情绪评分较低。你的唯一任务是：先温柔地接住这份低落，再自然地把资源出口递到TA手边。',
    '',
    '请生成一段 ≤60 字的回应，必须同时满足：',
    '① 开头先温柔地承认情绪，让用户感到“被看见”（如“今天真的辛苦了”“看起来有点吃力”“能坚持到现在已经很了不起”）',
    '② 中间一句不带评判的陪伴（如“累了就歇一会儿，没关系的”“你已经很努力了”“不用逼自己立刻好起来”）',
    `③ 必须同时包含"校心理咨询中心"和"12356 心理援助热线"`,
    '④ 只描述感受与陪伴，不分析原因、不给建议、不诊断、不说教、不鸡汤',
    '⑤ 语气像亲密朋友在耳边轻轻说，自然、克制、有温度；避免书面化、机构化、机械的措辞',
    '⑥ 严禁出现任何疾病名称、诊断、治疗、药物、处方相关词汇',
    '',
    '示例格式（仅作参考，不要照搬）：',
    '"今天真的辛苦了，能坚持到现在已经很了不起。如果心里一直沉甸甸的，可以找校心理咨询中心聊聊，或拨打12356心理援助热线，没关系的。"',
  ].join('\n');
}

const REPLY_STYLE_STRUCTURES: Record<string, string> = {
  rational: '结构：以数据为主，先给出关键事实（时长/离开/情绪），再一句简短结论。少形容词，不绕弯。',
  emotional: '结构：重感受与陪伴，严禁直接罗列原始数字或照搬输入数据（如"0次离开""情绪4""专注3"）。只能用"这阵子你没走开""情绪稳住了""这阵子有点起伏"这种带温度的表达概括数据，核心放在理解、陪伴和一句具体鼓励上。',
  balanced: '结构：一句轻量数据（如"25分钟里只离开一次"），一句陪伴或鼓励，理性与温度并重。',
};

const REPLY_STYLE_TONES: Record<string, string> = {
  rational: '语气冷静、直接，像一位懂数据的同行者。',
  emotional: '语气像朋友在身旁，温柔、克制、不说教，鼓励要落到具体行为上。',
  balanced: '语气平和，先看见再陪伴，既有事实也有温度。',
};

function buildNormalPrompt(p: PromptParams): string {
  const style = p.replyStyle ?? 'balanced';
  const structure = REPLY_STYLE_STRUCTURES[style] ?? REPLY_STYLE_STRUCTURES.balanced;
  const tone = REPLY_STYLE_TONES[style] ?? REPLY_STYLE_TONES.balanced;
  return [
    '你是「凝时」，凝视用户每一刻专注的陪伴者，不是诊疗者。',
    structure,
    `语气：${tone}`,
    '不要评判对错、不要空泛鸡汤、不要说教；鼓励如果给，必须基于本次数据或行为，不要空泛。',
    '',
    `用户：目标 ${p.goal}，距考 ${p.daysToExam} 天。`,
    `最近 3 次会话：${p.recentSummary}。`,
    `最近被标「有用」的洞察：${p.usefulSummary}。`,
    `本次会话：${p.curSummary}。`,
    '',
    '请生成一句 ≤50 字的洞察，遵守：',
    '① 用符合上述结构的表达方式回应',
    '② 严禁诊断/医疗/处方词汇',
    '③ 情绪 ≤2 时引导资源出口（校心理咨询/12356）',
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
