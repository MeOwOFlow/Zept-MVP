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
}
