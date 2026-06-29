import type { SessionRecord, PomodoroState, InsightSource, InsightConfidence } from '../types/session';

export const BLACKLIST_WORDS: string[] = [
  '抑郁', '焦虑症', '抑郁症', '你应该', '建议就医',
  '诊断', '治疗', '药物', '处方',
];

export const CARE_GATE_RESOURCES = {
  counseling: '校心理咨询中心',
  hotline: '12320 心理援助热线',
} as const;

export function shouldUseLLM(recentSessions: SessionRecord[]): boolean {
  // 放宽门槛：总是允许调 LLM（首次专注 recentSessions 为空时也调）
  // care gate（mood ≤ 2）已在调用方前置处理，此处不再拦截
  return recentSessions.length >= 0;
}

export function shouldTriggerCareGate(mood: number): boolean {
  return mood <= 2;
}

export function filterBlacklist(text: string): { clean: boolean; text: string } {
  const hit = BLACKLIST_WORDS.some((w) => text.includes(w));
  if (hit) return { clean: false, text: '' };
  return { clean: true, text };
}

export function getConfidence(
  recentSessionsCount: number,
  llmSuccess: boolean,
): InsightConfidence {
  if (recentSessionsCount >= 7 && llmSuccess) return 'high';
  if (recentSessionsCount >= 3) return 'medium';
  return 'low';
}

interface FallbackResult {
  text: string;
  source: InsightSource;
  confidence: InsightConfidence;
}

// 构造数据片段：专注时长 + 离开情况
function buildDataFragment(session: SessionRecord): string {
  const mins = Math.floor(session.actualDurationSec / 60);
  const durStr = mins > 0 ? `${mins}分钟` : '本轮';
  if (session.interruptions === 0) {
    return `${durStr}零离开`;
  }
  const events = session.interruptionEvents ?? [];
  if (events.length > 0) {
    const longestSec = Math.round(Math.max(...events.map((e) => e.durationMs)) / 1000);
    return `${durStr}离开${session.interruptions}次，最长${longestSec}秒`;
  }
  return `${durStr}离开${session.interruptions}次`;
}

export function getFallbackInsight(
  mood: number,
  mode: PomodoroState['mode'],
  session?: SessionRecord,
): FallbackResult {
  // care gate：mood ≤ 2 不拼接数据，保留合规资源出口
  if (mood <= 2) {
    return {
      text: `累了就歇会儿，没关系的。如果一直提不起劲，可以找${CARE_GATE_RESOURCES.counseling}聊聊，或打${CARE_GATE_RESOURCES.hotline}，我在这里。`,
      source: 'care',
      confidence: 'low',
    };
  }

  // 有 session 数据时，拼接数据片段让兜底也有个体差异
  const dataFrag = session ? buildDataFragment(session) : '';
  const prefix = dataFrag ? `${dataFrag}，` : '';

  if (mood === 3) {
    if (mode === 'work') {
      return { text: `${prefix}状态起伏都正常，能开始就已经在路上了。`, source: 'template', confidence: 'medium' };
    }
    return { text: '休息也是专注的一部分，慢慢呼吸几次。', source: 'template', confidence: 'medium' };
  }
  if (mode === 'work') {
    return { text: `${prefix}节奏稳住了，按这个步调继续就好。`, source: 'template', confidence: 'medium' };
  }
  return { text: '休息够了，下一轮会更稳。', source: 'template', confidence: 'medium' };
}
