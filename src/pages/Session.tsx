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

// 时长快捷值（chips 作为建议，输入框支持自定义任意分钟数）
const WORK_OPTIONS = [15, 25, 45, 60];
const SHORT_BREAK_OPTIONS = [3, 5, 10];
const LONG_BREAK_OPTIONS = [10, 15, 20];
const WORK_MIN = 1, WORK_MAX = 180;
const BREAK_MIN = 1, BREAK_MAX = 60;
const LONG_BREAK_EVERY_OPTIONS = [
  { value: 0, label: '关闭长休' },
  { value: 2, label: '每 2 轮' },
  { value: 3, label: '每 3 轮' },
  { value: 4, label: '每 4 轮' },
  { value: 5, label: '每 5 轮' },
  { value: 6, label: '每 6 轮' },
];

// 常用推荐组合（仅首次未配置时显示，配置过后不再出现）
const POMODORO_PRESETS: Array<{ id: string; label: string; config: PomodoroConfig }> = [
  { id: 'classic', label: '经典番茄', config: { workDurationMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 } },
  { id: 'deep', label: '深度专注', config: { workDurationMin: 50, shortBreakMin: 10, longBreakMin: 20, longBreakEvery: 4 } },
  { id: 'sprint', label: '冲刺模式', config: { workDurationMin: 90, shortBreakMin: 15, longBreakMin: 30, longBreakEvery: 3 } },
];

interface DraftConfig {
  workDurationMin?: number;
  shortBreakMin?: number;
  longBreakMin?: number;
  longBreakEvery?: number;
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
  const endSession = useSessionStore((s) => s.endSession);

  const [phase, setPhase] = useState<Phase>('idle');
  const [isPomodoro, setIsPomodoro] = useState(true);
  const [draft, setDraft] = useState<DraftConfig>({});
  const [preMood, setPreMood] = useState<Rating>(3);
  const [preFocus, setPreFocus] = useState<Rating>(3);
  const [postMood, setPostMood] = useState<Rating>(3);
  const [postFocus, setPostFocus] = useState<Rating>(3);
  const [insight, setInsight] = useState<Insight | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // profile 加载后，若已配置过番茄则同步到 draft（默认选中上次的值）
  useEffect(() => {
    if (profile?.pomodoroConfig) {
      setDraft(profile.pomodoroConfig);
    }
  }, [profile]);

