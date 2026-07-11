/**
 * 全局 localStorage 键名常量。
 * 统一管理，防止 db.ts clearAll 与各模块写入键名漂移。
 */
export const STORAGE_KEYS = {
  /** 会话运行态持久化 */
  SESSION_STATE: 'zept-session-state',
  /** 欢迎页已看标记 */
  WELCOME_SEEN: 'zept_welcome_seen',
  /** 日报/周报缓存前缀 */
  REPORT_PREFIX: 'zept-report-',
  /** 数据版本号（完整性校验） */
  DATA_VERSION: 'zept-data-version',
} as const;
