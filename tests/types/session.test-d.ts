import { expectTypeOf } from 'vitest';
import type {
  SessionStatus,
  SelfAssessment,
  Insight,
  InsightSource,
  InsightConfidence,
  InsightFeedback,
  SessionRecord,
  PomodoroState,
} from '../../src/types/session';

expectTypeOf<SessionStatus>().toEqualTypeOf<
  'planned' | 'focusing' | 'paused' | 'break' | 'completed' | 'abandoned'
>();

expectTypeOf<SelfAssessment>().toMatchTypeOf<{ mood: 1 | 2 | 3 | 4 | 5; focus: 1 | 2 | 3 | 4 | 5 }>();

expectTypeOf<InsightSource>().toEqualTypeOf<'llm' | 'template' | 'fallback' | 'care'>();
expectTypeOf<InsightConfidence>().toEqualTypeOf<'high' | 'medium' | 'low'>();

expectTypeOf<Insight>().toMatchTypeOf<{
  id: string;
  sessionId: string;
  createdAt: number;
  text: string;
  source: InsightSource;
  confidence: InsightConfidence;
  feedback: InsightFeedback;
  mood: number;
}>();

expectTypeOf<SessionRecord>().toMatchTypeOf<{
  id: string;
  userId: string;
  goal: string;
  daysToExam: number;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  plannedDurationSec: number;
  actualDurationSec: number;
  isPomodoro: boolean;
  pomodoroCyclesCompleted: number;
  interruptions: number;
  interruptionEvents: Array<{ recoveredAt: number; durationMs: number }>;
  startHour: number;
  endHour: number;
  preAssessment: SelfAssessment | null;
  postAssessment: SelfAssessment | null;
  insightId?: string;
}>();

expectTypeOf<PomodoroState>().toMatchTypeOf<{
  mode: 'work' | 'short_break';
  cyclesCompleted: number;
  workDurationMin: number;
  shortBreakMin: number;
  targetCycles: number;
}>();
