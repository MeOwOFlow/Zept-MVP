// 日期 helper（框架无关，为 RN 迁移预留）

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 计算距考还有几天（今天 0 点为基准，向上取整）
 * - 今天 23:59 选今天 → 0
 * - 今天 00:00 选明天 → 1
 * - 已过期 → 0（不返回负数）
 */
export function daysUntilExam(examDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate + 'T00:00:00');
  const diff = exam.getTime() - today.getTime();
  return Math.max(0, Math.round(diff / DAY_MS));
}

/**
 * 格式化日期为「M月D日」
 */
export function formatExamDate(examDate: string): string {
  const d = new Date(examDate + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
