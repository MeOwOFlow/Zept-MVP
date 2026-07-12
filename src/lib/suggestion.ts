/**
 * @rn-status RN-READY
 * 纯逻辑：基于本次会话 + 趋势摘要给出下一轮番茄钟参数建议。
 * 无 DOM、无 I/O，RN 直接复用。
 *
 * 设计原则：判断与措辞分离。
 * 此模块只做规则判断（返回枚举 + 理由），LLM 层负责润色措辞。
 */

import type { SessionRecord } from '../types/session';
import type { UserProfilePattern } from '../types/user';
import type { NextRoundHint, NextRoundKind } from '../types/suggestion';

/**
 * 基于本次会话 + 趋势摘要，给出下一轮参数建议。
 * mood ≤ 2 不进此函数（care gate 前置拦截）。
 * 纯规则判断，不调 LLM。
 *
 * @param session 本次会话
 * @param trendSummary summarizeTrend 的返回值（如 "趋势：最近10次，情绪回升，专注稳定"）
 * @param userPattern 用户长期画像（v0.2 复赛预留，MVP 不传）
 */
export function suggestNextRound(
  session: SessionRecord,
  trendSummary: string,
  userPattern?: UserProfilePattern,
): NextRoundHint {
  // MVP 阶段不使用 userPattern，复赛 v0.2 接入画像后启用
  void userPattern;
  const focus = session.postAssessment?.focus ?? 3;
  const leaveCount = session.interruptions;

  // 规则 1：离开多或专注低 → 缩短
  if (leaveCount >= 3 || focus <= 2) {
    return {
      kind: 'shorter',
      reason: 'leaves_or_low_focus',
      targetWorkMin: 20,
    };
  }

  // 规则 2：零离开 + 高专注 + 趋势不下滑 → 保持
  if (leaveCount === 0 && focus >= 4 && !trendSummary.includes('下滑')) {
    return {
      kind: 'keep',
      reason: 'stable_high_focus',
    };
  }

  // 规则 3：休息情绪采样呈恢复趋势（后 > 前）→ 休息久一点
  const breakMoods = session.breakMoods ?? [];
  if (breakMoods.length >= 2) {
    const first = breakMoods[0].mood;
    const last = breakMoods[breakMoods.length - 1].mood;
    if (first && last && last > first) {
      return {
        kind: 'break_more',
        reason: 'break_recovering',
        targetBreakMin: 7,
      };
    }
  }

  // 无明确信号，不强给建议
  return {
    kind: null,
    reason: 'no_clear_signal',
  };
}

/**
 * 将 NextRoundHint 翻译成给 LLM 的自然语言提示。
 * kind=null 时返回空字符串。
 */
export function formatNextRoundHint(hint: NextRoundHint): string {
  const kind: NextRoundKind = hint.kind;
  switch (kind) {
    case 'shorter':
      return `下一轮建议缩短专注时长${hint.targetWorkMin ? `到约 ${hint.targetWorkMin} 分钟` : ''}`;
    case 'keep':
      return '下一轮可保持当前节奏';
    case 'longer':
      return `下一轮可适当延长专注时长${hint.targetWorkMin ? `到约 ${hint.targetWorkMin} 分钟` : ''}`;
    case 'break_more':
      return `下一轮休息可久一点${hint.targetBreakMin ? `（约 ${hint.targetBreakMin} 分钟）` : ''}`;
    case null:
    default:
      return '';
  }
}
