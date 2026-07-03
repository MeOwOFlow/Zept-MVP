// 会话状态
export type SessionStatus =
  | 'planned'
  | 'focusing'
  | 'paused'
  | 'break'
  | 'completed'
  | 'abandoned';

// 自评数据
export type Rating = 1 | 2 | 3 | 4 | 5;

// 开场前评：只问情绪（专注度尚未发生，无法预判）
export interface PreAssessment {
  mood: Rating;
}

// 结束后评：情绪 + 实际感受到的专注度
export interface SelfAssessment {
  mood: Rating;
  focus: Rating;
}

// 休息时快速情绪采样：三选一 + 可跳过
// mood: 3=还行, 2=一般, 1=有点累; null=用户选择"不想回答"
export interface BreakMood {
  cycleIndex: number;   // 第几个 work→break 切换（0-based）
  mood: 1 | 2 | 3 | null;
  timestamp: number;
}

// 洞察来源与置信度
export type InsightSource = 'llm' | 'template' | 'fallback' | 'care' | 'care-llm';
export type InsightConfidence = 'high' | 'medium' | 'low';
export type InsightFeedback = 'useful' | 'useless' | null;

// 洞察数据
export interface Insight {
  id: string;
  sessionId: string;
  createdAt: number;
  text: string;
  source: InsightSource;
  confidence: InsightConfidence;
  feedback: InsightFeedback;
  mood: number; // 1-5
}

// 中断事件
export interface InterruptionEvent {
  recoveredAt: number;
  durationMs: number;
}

// 会话记录（最终版，见类型对齐说明）
export interface SessionRecord {
  id: string;
  userId: string;              // 固定 'local'
  goal: string;                // 冗余存储，离线可读
  daysToExam: number;          // 冗余存储
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  plannedDurationSec: number;  // 番茄模式 25*60，自由模式 0
  actualDurationSec: number;
  isPomodoro: boolean;
  pomodoroCyclesCompleted: number;
  interruptions: number;
  interruptionEvents: InterruptionEvent[];
  startHour: number;
  endHour: number;
  preAssessment: PreAssessment | null;
  postAssessment: SelfAssessment | null;
  breakMoods: BreakMood[];
  insightId?: string;
}

// 番茄状态机
export interface PomodoroState {
  mode: 'work' | 'short_break';
  cyclesCompleted: number;
  workDurationMin: number;
  shortBreakMin: number;
  targetCycles: number;
}
