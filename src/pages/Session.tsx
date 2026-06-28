import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '../stores/userStore';
import { useSessionStore } from '../stores/sessionStore';
import { generateInsight } from '../lib/insight';
import { getRecentSessions, getUsefulInsights, updateInsightFeedback } from '../lib/db';
import { shouldTriggerCareGate, CARE_GATE_RESOURCES } from '../lib/rules';
import { daysUntilExam } from '../lib/date';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Slider } from '../components/Slider';
import type { SelfAssessment, Insight, SessionRecord, PomodoroState } from '../types/session';
import type { PomodoroConfig } from '../types/user';
import '../styles/session.css';

type Rating = 1 | 2 | 3 | 4 | 5;
type Phase = 'idle' | 'preAssess' | 'running' | 'confirmEnd' | 'postAssess' | 'loading' | 'insight';

const WORK_MIN = 1, WORK_MAX = 180;
const BREAK_MIN = 1, BREAK_MAX = 60;
const CYCLES_MIN = 1, CYCLES_MAX = 12;

const POMODORO_PRESETS: Array<{ id: string; label: string; sub: string; config: PomodoroConfig }> = [
  { id: 'classic', label: '经典', sub: '25/5 ×4', config: { workDurationMin: 25, shortBreakMin: 5, targetCycles: 4 } },
  { id: 'deep', label: '深度', sub: '50/10 ×3', config: { workDurationMin: 50, shortBreakMin: 10, targetCycles: 3 } },
  { id: 'sprint', label: '冲刺', sub: '90/15 ×2', config: { workDurationMin: 90, shortBreakMin: 15, targetCycles: 2 } },
];

interface DraftConfig {
  workDurationMin?: number;
  shortBreakMin?: number;
  targetCycles?: number;
}

