/**
 * @rn-status RN-READY
 * 连续专注天数 & 累计专注时长计算
 * lib 层，不依赖 React，为 RN 迁移预留
 *
 * 仅统计已完成会话（status === 'completed'）。
 * 连续天数定义：以"自然日"为单位，从最近一次专注向前回溯，
 * 遇到空缺日即终止。今日已专注则计入，否则从昨日开始。
 */

import type { SessionRecord } from "../types/session";

const MS_PER_DAY = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 计算连续专注天数。
 * 例：今/昨/前各 1 场 → 3；今日无但昨日有且今日无 → 0（断链）。
 *
 * @param now 可选时间戳，默认 Date.now()，便于测试注入
 */
export function computeStreakDays(sessions: SessionRecord[], now: number = Date.now()): number {
  const completed = sessions.filter((s) => s.status === "completed");
  if (completed.length === 0) return 0;

  // 收集所有专注日（去重）
  const daySet = new Set<number>();
  for (const s of completed) {
    daySet.add(startOfDay(s.startedAt));
  }

  const today = startOfDay(now);
  const days = Array.from(daySet)
    .filter((d) => d <= today) // 排除未来日（测试场景或时间偏差）
    .sort((a, b) => b - a);
  if (days.length === 0) return 0;

  // 如果今日无专注，从昨日开始算（今日尚未专注时仍保留连续记录）
  let cursor = days[0] === today ? today : today - MS_PER_DAY;

  let streak = 0;
  for (const d of days) {
    if (d === cursor) {
      streak += 1;
      cursor -= MS_PER_DAY;
    } else if (d < cursor) {
      // 中间断链
      break;
    }
    // d > cursor 表示有未来日的会话，跳过
  }
  return streak;
}

/**
 * 累计专注时长（秒），仅统计已完成会话。
 */
export function computeTotalDurationSec(sessions: SessionRecord[]): number {
  return sessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.actualDurationSec, 0);
}

/**
 * 把累计秒数格式化为自然语言（用于 Hero 展示）。
 * 例：0 → "还没有专注记录"；30min → "专注过 30 分钟"；90min → "累计专注 1 小时 30 分钟"。
 */
export function formatTotalDurationMin(totalSec: number): string {
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin <= 0) return "还没有专注记录";
  if (totalMin < 60) return `专注过 ${totalMin} 分钟`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `累计专注 ${hours} 小时`;
  return `累计专注 ${hours} 小时 ${mins} 分钟`;
}

/**
 * 连续专注天数 → 自然语言标签（与日报文案口径一致）。
 * streak=0 返回空串（不渲染）；streak=1 "今天是你专注的第 1 天"；≥2 "这是你连续专注的第 N 天"。
 */
export function streakLabel(streakDays: number): string {
  if (streakDays <= 0) return "";
  if (streakDays === 1) return "今天是你专注的第 1 天";
  return `这是你连续专注的第 ${streakDays} 天`;
}