  useEffect(() => {
    if (phase === 'running' && isRunning) {
      timerRef.current = setInterval(() => tick(), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase, isRunning, tick]);

  const isValidWork = (v: number | undefined): v is number =>
    v !== undefined && v >= WORK_MIN && v <= WORK_MAX && Number.isInteger(v);
  const isValidBreak = (v: number | undefined): v is number =>
    v !== undefined && v >= BREAK_MIN && v <= BREAK_MAX && Number.isInteger(v);

  const longBreakDisabled = draft.longBreakEvery === 0;
  const allSet = isValidWork(draft.workDurationMin)
    && isValidBreak(draft.shortBreakMin)
    && (longBreakDisabled || isValidBreak(draft.longBreakMin))
    && draft.longBreakEvery !== undefined;

  const updateDraft = (patch: Partial<DraftConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const applyPreset = (config: PomodoroConfig) => {
    setDraft(config);
  };

  const parseNum = (raw: string): number | undefined => {
    const v = parseInt(raw, 10);
    return isNaN(v) ? undefined : v;
  };

  const handleStart = async () => {
    if (!profile) return;
    if (isPomodoro) {
      if (!allSet) return;
      const config: PomodoroConfig = draft as PomodoroConfig;
      const current = profile.pomodoroConfig;
      const sameConfig = current
        && current.workDurationMin === config.workDurationMin
        && current.shortBreakMin === config.shortBreakMin
        && current.longBreakMin === config.longBreakMin
        && current.longBreakEvery === config.longBreakEvery;
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

  const handlePreDone = () => setPhase('running');

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
    setPreMood(3); setPreFocus(3); setPostMood(3); setPostFocus(3);
  };

  // 格式化倒计时
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const countdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const totalSec = pomodoroState
    ? pomodoroState.mode === 'work' ? pomodoroState.workDurationMin * 60
      : pomodoroState.mode === 'short_break' ? pomodoroState.shortBreakMin * 60
      : pomodoroState.longBreakMin * 60
    : 0;
  const progress = totalSec > 0 ? 1 - remainingSec / totalSec : 0;
  const R = 120;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - progress);

  const modeLabel = pomodoroState?.mode === 'work' ? '专注中' : pomodoroState?.mode === 'short_break' ? '短休息' : '长休息';

  // 推荐区仅在用户从未配置过番茄时显示（配置过后不再出现）
  const showPresets = !profile?.pomodoroConfig;

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
            <>
              {showPresets && (
                <div className="zept-session__presets">
                  <p className="zept-session__presets-label">常用推荐 · 点击即用</p>
                  <div className="zept-session__presets-chips">
                    {POMODORO_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="zept-chip zept-chip--preset"
                        onClick={() => applyPreset(p.config)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="zept-session__config">
                <div className="zept-session__field">
                  <label className="zept-session__field-label">专注时长</label>
                  <div className="zept-session__chips">
                    {WORK_OPTIONS.map((min) => (
                      <button
                        key={min}
                        type="button"
                        className={`zept-chip ${draft.workDurationMin === min ? 'zept-chip--active' : ''}`}
                        onClick={() => updateDraft({ workDurationMin: min })}
                      >
                        {min} 分钟
                      </button>
                    ))}
                  </div>
                  <div className="zept-session__number-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={WORK_MIN}
                      max={WORK_MAX}
                      step={1}
                      className="zept-session__number-input"
                      value={draft.workDurationMin ?? ''}
                      onChange={(e) => updateDraft({ workDurationMin: parseNum(e.target.value) })}
                      placeholder="自定义"
                      aria-label="专注时长（分钟）"
                    />
                    <span className="zept-session__number-suffix">分钟</span>
                  </div>
                </div>

                <div className="zept-session__field">
                  <label className="zept-session__field-label">短休时长</label>
                  <div className="zept-session__chips">
                    {SHORT_BREAK_OPTIONS.map((min) => (
                      <button
                        key={min}
                        type="button"
                        className={`zept-chip ${draft.shortBreakMin === min ? 'zept-chip--active' : ''}`}
                        onClick={() => updateDraft({ shortBreakMin: min })}
                      >
                        {min} 分钟
                      </button>
                    ))}
                  </div>
                  <div className="zept-session__number-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={BREAK_MIN}
                      max={BREAK_MAX}
                      step={1}
                      className="zept-session__number-input"
                      value={draft.shortBreakMin ?? ''}
                      onChange={(e) => updateDraft({ shortBreakMin: parseNum(e.target.value) })}
                      placeholder="自定义"
                      aria-label="短休时长（分钟）"
                    />
                    <span className="zept-session__number-suffix">分钟</span>
                  </div>
                </div>

                <div className="zept-session__field">
                  <label className="zept-session__field-label">长休时长</label>
                  <div className="zept-session__chips">
                    {LONG_BREAK_OPTIONS.map((min) => (
                      <button
                        key={min}
                        type="button"
                        className={`zept-chip ${draft.longBreakMin === min ? 'zept-chip--active' : ''}`}
                        onClick={() => updateDraft({ longBreakMin: min })}
                        disabled={longBreakDisabled}
                      >
                        {min} 分钟
                      </button>
                    ))}
                  </div>
                  <div className="zept-session__number-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={BREAK_MIN}
                      max={BREAK_MAX}
                      step={1}
                      className="zept-session__number-input"
                      value={draft.longBreakMin ?? ''}
                      onChange={(e) => updateDraft({ longBreakMin: parseNum(e.target.value) })}
                      placeholder="自定义"
                      aria-label="长休时长（分钟）"
                      disabled={longBreakDisabled}
                    />
                    <span className="zept-session__number-suffix">分钟</span>
                  </div>
                </div>

                <div className="zept-session__field">
                  <label className="zept-session__field-label">长休触发</label>
                  <div className="zept-session__chips">
                    {LONG_BREAK_EVERY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`zept-chip ${draft.longBreakEvery === opt.value ? 'zept-chip--active' : ''}`}
                        onClick={() => {
                          if (opt.value === 0) {
                            updateDraft({ longBreakEvery: 0, longBreakMin: undefined });
                          } else {
                            updateDraft({ longBreakEvery: opt.value });
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <Button
            variant="filled"
            onClick={handleStart}
            disabled={isPomodoro && !allSet}
          >
            开始专注
          </Button>
        </Card>
      )}

      {phase === 'preAssess' && (
        <Card>
          <h2 className="zept-session__title">开始前，先感受一下自己</h2>
          <Slider.Dual mood={preMood} focus={preFocus} onMoodChange={setPreMood} onFocusChange={setPreFocus} />
          <Button variant="filled" onClick={handlePreDone}>开始</Button>
        </Card>
      )}

      {phase === 'running' && (
        <Card>
          <div className="zept-session__timer">
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
            <div className="zept-session__interrupt">中断 {interruptions} 次</div>
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
                <p className="zept-session__feedback-done">
                  已标记：{insight.feedback === 'useful' ? '有用' : '没用'}
                </p>
              )}
            </>
          )}
          <Button variant="filled" onClick={handleReset}>完成</Button>
        </Card>
      )}
    </div>
  );
}
