import type { SessionRecord, SelfAssessment } from '../types/session';
import type { UserProfile } from '../types/user';
import { daysUntilExam } from './date';

const INTERRUPTION_THRESHOLD_MS = 10_000;

interface InterruptionListener {
  target: 'document' | 'window';
  type: string;
  handler: EventListener;
}

let activeListeners: InterruptionListener[] | null = null;

export function createSession(user: UserProfile, isPomodoro: boolean): SessionRecord {
  const now = Date.now();
  const plannedDurationSec = isPomodoro && user.pomodoroConfig
    ? user.pomodoroConfig.workDurationMin * 60
    : 0;
  return {
    id: `s_${now}_${Math.random().toString(36).slice(2, 8)}`,
    userId: 'local',
    goal: user.goal,
    daysToExam: daysUntilExam(user.examDate),
    startedAt: now,
    endedAt: null,
    status: 'planned',
    plannedDurationSec,
    actualDurationSec: 0,
    isPomodoro,
    pomodoroCyclesCompleted: 0,
    interruptions: 0,
    interruptionEvents: [],
    startHour: new Date(now).getHours(),
    endHour: 0,
    preAssessment: null,
    postAssessment: null,
  };
}

export interface RecoverInfo {
  interruptions: number;
  recoveredAt: number;
  durationMs: number;
}

export function startInterruptionTracking(
  _sessionId: string,
  onRecover: (info: RecoverInfo) => void,
): void {
  stopInterruptionTracking();

  let hiddenAt: number | null = null;
  let count = 0;

  const onHidden = () => {
    if (hiddenAt === null) hiddenAt = Date.now();
  };

  const onVisible = () => {
    if (hiddenAt === null) return;
    const now = Date.now();
    const durationMs = now - hiddenAt;
    hiddenAt = null;
    if (durationMs >= INTERRUPTION_THRESHOLD_MS) {
      count += 1;
      onRecover({ interruptions: count, recoveredAt: now, durationMs });
    }
  };

  const visibilityHandler = (() => {
    if (document.visibilityState === 'hidden') onHidden();
    else onVisible();
  }) as EventListener;

  const blurHandler = (() => onHidden()) as EventListener;
  const focusHandler = (() => onVisible()) as EventListener;

  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('blur', blurHandler);
  window.addEventListener('focus', focusHandler);

  activeListeners = [
    { target: 'document', type: 'visibilitychange', handler: visibilityHandler },
    { target: 'window', type: 'blur', handler: blurHandler },
    { target: 'window', type: 'focus', handler: focusHandler },
  ];
}

export function stopInterruptionTracking(): void {
  if (!activeListeners) return;
  for (const { target, type, handler } of activeListeners) {
    if (target === 'document') {
      document.removeEventListener(type, handler);
    } else {
      window.removeEventListener(type, handler);
    }
  }
  activeListeners = null;
}

export function endSession(
  session: SessionRecord,
  postAssessment: SelfAssessment,
): SessionRecord {
  const now = Date.now();
  const actualDurationSec = Math.max(0, Math.round((now - session.startedAt) / 1000));
  return {
    ...session,
    endedAt: now,
    actualDurationSec,
    endHour: new Date(now).getHours(),
    postAssessment,
    status: 'completed',
  };
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s}秒`;
}
