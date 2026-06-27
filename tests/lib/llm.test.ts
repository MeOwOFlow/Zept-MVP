import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLLM } from '../../src/lib/llm';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('callLLM', () => {
  it('成功返回 text', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ text: '你上午更专注' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await callLLM({
      goal: '考研', daysToExam: 100,
      recentSummary: '无', usefulSummary: '无',
      curSummary: '25分钟', mood: 4,
    });
    expect(r.success).toBe(true);
    expect(r.text).toBe('你上午更专注');
  });

  it('HTTP 错误返回 failure', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: 'blacklist hit' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await callLLM({
      goal: '考研', daysToExam: 100,
      recentSummary: '无', usefulSummary: '无',
      curSummary: '25分钟', mood: 4,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('blacklist hit');
  });

  it('网络错误返回 failure', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network');
    });
    const r = await callLLM({
      goal: '考研', daysToExam: 100,
      recentSummary: '无', usefulSummary: '无',
      curSummary: '25分钟', mood: 4,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('network');
  });
});
