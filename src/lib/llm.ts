/**
 * @rn-status RN-READY-WITH-CONFIG
 * fetch 在 RN 可用；相对路径 '/api/llm' 需切换为后端绝对地址或 RN bundler 配置。
 */
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

/**
 * 洞察日报/周报 LLM 调用
 * RN 迁移注意：fetch 在 RN 可用，端点需切换为绝对地址
 */
export interface ReportLLMRequestParams {
  scope: 'daily' | 'weekly';
  goal: string;
  daysToExam: number;
  dateLabel: string;
  sessionsCount: number;
  totalDurationMin: number;
  interruptions: number;
  moodTrend: string;
  streakDays: number;
  topInsights: string[];
  replyStyle?: 'rational' | 'emotional' | 'balanced';
}

async function postJSON<T>(endpoint: string, body: T): Promise<LLMResult> {
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

export function callLLM(params: LLMRequestParams): Promise<LLMResult> {
  return postJSON('/api/llm', params);
}

export function callReportLLM(params: ReportLLMRequestParams): Promise<LLMResult> {
  return postJSON('/api/report', params);
}
