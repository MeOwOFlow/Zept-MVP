import { expectTypeOf } from 'vitest';
import type {
  SessionStatus,
  Rating,
  PreAssessment,
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

expectTypeOf<Rating>().toEqualTypeOf<1 | 2 | 3 | 4 | 5>();
expectTypeOf<PreAssessment>().toMatchTypeOf<{ mood: Rating }>();
expectTypeOf<SelfAssessment>().toMatchTypeOf<{ mood: Rating; focus: Rating }>();

expectTypeOf<InsightSource>().toEqualTypeOf<'llm' | 'template' | 'fallback' | 'care' | 'care-llm'>();
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
  preAssessment: PreAssessment | null;
  postAssessment: SelfAssessment | null;
  breakMoods: Array<{ cycleIndex: number; mood: 1 | 2 | 3 | null; timestamp: number }>;
  insightId?: string;
}>();

expectTypeOf<PomodoroState>().toMatchTypeOf<{
  mode: 'work' | 'short_break';
  cyclesCompleted: number;
  workDurationMin: number;
  shortBreakMin: number;
  targetCycles: number;
}>();
