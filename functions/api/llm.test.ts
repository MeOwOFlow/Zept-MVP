import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPrompt, filterBlacklist, onRequestPost } from './llm';

const baseParams = {
  goal: '考研',
  daysToExam: 100,
  recentSummary: '专注 25 分钟，中断 1 次',
  usefulSummary: '上午专注度更高',
  curSummary: '本次 25 分钟，中断 0 次，情绪 4',
  mood: 4,
};

describe('buildPrompt', () => {
  it('包含目标、距考天数、会话摘要', () => {
    const p = buildPrompt(baseParams);
    expect(p).toContain('考研');
    expect(p).toContain('100');
    expect(p).toContain('专注 25 分钟');
  });

  it('包含合规约束', () => {
    const p = buildPrompt(baseParams);
    expect(p).toContain('严禁诊断');
    expect(p).toContain('诊疗者');
  });
});

describe('filterBlacklist', () => {
  it('干净文本通过', () => {
    const r = filterBlacklist('上午专注度更高');
    expect(r.clean).toBe(true);
    expect(r.text).toBe('上午专注度更高');
  });

  it('命中黑名单返回空文本', () => {
    const r = filterBlacklist('建议就医检查');
    expect(r.clean).toBe(false);
    expect(r.text).toBe('');
  });
});

describe('onRequestPost', () => {
  const env = { DEEPSEEK_API_KEY: 'test-key' };

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('用户输入含黑名单词时不再预过滤（已删除 preFilter，避免误伤备考目标）', async () => {
    // 用户 goal 含"诊断学"等正常备考词时不应被拦截
    // 此测试验证 preFilter 已移除：请求会正常透传到 LLM
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '你专注稳定' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost/api/llm', {
      method: 'POST',
      body: JSON.stringify({ ...baseParams, goal: '诊断学考研' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('成功返回 200 + text', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '你上午更专注' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost/api/llm', {
      method: 'POST',
      body: JSON.stringify(baseParams),
      headers: { 'Content-Type': 'application/json' },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.text).toBe('你上午更专注');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
  });

  it('LLM 返回黑名单词返回 422', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '建议就医' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const req = new Request('http://localhost/api/llm', {
      method: 'POST',
      body: JSON.stringify(baseParams),
      headers: { 'Content-Type': 'application/json' },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(422);
  });

  it('DeepSeek 返回错误返回 502', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({ error: { message: 'rate limit' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const req = new Request('http://localhost/api/llm', {
      method: 'POST',
      body: JSON.stringify(baseParams),
      headers: { 'Content-Type': 'application/json' },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(502);
  });

  it('fetch 抛错返回 504', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network failed');
    });
    const req = new Request('http://localhost/api/llm', {
      method: 'POST',
      body: JSON.stringify(baseParams),
      headers: { 'Content-Type': 'application/json' },
    });
    const resp = await onRequestPost({ request: req, env });
    expect(resp.status).toBe(504);
  });
});
