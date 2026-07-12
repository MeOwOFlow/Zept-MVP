/**
 * @rn-status RN-READY
 * 纯类型定义，无运行时依赖，RN 直接复用。
 */

/**
 * 下一轮建议的机器可读判断结果。
 * 扩展点：未来可加 'switch_mode' | 'take_long_break' | 'stop_for_today' 等。
 */
export type NextRoundKind = 'shorter' | 'keep' | 'longer' | 'break_more' | null;

/**
 * 规则层判断出的下一轮建议结构。
 * - kind: 枚举结果，null 表示无明确建议
 * - reason: 给 LLM 的结构化理由（便于回归测试）
 * - targetWorkMin/targetBreakMin: 可选的目标参数
 */
export interface NextRoundHint {
  kind: NextRoundKind;
  reason: string;
  targetWorkMin?: number;
  targetBreakMin?: number;
}
