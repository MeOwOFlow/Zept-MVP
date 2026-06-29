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

export function getFallbackInsight(
  mood: number,
  mode: PomodoroState['mode'],
): FallbackResult {
  if (mood <= 2) {
    return {
      text: `今天看起来有些吃力，允许自己慢一点。如果持续低落，可以联系${CARE_GATE_RESOURCES.counseling}，或拨打${CARE_GATE_RESOURCES.hotline}。`,
      source: 'care',
      confidence: 'low',
    };
  }
  if (mood === 3) {
    if (mode === 'work') {
      return { text: '状态中等也是状态，坚持完成这一轮就是进步。', source: 'template', confidence: 'medium' };
    }
    return { text: '休息也是专注的一部分，深呼吸几次再继续。', source: 'template', confidence: 'medium' };
  }
  if (mode === 'work') {
    return { text: '注意力曲线整体向上，保持当前节奏，无需加码。', source: 'template', confidence: 'medium' };
  }
  return { text: '休息充分，下一轮专注会更稳。', source: 'template', confidence: 'medium' };
}
