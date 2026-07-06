/**
 * @rn-status RN-READY
 * 情绪数据置信度计算 + 去虚假机制
 * lib 层，不依赖 React，为 RN 迁移预留
 */

import type { SessionRecord } from "../types/session";

/** 置信度等级 */
export type ConfidenceLevel = "high" | "medium" | "low";

/** 单场会话的情绪采样完整度 */
export type SampleCompleteness = "full" | "partial" | "minimal";

/**
 * 判断单场会话的情绪采样完整度
 * - full: pre + break + post 三点都有
 * - partial: pre + post 两点（缺 break）
 * - minimal: 只有单点
 */
export function getSampleCompleteness(session: SessionRecord): SampleCompleteness {
  const hasPre = session.preAssessment !== null;
  const hasPost = session.postAssessment !== null;
  const breakCount = session.breakMoods.filter((b) => b.mood !== null).length;
  const hasBreak = breakCount > 0;

  if (hasPre && hasPost && hasBreak) return "full";
  if (hasPre && hasPost) return "partial";
  return "minimal";
}

/**
 * 检测全填同一个值的虚假数据模式
 * 返回 true 表示数据可疑
 */
export function isFlatline(sessions: SessionRecord[]): boolean {
  const allMoods: number[] = [];
  for (const s of sessions) {
    if (s.preAssessment) allMoods.push(s.preAssessment.mood);
    for (const b of s.breakMoods) {
      if (b.mood !== null) allMoods.push(b.mood);
    }
    if (s.postAssessment) allMoods.push(s.postAssessment.mood);
  }
  if (allMoods.length < 3) return false;
  const first = allMoods[0];
  return allMoods.every((v) => v === first);
}

/**
 * 计算单场会话的置信度
 */
export function getSessionConfidence(session: SessionRecord): ConfidenceLevel {
  const completeness = getSampleCompleteness(session);
  switch (completeness) {
    case "full":
      return "high";
    case "partial":
      return "medium";
    case "minimal":
      return "low";
  }
}

/**
 * 计算整体数据集的置信度
 * 综合考虑：采样完整度 + 是否 flatline + 数据量
 */
export function getDatasetConfidence(sessions: SessionRecord[]): {
  level: ConfidenceLevel;
  flatline: boolean;
  totalPoints: number;
  fullCount: number;
  partialCount: number;
  minimalCount: number;
} {
  let fullCount = 0;
  let partialCount = 0;
  let minimalCount = 0;
  let totalPoints = 0;

  for (const s of sessions) {
    const c = getSampleCompleteness(s);
    if (c === "full") fullCount++;
    else if (c === "partial") partialCount++;
    else minimalCount++;

    if (s.preAssessment) totalPoints++;
    totalPoints += s.breakMoods.filter((b) => b.mood !== null).length;
    if (s.postAssessment) totalPoints++;
  }

  const flatline = isFlatline(sessions);

  // 置信度判定逻辑
  let level: ConfidenceLevel;
  if (flatline || totalPoints < 3) {
    level = "low";
  } else if (fullCount >= sessions.length * 0.6 && sessions.length >= 3) {
    level = "high";
  } else {
    level = "medium";
  }

  return { level, flatline, totalPoints, fullCount, partialCount, minimalCount };
}

/**
 * 离群点检测：偏离均值超过 2σ 的点
 * 返回需要标注的异常点索引
 */
export function detectOutliers(values: number[]): number[] {
  if (values.length < 4) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return []; // 全部相同，不是离群点（是 flatline，单独处理）

  const outliers: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] - mean) > 2 * std) {
      outliers.push(i);
    }
  }
  return outliers;
}
