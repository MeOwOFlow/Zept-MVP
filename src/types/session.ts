// 会话状态
export type SessionStatus =
  | 'planned'
  | 'focusing'
  | 'paused'
  | 'break'
  | 'completed'
  | 'abandoned';

// 自评数据
export interface SelfAssessment {
  mood: 1 | 2 | 3 | 4 | 5;
  focus: 1 | 2 | 3 | 4 | 5;
}

// 洞察来源与置信度
export type InsightSource = 'llm' | 'template' | 'fallback' | 'care';
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
  preAssessment: SelfAssessment | null;
  postAssessment: SelfAssessment | null;
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
