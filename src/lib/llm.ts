export interface LLMRequestParams {
  goal: string;
  daysToExam: number;
  recentSummary: string;
  usefulSummary: string;
  curSummary: string;
  mood: number;
  careMode?: boolean;
  replyStyle?: 'rational' | 'emotional' | 'balanced';
}

export interface LLMResult {
  success: boolean;
  text: string;
  error?: string;
}

export async function callLLM(params: LLMRequestParams): Promise<LLMResult> {
  try {
    const resp = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    if (resp.ok && typeof data.text === 'string') {
      return { success: true, text: data.text };
    }
    return { success: false, text: '', error: data.error ?? `http ${resp.status}` };
  } catch (e) {
    return { success: false, text: '', error: e instanceof Error ? e.message : 'network error' };
  }
}
