import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '../stores/userStore';
import { useSessionStore } from '../stores/sessionStore';
import { generateInsight } from '../lib/insight';
import { getRecentSessions, getUsefulInsights, getAllSessions, updateInsightFeedback } from '../lib/db';
import { daysUntilBadge } from '../lib/date';
import { computeStreakDays, computeTotalDurationSec } from '../lib/streak';
import { exportInsightImage } from '../lib/exportImage';
import { unlockAudioContext, requestNotificationPermission } from '../lib/chime';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Slider } from '../components/Slider';
import { TimerConfigPanel, isValidField, WORK_MIN, WORK_MAX, BREAK_MIN, BREAK_MAX, CYCLES_MIN, CYCLES_MAX, type DraftConfig } from '../components/TimerConfigPanel';
import { InsightPanel } from '../components/InsightPanel';
import type { SelfAssessment, Insight, SessionRecord, SessionInsightMode } from '../types/session';
import type { PomodoroConfig } from '../types/user';
import '../styles/session.css';

type Rating = 1 | 2 | 3 | 4 | 5;
type Phase = 'idle' | 'preAssess' | 'running' | 'confirmEnd' | 'postAssess' | 'loading' | 'insight';

const MOOD_LABELS = ['', '很差', '较差', '一般', '不错', '很好'];

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

  const allSet = isValidField(draft.workDurationMin, WORK_MIN, WORK_MAX)
    && isValidField(draft.shortBreakMin, BREAK_MIN, BREAK_MAX)
    && isValidField(draft.targetCycles, CYCLES_MIN, CYCLES_MAX);

  const updateDraft = (patch: Partial<DraftConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
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
  const isFree = !pomodoroState;
  const totalSec = pomodoroState
    ? pomodoroState.mode === 'work' ? pomodoroState.workDurationMin * 60
      : pomodoroState.shortBreakMin * 60
    : 0;
  // 自由模式没有总时长，圆环每 60 秒转一圈作为视觉反馈，避免用户以为"不动"
  const progress = isFree
    ? (remainingSec % 60) / 60
    : totalSec > 0 ? 1 - remainingSec / totalSec : 0;
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
        <div className="zept-session__badge">
          <span className="material-symbols-rounded">event</span>
          {daysUntilBadge(profile.examDate)}
        </div>
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
            <TimerConfigPanel draft={draft} onDraftChange={updateDraft} />
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
          <div className="zept-mood-value">{preMood}</div>
          <div className="zept-mood-value-label">{MOOD_LABELS[preMood]}</div>
          <Slider label="情绪" value={preMood} onChange={setPreMood} hideHeader />
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
            <div className="zept-mood-check">
              <div className="zept-mood-check__title">感觉如何？</div>
              <div className="zept-mood-check__chips">
                <button
                  type="button"
                  className="zept-chip"
                  onClick={() => setBreakMoodInStore(3)}
                >还好</button>
                <button
                  type="button"
                  className="zept-chip"
                  onClick={() => setBreakMoodInStore(2)}
                >一般</button>
                <button
                  type="button"
                  className="zept-chip"
                  onClick={() => setBreakMoodInStore(1)}
                >有点累</button>
              </div>
              <button
                type="button"
                className="zept-chip zept-chip--skip"
                onClick={() => setBreakMoodInStore(null)}
              >不想回答</button>
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
          <div className="zept-slider-group">
            <div className="zept-slider-group__label">心情</div>
            <div className="zept-slider-value-row">
              <span className="zept-slider-value">{postMood}</span>
              <span className="zept-slider-value-label">{MOOD_LABELS[postMood]}</span>
            </div>
            <Slider label="心情" value={postMood} onChange={setPostMood} hideHeader />
          </div>
          <div className="zept-slider-group">
            <div className="zept-slider-group__label">专注度</div>
            <div className="zept-slider-value-row">
              <span className="zept-slider-value">{postFocus}</span>
              <span className="zept-slider-value-label">{MOOD_LABELS[postFocus]}</span>
            </div>
            <Slider label="专注度" value={postFocus} onChange={setPostFocus} hideHeader />
          </div>
          {currentSession && (
            <div className="zept-session-summary">
              本次专注 {Math.round((Date.now() - currentSession.startedAt) / 60000)}分钟
              {interruptions > 0 && ` · 离开 ${interruptions} 次`}
            </div>
          )}
          <Button variant="filled" onClick={handlePostSubmit}>提交</Button>
        </Card>
      )}

      {phase === 'loading' && (
        <Card><p className="zept-session__loading">正在生成洞察...</p></Card>
      )}

      {phase === 'insight' && insight && (
        <InsightPanel
          insight={insight}
          onFeedback={handleFeedback}
          onExport={handleExportInsight}
          exporting={exporting}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
