/**
 * @rn-status RN-READY
 * 日期 helper（框架无关，为 RN 迁移预留）
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 计算距考还有几天（今天 0 点为基准，向上取整）
 * - 今天 → 0
 * - 明天 → 1
 * - 已过期 → -1
 */
export function daysUntilExam(examDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate + 'T00:00:00');
  const diff = exam.getTime() - today.getTime();
  if (diff < 0) return -1;
  return Math.round(diff / DAY_MS);
}

/**
 * 格式化距考天数为徽章文案
 */
export function daysUntilBadge(examDate: string): string {
  const d = daysUntilExam(examDate);
  if (d === -1) return '考试加油';
  if (d === 0) return '今天考试';
  return `距考 ${d} 天`;
}

/**
 * 格式化日期为「M月D日」
 */
export function formatExamDate(examDate: string): string {
  const d = new Date(examDate + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
