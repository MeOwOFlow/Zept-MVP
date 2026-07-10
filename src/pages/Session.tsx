import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '../stores/userStore';
import { useSessionStore } from '../stores/sessionStore';
import { generateInsight } from '../lib/insight';
import { getRecentSessions, getUsefulInsights, getAllSessions, updateInsightFeedback } from '../lib/db';
import { shouldTriggerCareGate } from '../lib/rules';
import { daysUntilBadge } from '../lib/date';
import { computeStreakDays, computeTotalDurationSec } from '../lib/streak';
import { exportInsightImage } from '../lib/exportImage';
import { unlockAudioContext, requestNotificationPermission } from '../lib/chime';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Slider } from '../components/Slider';
import type { SelfAssessment, Insight, SessionRecord, SessionInsightMode } from '../types/session';
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

// Circular Trio — 圆环内嵌三 stepper 的常量
const TRIO_RING_R = 140;
const TRIO_CIRCUMFERENCE = 2 * Math.PI * TRIO_RING_R;
const FOCUS_STEP = 5;

type TrioKey = 'work' | 'break' | 'rounds';

function clampFocus(v: number): number {
  const rounded = Math.round(v / FOCUS_STEP) * FOCUS_STEP;
  return Math.max(WORK_MIN, Math.min(WORK_MAX, rounded));
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
  const setBreakMoodInStore = useSessionStore((s) => s.setBreakMood);
  const endSession = useSessionStore((s) => s.endSession);

  const [phase, setPhase] = useState<Phase>('idle');
  const [isPomodoro, setIsPomodoro] = useState(true);
  const [draft, setDraft] = useState<DraftConfig>({});
  const [preMood, setPreMood] = useState<Rating>(3);
  const [postMood, setPostMood] = useState<Rating>(3);
  const [postFocus, setPostFocus] = useState<Rating>(3);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [completedSession, setCompletedSession] = useState<SessionRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Circular Trio 输入字符串状态（text input 本地编辑，blur 时提交到 draft）
  const [trioText, setTrioText] = useState({ work: '', break: '', rounds: '' });
  // bump 动画状态
  const [bump, setBump] = useState<{ key: TrioKey; dir: 1 | -1 } | null>(null);

  // draft 变化时（预设/按钮/blur 提交）同步输入框显示
  useEffect(() => {
    setTrioText({
      work: draft.workDurationMin !== undefined ? String(draft.workDurationMin) : '',
      break: draft.shortBreakMin !== undefined ? String(draft.shortBreakMin) : '',
      rounds: draft.targetCycles !== undefined ? String(draft.targetCycles) : '',
    });
  }, [draft.workDurationMin, draft.shortBreakMin, draft.targetCycles]);

  // bump 动画 300ms 后自动清除
  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => setBump(null), 300);
    return () => clearTimeout(t);
  }, [bump]);

  const adjustTrio = (key: TrioKey, dir: 1 | -1) => {
    if (key === 'work') {
      const cur = draft.workDurationMin ?? 25;
      updateDraft({ workDurationMin: clampFocus(cur + dir * FOCUS_STEP) });
    } else if (key === 'break') {
      const cur = draft.shortBreakMin ?? 5;
      updateDraft({ shortBreakMin: Math.max(BREAK_MIN, Math.min(BREAK_MAX, cur + dir)) });
    } else {
      const cur = draft.targetCycles ?? 4;
      updateDraft({ targetCycles: Math.max(CYCLES_MIN, Math.min(CYCLES_MAX, cur + dir)) });
    }
    setBump({ key, dir });
  };

  const commitTrioInput = (key: TrioKey, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    const parsed = parseInt(digits, 10);
    if (isNaN(parsed) || parsed < 1) {
      // 空或无效：回退到当前 draft（不修改），由 sync effect 刷新显示
      setTrioText((prev) => ({
        ...prev,
        [key]: key === 'work'
          ? String(draft.workDurationMin ?? '')
          : key === 'break'
            ? String(draft.shortBreakMin ?? '')
            : String(draft.targetCycles ?? ''),
      }));
      return;
    }
    if (key === 'work') {
      updateDraft({ workDurationMin: clampFocus(parsed) });
    } else if (key === 'break') {
      updateDraft({ shortBreakMin: Math.max(BREAK_MIN, Math.min(BREAK_MAX, parsed)) });
    } else {
      updateDraft({ targetCycles: Math.max(CYCLES_MIN, Math.min(CYCLES_MAX, parsed)) });
    }
  };

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
    // 在用户手势调用栈内解锁 AudioContext（iOS Safari 必须）+ 请求通知权限
    unlockAudioContext();
    requestNotificationPermission();
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
    setCompletedSession(sessionForInsight);
    const mode: SessionInsightMode = pomodoroState?.mode ?? 'free';
    const replyStyle = profile?.replyStyle ?? 'balanced';
    let generated: Insight | null = null;
    try {
      generated = await generateInsight(sessionForInsight, recentSessions, usefulInsights, mode, replyStyle);
    } catch (err) {
      console.error('insight generation failed', err);
      generated = {
        id: `i_${Date.now()}_err`,
        sessionId: sessionForInsight.id,
        createdAt: Date.now(),
        text: '这轮专注结束了，记录已保存。',
        source: 'fallback',
        confidence: 'low',
        feedback: null,
        mood: postMood,
      };
    }
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
    setCompletedSession(null);
    setPreMood(3); setPostMood(3); setPostFocus(3);
  };

  const handleExportInsight = async () => {
    if (!insight || !completedSession) return;
    setExporting(true);
    try {
      // endSession 已把 completedSession 写入 IndexedDB，直接取全量即可，避免重复计算
      const allSessions = await getAllSessions();
      const streakDays = computeStreakDays(allSessions);
      const totalDurationSec = computeTotalDurationSec(allSessions);
      await exportInsightImage({
        insight,
        session: completedSession,
        streakDays,
        totalDurationSec,
      });
    } catch (err) {
      console.error('export insight image failed', err);
      alert('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
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
    : '专注中';

  const isOnBreak = pomodoroState?.mode === 'short_break';
  const currentBreakCycle = pomodoroState?.cyclesCompleted ?? 0;
  const breakMoodRecorded = currentSession?.breakMoods.some(
    (b) => b.cycleIndex === currentBreakCycle,
  ) ?? false;
  const showBreakMood = isOnBreak && !breakMoodRecorded;

  return (
    <div className="zept-session">
      {profile && (
        <div className="zept-session__badge">{daysUntilBadge(profile.examDate)}</div>
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

              {/* Circular Trio — 圆环内嵌三 stepper */}
              <div className="zept-trio-area">
                <div className="zept-trio-card">
                  <div className="zept-trio-ring">
                    <svg viewBox="0 0 300 300">
                      <circle className="zept-trio-track" cx="150" cy="150" r={TRIO_RING_R} />
                      <circle
                        className="zept-trio-progress"
                        cx="150" cy="150" r={TRIO_RING_R}
                        strokeDasharray={TRIO_CIRCUMFERENCE}
                        strokeDashoffset={TRIO_CIRCUMFERENCE * (1 - Math.min((draft.workDurationMin ?? 0) / 120, 1))}
                      />
                    </svg>

                    <div className="zept-trio-stations">
                      {/* 上部：专注 + 短休（并列垂直 stepper） */}
                      <div className="zept-trio-top">
                        <div className="zept-trio-station focus-station">
                          <span className="zept-trio-label">专注</span>
                          <div className="zept-trio-controls">
                            <button
                              type="button"
                              className="zept-trio-btn"
                              onClick={() => adjustTrio('work', 1)}
                              aria-label="专注时长 增加"
                            >
                              <span className="material-symbols-rounded">expand_less</span>
                            </button>
                            <div
                              className={`zept-trio-value primary${
                                bump?.key === 'work' ? ` bump-${bump.dir > 0 ? 'up' : 'down'}` : ''
                              }`}
                            >
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                aria-label="专注时长"
                                value={trioText.work}
                                onChange={(e) => setTrioText((prev) => ({ ...prev, work: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                                onBlur={() => commitTrioInput('work', trioText.work)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              />
                            </div>
                            <button
                              type="button"
                              className="zept-trio-btn"
                              onClick={() => adjustTrio('work', -1)}
                              aria-label="专注时长 减少"
                            >
                              <span className="material-symbols-rounded">expand_more</span>
                            </button>
                          </div>
                          <span className="zept-trio-unit">分钟</span>
                        </div>

                        <div className="zept-trio-station">
                          <span className="zept-trio-label">短休</span>
                          <div className="zept-trio-controls">
                            <button
                              type="button"
                              className="zept-trio-btn"
                              onClick={() => adjustTrio('break', 1)}
                              aria-label="短休时长 增加"
                            >
                              <span className="material-symbols-rounded">expand_less</span>
                            </button>
                            <div
                              className={`zept-trio-value${
                                bump?.key === 'break' ? ` bump-${bump.dir > 0 ? 'up' : 'down'}` : ''
                              }`}
                            >
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                aria-label="短休时长"
                                value={trioText.break}
                                onChange={(e) => setTrioText((prev) => ({ ...prev, break: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                                onBlur={() => commitTrioInput('break', trioText.break)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              />
                            </div>
                            <button
                              type="button"
                              className="zept-trio-btn"
                              onClick={() => adjustTrio('break', -1)}
                              aria-label="短休时长 减少"
                            >
                              <span className="material-symbols-rounded">expand_more</span>
                            </button>
                          </div>
                          <span className="zept-trio-unit">分钟</span>
                        </div>
                      </div>

                      {/* 底部：轮次水平条 */}
                      <div className="zept-trio-rounds">
                        <button
                          type="button"
                          className="zept-trio-rounds-btn"
                          onClick={() => adjustTrio('rounds', -1)}
                          aria-label="轮次 减少"
                        >
                          <span className="material-symbols-rounded">remove</span>
                        </button>
                        <span className="zept-trio-rounds-label">轮次</span>
                        <span
                          className={`zept-trio-rounds-value${
                            bump?.key === 'rounds' ? ` bump-${bump.dir > 0 ? 'up' : 'down'}` : ''
                          }`}
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            aria-label="轮次"
                            value={trioText.rounds}
                            onChange={(e) => setTrioText((prev) => ({ ...prev, rounds: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                            onBlur={() => commitTrioInput('rounds', trioText.rounds)}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          />
                        </span>
                        <span className="zept-trio-rounds-unit">轮</span>
                        <button
                          type="button"
                          className="zept-trio-rounds-btn"
                          onClick={() => adjustTrio('rounds', 1)}
                          aria-label="轮次 增加"
                        >
                          <span className="material-symbols-rounded">add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isPomodoro && (
            <div className="zept-free-hint visible">
              <div className="zept-free-hint-card">
                <span className="material-symbols-rounded">info</span>
                <span>自由模式下，专注计时结束后手动停止，不设轮次限制。</span>
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
          {showBreakMood && (
            <div className="zept-break-mood">
              <p className="zept-break-mood__question">感觉如何？</p>
              <div className="zept-break-mood__options">
                <button
                  type="button"
                  className="zept-break-mood__option"
                  onClick={() => setBreakMoodInStore(3)}
                >还行</button>
                <button
                  type="button"
                  className="zept-break-mood__option"
                  onClick={() => setBreakMoodInStore(2)}
                >一般</button>
                <button
                  type="button"
                  className="zept-break-mood__option"
                  onClick={() => setBreakMoodInStore(1)}
                >有点累</button>
                <button
                  type="button"
                  className="zept-break-mood__option zept-break-mood__option--skip"
                  onClick={() => setBreakMoodInStore(null)}
                >不想回答</button>
              </div>
            </div>
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
              <p className="zept-session__care">{insight.text}</p>
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
              <div className="zept-session__export">
                <Button
                  variant="text"
                  onClick={handleExportInsight}
                  disabled={exporting}
                >
                  {exporting ? '生成中…' : '导出长图'}
                </Button>
              </div>
            </>
          )}
          <Button variant="filled" onClick={handleReset}>完成</Button>
        </Card>
      )}
    </div>
  );
}
