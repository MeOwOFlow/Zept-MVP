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
import '../styles/session.css';

type Rating = 1 | 2 | 3 | 4 | 5;
type Phase = 'idle' | 'preAssess' | 'running' | 'confirmEnd' | 'postAssess' | 'loading' | 'insight';

export default function Session() {
  const profile = useUserStore((s) => s.profile);
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
  const [preMood, setPreMood] = useState<Rating>(3);
  const [preFocus, setPreFocus] = useState<Rating>(3);
  const [postMood, setPostMood] = useState<Rating>(3);
  const [postFocus, setPostFocus] = useState<Rating>(3);
  const [insight, setInsight] = useState<Insight | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === 'running' && isRunning) {
      timerRef.current = setInterval(() => tick(), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase, isRunning, tick]);

  const handleStart = () => {
    if (!profile) return;
    startSession(profile, isPomodoro);
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
          {isPomodoro && profile?.pomodoroConfig && (
            <p className="zept-session__config-hint">
              {profile.pomodoroConfig.workDurationMin} 分钟专注 / {profile.pomodoroConfig.shortBreakMin} 分钟短休
              {profile.pomodoroConfig.longBreakEvery > 0
                ? ` / 每 ${profile.pomodoroConfig.longBreakEvery} 轮长休 ${profile.pomodoroConfig.longBreakMin} 分钟`
                : ' / 已关闭长休'}
            </p>
          )}
          <Button variant="filled" onClick={handleStart}>开始专注</Button>
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
