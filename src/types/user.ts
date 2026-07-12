/**
 * @rn-status RN-READY
 * 纯类型定义，无运行时依赖，RN 直接复用。
 */
export interface PomodoroConfig {
  workDurationMin: number;
  shortBreakMin: number;
  targetCycles: number;  // 计划完成轮次，1-12
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  workDurationMin: 25,
  shortBreakMin: 5,
  targetCycles: 4,
};

export type ThemeMode = 'auto' | 'light' | 'dark';
export const DEFAULT_THEME: ThemeMode = 'auto';

export type ReplyStyle = 'rational' | 'emotional' | 'balanced';
export const DEFAULT_REPLY_STYLE: ReplyStyle = 'balanced';

export interface UserProfile {
  goal: string;
  examDate: string;  // ISO YYYY-MM-DD
  topDistractions: string[];
  onboarded: boolean;
  pomodoroConfig: PomodoroConfig | null;  // null = 未配置，由用户在 Session 首次选择
  theme: ThemeMode;
  replyStyle: ReplyStyle;
  soundEnabled: boolean;      // 番茄钟阶段切换提示音，默认 true
  vibrationEnabled: boolean;  // 振动反馈（Android），默认 true
}

/**
 * 用户专注习惯画像（v0.2 复赛预留，MVP 不实现积累）。
 * 用于跨会话习惯级洞察，让 LLM 看见用户的长期节奏。
 *
 * 积累方式：每日首次洞察生成时异步重算（基于最近 30 天会话）。
 * 存储：IndexedDB user_patterns 表。
 * LLM 注入：summarizePattern(pattern) 翻译成自然语言摘要后传入 prompt。
 */
export interface UserProfilePattern {
  typicalWorkDurationMin: number;     // 习惯性专注时长（P50）
  typicalBreakMin: number;
  peakHours: number[];                 // 高效时段（基于 startHour × focus 分布）
  moodBaseline: number;               // 情绪/专注/离开基线
  focusBaseline: number;
  leaveRatePerSession: number;
  preferredMode: 'pomodoro' | 'free';
  usefulTopics: string[];             // 被标 useful 的洞察主题聚类
  version: number;                    // 画像版本（用于失效判断）
  updatedAt: number;
}
