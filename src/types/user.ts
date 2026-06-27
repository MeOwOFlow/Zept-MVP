export interface PomodoroConfig {
  workDurationMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;  // 0 = 关闭长休
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  workDurationMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
};

export type ThemeMode = 'auto' | 'light' | 'dark';

export const DEFAULT_THEME: ThemeMode = 'auto';

export interface UserProfile {
  goal: string;
  examDate: string;  // ISO YYYY-MM-DD
  topDistractions: string[];
  onboarded: boolean;
  pomodoroConfig: PomodoroConfig | null;  // null = 未配置，由用户在 Session 首次选择
  theme: ThemeMode;
}