// Stepper: [-] [N 分钟] [+]
function Stepper({
  value, onChange, min, max, step = 1, disabled = false, unit = '分钟', ariaLabel,
}: {
  value?: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  unit?: string;
  ariaLabel: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  return (
    <div className={`zept-stepper ${disabled ? 'zept-stepper--disabled' : ''}`}>
      <button
        type="button"
        className="zept-stepper__btn"
        onClick={() => value !== undefined && onChange(clamp(value - step))}
        disabled={disabled || value === undefined || value <= min}
        aria-label={`${ariaLabel} 减少`}
      >−</button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        className="zept-stepper__input"
        value={value ?? ''}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder="--"
      />
      <span className="zept-stepper__unit">{unit}</span>
      <button
        type="button"
        className="zept-stepper__btn"
        onClick={() => value !== undefined && onChange(clamp(value + step))}
        disabled={disabled || value === undefined || value >= max}
        aria-label={`${ariaLabel} 增加`}
      >+</button>
    </div>
  );
}

export default function Session() {
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const currentSession = useSessionStore((s) => s.currentSession);
  const pomodoroState = useSessionStore((s) => s.pomodoroState);
  const remainingSec = useSessionStore((s) => s.remainingSec);
  const isRunning = useSessionStore((s) => s.isRunning);
  const interruptions = useSessionStore((s) => s.interruptions);
  const startSession = useSessionStore((s) => s.startSession);
  const pauseSession = useSessionStore((s) => s.pauseSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const tick = useSessionStore((s) => s.tick);
  const setPreMoodInStore = useSessionStore((s) => s.setPreMood);
  const endSession = useSessionStore((s) => s.endSession);

  const [phase, setPhase] = useState<Phase>('idle');
  const [isPomodoro, setIsPomodoro] = useState(true);
  const [draft, setDraft] = useState<DraftConfig>({});
  const [preMood, setPreMood] = useState<Rating>(3);
  const [postMood, setPostMood] = useState<Rating>(3);
  const [postFocus, setPostFocus] = useState<Rating>(3);
  const [insight, setInsight] = useState<Insight | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (profile?.pomodoroConfig) {
      const c = profile.pomodoroConfig;
      setDraft({
        workDurationMin: c.workDurationMin,
        shortBreakMin: c.shortBreakMin,
        targetCycles: c.targetCycles,
      });
    } else {
      setDraft({
        workDurationMin: 25,
        shortBreakMin: 5,
        targetCycles: 4,
      });
    }
  }, [profile]);

  // 刷新恢复：检测未完成的 session，自动进 running 阶段（isRunning=false 即 paused 态）
  useEffect(() => {
    if (currentSession
      && currentSession.status !== 'completed'
      && currentSession.status !== 'abandoned'
      && phase === 'idle') {
      setPhase('running');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'running' && isRunning) {
      timerRef.current = setInterval(() => tick(), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase, isRunning, tick]);

  useEffect(() => {
    if (phase === 'running' && currentSession?.status === 'completed') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setPhase('postAssess');
    }
  }, [phase, currentSession?.status]);

  const isValid = (v: number | undefined, min: number, max: number): v is number =>
    v !== undefined && v >= min && v <= max && Number.isInteger(v);

  const allSet = isValid(draft.workDurationMin, WORK_MIN, WORK_MAX)
    && isValid(draft.shortBreakMin, BREAK_MIN, BREAK_MAX)
    && isValid(draft.targetCycles, CYCLES_MIN, CYCLES_MAX);

  const updateDraft = (patch: Partial<DraftConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const applyPreset = (config: PomodoroConfig) => {
    setDraft({
      workDurationMin: config.workDurationMin,
      shortBreakMin: config.shortBreakMin,
      targetCycles: config.targetCycles,
    });
  };

  const handleStart = async () => {
    if (!profile) return;
    if (isPomodoro) {
      if (!allSet) return;
      const config: PomodoroConfig = {
        workDurationMin: draft.workDurationMin!,
        shortBreakMin: draft.shortBreakMin!,
        targetCycles: draft.targetCycles!,
      };
      const current = profile.pomodoroConfig;
      const sameConfig = current
        && current.workDurationMin === config.workDurationMin
        && current.shortBreakMin === config.shortBreakMin
        && current.targetCycles === config.targetCycles;
      if (!sameConfig) {
        const updated = { ...profile, pomodoroConfig: config };
        await setProfile(updated);
        startSession(updated, true);
      } else {
        startSession(profile, true);
      }
    } else {
      startSession(profile, false);
    }
    setPhase('preAssess');
  };

  const handlePreDone = () => {
    setPreMoodInStore(preMood);
    setPhase('running');
  };
  const handleEndClick = () => setPhase('confirmEnd');
  const handleConfirmEnd = () => setPhase('postAssess');

  const handlePostSubmit = async () => {
    if (!currentSession) return;
    setPhase('loading');
    const postAssessment: SelfAssessment = { mood: postMood, focus: postFocus };
    const [recentSessions, usefulInsights] = await Promise.all([
      getRecentSessions(10),
      getUsefulInsights(3),
    ]);
    const sessionForInsight: SessionRecord = { ...currentSession, postAssessment };
    await endSession(postAssessment);
    const mode: PomodoroState['mode'] = pomodoroState?.mode ?? 'work';
    const generated = await generateInsight(sessionForInsight, recentSessions, usefulInsights, mode);
    setInsight(generated);
    setPhase('insight');
  };

  const handleFeedback = async (fb: 'useful' | 'useless') => {
    if (!insight) return;
    await updateInsightFeedback(insight.id, fb);
    setInsight({ ...insight, feedback: fb });
  };

  const handleReset = () => {
    setPhase('idle');
    setInsight(null);
    setPreMood(3); setPostMood(3); setPostFocus(3);
  };

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const countdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const totalSec = pomodoroState
    ? pomodoroState.mode === 'work' ? pomodoroState.workDurationMin * 60
      : pomodoroState.shortBreakMin * 60
    : 0;
  const progress = totalSec > 0 ? 1 - remainingSec / totalSec : 0;
  const R = 120;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - progress);
  const modeLabel = pomodoroState
    ? pomodoroState.mode === 'work'
      ? `专注中 ${pomodoroState.cyclesCompleted + 1}/${pomodoroState.targetCycles}`
      : '休息中'
    : '';

  return (
    <div className="zept-session">
      {profile && (
        <div className="zept-session__badge">距考 {daysUntilExam(profile.examDate)} 天</div>
      )}

      {phase === 'idle' && (
        <Card>
          <h2 className="zept-session__title">准备开始</h2>
          <div className="zept-session__mode">
            <button
              type="button"
              className={`zept-chip ${isPomodoro ? 'zept-chip--active' : ''}`}
              onClick={() => setIsPomodoro(true)}
            >番茄模式</button>
            <button
              type="button"
              className={`zept-chip ${!isPomodoro ? 'zept-chip--active' : ''}`}
              onClick={() => setIsPomodoro(false)}
            >自由模式</button>
          </div>

          {isPomodoro && (
            <div className="zept-session__config">
              <div className="zept-session__presets-row">
                {POMODORO_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`zept-preset-tile ${
                      draft.workDurationMin === p.config.workDurationMin
                      && draft.shortBreakMin === p.config.shortBreakMin
                      && draft.targetCycles === p.config.targetCycles
                        ? 'zept-preset-tile--active' : ''
                    }`}
                    onClick={() => applyPreset(p.config)}
                    aria-label={`${p.label} ${p.sub}`}
                  >
                    <span className="zept-preset-tile__label">{p.label}</span>
                    <span className="zept-preset-tile__sub">{p.sub}</span>
                  </button>
                ))}
              </div>

              <div className="zept-stepper-row">
                <span className="zept-stepper-row__label">专注</span>
                <Stepper
                  value={draft.workDurationMin}
                  onChange={(v) => updateDraft({ workDurationMin: v })}
                  min={WORK_MIN} max={WORK_MAX}
                  ariaLabel="专注时长"
                />
              </div>

              <div className="zept-stepper-row">
                <span className="zept-stepper-row__label">短休</span>
                <Stepper
                  value={draft.shortBreakMin}
                  onChange={(v) => updateDraft({ shortBreakMin: v })}
                  min={BREAK_MIN} max={BREAK_MAX}
                  ariaLabel="短休时长"
                />
              </div>

              <div className="zept-stepper-row">
                <span className="zept-stepper-row__label">轮次</span>
                <Stepper
                  value={draft.targetCycles}
                  onChange={(v) => updateDraft({ targetCycles: v })}
                  min={CYCLES_MIN} max={CYCLES_MAX}
                  unit="轮"
                  ariaLabel="轮次"
                />
              </div>
            </div>
          )}

          <Button variant="filled" onClick={handleStart} disabled={isPomodoro && !allSet}>
            开始专注
          </Button>
        </Card>
      )}

      {phase === 'preAssess' && (
        <Card>
          <h2 className="zept-session__title">开始前，现在感觉怎么样？</h2>
          <Slider label="情绪" value={preMood} onChange={setPreMood} />
          <Button variant="filled" onClick={handlePreDone}>开始</Button>
        </Card>
      )}

      {phase === 'running' && (
        <Card>
          <div className={`zept-session__timer${isRunning ? " zept-session__timer--running" : ""}`}>
            <svg viewBox="0 0 260 260" className="zept-session__ring">
              <circle cx="130" cy="130" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              <circle
                cx="130" cy="130" r={R} fill="none"
                stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                transform="rotate(-90 130 130)"
              />
            </svg>
            <div className="zept-session__countdown">{countdown}</div>
          </div>
          <div className="zept-session__mode-label">{modeLabel}</div>
          {interruptions > 0 && (
            <div className="zept-session__interrupt">离开 {interruptions} 次</div>
          )}
          <div className="zept-session__controls">
            {isRunning ? (
              <Button variant="outlined" onClick={pauseSession}>暂停</Button>
            ) : (
              <Button variant="outlined" onClick={resumeSession}>继续</Button>
            )}
            <Button variant="text" onClick={handleEndClick}>结束</Button>
          </div>
        </Card>
      )}

      {phase === 'confirmEnd' && (
        <Card>
          <p className="zept-session__confirm-text">确定结束本次专注？</p>
          <div className="zept-session__controls">
            <Button variant="filled" onClick={handleConfirmEnd}>确认</Button>
            <Button variant="text" onClick={() => setPhase('running')}>取消</Button>
          </div>
        </Card>
      )}

      {phase === 'postAssess' && (
        <Card>
          <h2 className="zept-session__title">结束了，感受如何？</h2>
          <Slider.Dual mood={postMood} focus={postFocus} onMoodChange={setPostMood} onFocusChange={setPostFocus} />
          <Button variant="filled" onClick={handlePostSubmit}>提交</Button>
        </Card>
      )}

      {phase === 'loading' && (
        <Card><p className="zept-session__loading">正在生成洞察...</p></Card>
      )}

      {phase === 'insight' && insight && (
        <Card>
          {shouldTriggerCareGate(insight.mood) ? (
            <>
              <h2 className="zept-session__title">今天看起来有些吃力</h2>
              <p className="zept-session__care">如果持续低落，可以联系{CARE_GATE_RESOURCES.counseling}，或拨打{CARE_GATE_RESOURCES.hotline}。</p>
            </>
          ) : (
            <>
              <h2 className="zept-session__title">这次的洞察</h2>
              <p className="zept-session__insight-text">{insight.text}</p>
              {insight.feedback === null && (
                <div className="zept-session__feedback">
                  <Button variant="outlined" onClick={() => handleFeedback('useful')}>有用</Button>
                  <Button variant="text" onClick={() => handleFeedback('useless')}>没用</Button>
                </div>
              )}
              {insight.feedback && (
                <p className="zept-session__feedback-done">已标记：{insight.feedback === 'useful' ? '有用' : '没用'}</p>
              )}
            </>
          )}
          <Button variant="filled" onClick={handleReset}>完成</Button>
        </Card>
      )}
    </div>
  );
}
