import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllSessions, getAllInsights, updateInsightFeedback } from '../lib/db';
import { formatDuration } from '../lib/session';
import { computeStreakDays, computeTotalDurationSec } from '../lib/streak';
import { exportInsightImage } from '../lib/exportImage';
import {
  generateDailyReport,
  generateWeeklyReport,
  getDailyPeriodKey,
  getWeeklyPeriodKey,
  type FocusReport,
} from '../lib/report';
import { useUserStore } from '../stores/userStore';
import type { SessionRecord, Insight } from '../types/session';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MoodTrend } from '../components/MoodTrend';
import '../styles/insights.css';

interface Item { session: SessionRecord; insight: Insight | null; }

// PWA 持久化：localStorage；RN 迁移时替换为 AsyncStorage
const REPORT_STORAGE_PREFIX = 'zept-report-';

function loadReport(scope: 'daily' | 'weekly', periodKey: string): FocusReport | null {
  try {
    const raw = localStorage.getItem(REPORT_STORAGE_PREFIX + scope + '-' + periodKey);
    return raw ? (JSON.parse(raw) as FocusReport) : null;
  } catch {
    return null;
  }
}

function saveReport(report: FocusReport): void {
  try {
    localStorage.setItem(
      REPORT_STORAGE_PREFIX + report.scope + '-' + report.periodKey,
      JSON.stringify(report),
    );
  } catch {
    // 忽略 quota / 序列化错误
  }
}

export default function Insights() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const [items, setItems] = useState<Item[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [dailyReport, setDailyReport] = useState<FocusReport | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<FocusReport | null>(null);
  const [generating, setGenerating] = useState<'daily' | 'weekly' | null>(null);

  const streakDays = computeStreakDays(items.map((it) => it.session));
  const totalDurationSec = computeTotalDurationSec(items.map((it) => it.session));

  const handleExport = async (session: SessionRecord, insight: Insight) => {
    setExporting(session.id);
    try {
      await exportInsightImage({
        insight,
        session,
        streakDays,
        totalDurationSec,
      });
    } catch (err) {
      console.error('export insight image failed', err);
      alert('导出失败，请稍后重试');
    } finally {
      setExporting(null);
    }
  };

  const handleGenerate = async (scope: 'daily' | 'weekly') => {
    if (!profile) return;
    setGenerating(scope);
    try {
      const sessions = items.map((it) => it.session);
      const insights = items.map((it) => it.insight).filter((x): x is Insight => x !== null);
      const report =
        scope === 'daily'
          ? await generateDailyReport({ sessions, insights, profile })
          : await generateWeeklyReport({ sessions, insights, profile });
      saveReport(report);
      if (scope === 'daily') setDailyReport(report);
      else setWeeklyReport(report);
    } catch (err) {
      console.error('generate report failed', err);
      alert('生成失败，请稍后重试');
    } finally {
      setGenerating(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sessions, insights] = await Promise.all([getAllSessions(), getAllInsights()]);
        if (!mounted) return;
        const map = new Map(insights.map((i) => [i.sessionId, i]));
        setItems(
          sessions
            .sort((a, b) => b.startedAt - a.startedAt)
            .map((s) => ({ session: s, insight: map.get(s.id) ?? null })),
        );
      } catch (err) {
        if (!mounted) return;
        console.error('failed to load insights', err);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    // 加载已缓存的今日/本周报告
    setDailyReport(loadReport('daily', getDailyPeriodKey()));
    setWeeklyReport(loadReport('weekly', getWeeklyPeriodKey()));
    return () => { mounted = false; };
  }, []);

  const handleFeedback = async (insightId: string, feedback: 'useful' | 'useless') => {
    await updateInsightFeedback(insightId, feedback);
    setItems((prev) =>
      prev.map((it) =>
        it.insight?.id === insightId
          ? { ...it, insight: { ...it.insight, feedback } }
          : it,
      ),
    );
  };

  if (loading) return <div className="zept-insights"><p>加载中...</p></div>;

  if (items.length === 0) {
    return (
      <div className="zept-insights">
        <h1 className="zept-insights__title">我的专注</h1>
        <Card>
          <p className="zept-insights__empty">还没有专注记录，开始第一次专注吧。</p>
          <Button variant="filled" onClick={() => navigate('/session')}>去开始专注</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="zept-insights">
      <h1 className="zept-insights__title">我的专注</h1>

      <Card>
        <div className="zept-report">
          <div className="zept-report__header">
            <span className="zept-report__title">专注报告</span>
            <div className="zept-report__actions">
              <Button
                variant="outlined"
                onClick={() => handleGenerate('daily')}
                disabled={generating !== null}
              >
                {generating === 'daily' ? '生成中…' : '今日'}
              </Button>
              <Button
                variant="outlined"
                onClick={() => handleGenerate('weekly')}
                disabled={generating !== null}
              >
                {generating === 'weekly' ? '生成中…' : '本周'}
              </Button>
            </div>
          </div>
          {dailyReport && (
            <div className="zept-report__body">
              <div className="zept-report__label">
                {dailyReport.dateLabel} · 今日
                {dailyReport.source === 'fallback' && <span className="zept-report__tag">离线</span>}
              </div>
              <p className="zept-report__text">{dailyReport.text}</p>
            </div>
          )}
          {weeklyReport && (
            <div className="zept-report__body">
              <div className="zept-report__label">
                {weeklyReport.dateLabel} · 本周
                {weeklyReport.source === 'fallback' && <span className="zept-report__tag">离线</span>}
              </div>
              <p className="zept-report__text">{weeklyReport.text}</p>
            </div>
          )}
          {!dailyReport && !weeklyReport && (
            <p className="zept-report__hint">
              点击「今日」或「本周」，让凝时给你一段陪伴的回顾。
            </p>
          )}
        </div>
      </Card>

      <MoodTrend sessions={items.map((it) => it.session)} />
      {items.map(({ session, insight }) => {
        const date = new Date(session.startedAt).toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const isOpen = expanded === session.id;
        const preMood = session.preAssessment?.mood;
        const postMood = session.postAssessment?.mood;
        const postFocus = session.postAssessment?.focus;
        const moodArrow = preMood && postMood
          ? postMood > preMood ? '↑' : postMood < preMood ? '↓' : '→'
          : null;
        return (
          <Card key={session.id}>
            <div
              className="zept-insights__header"
              onClick={() => setExpanded(isOpen ? null : session.id)}
              role="button"
              tabIndex={0}
            >
              <div>
                <div className="zept-insights__date">{date}</div>
                <div className="zept-insights__meta">
                  {formatDuration(session.actualDurationSec)} · 离开 {session.interruptions} 次
                </div>
              </div>
              <span className="material-symbols-rounded">{isOpen ? 'expand_less' : 'expand_more'}</span>
            </div>
            {insight && <p className="zept-insights__text">{insight.text}</p>}
            {isOpen && (
              <div className="zept-insights__detail">
                {preMood && postMood && (
                  <div className="zept-insights__row">
                    情绪 {preMood} {moodArrow} {postMood} · 专注 {postFocus}/5
                  </div>
                )}
                {session.breakMoods.length > 0 && (
                  <div className="zept-insights__row">
                    休息时感受：{session.breakMoods
                      .filter((b) => b.mood !== null)
                      .map((b) => b.mood === 3 ? '还行' : b.mood === 2 ? '一般' : '有点累')
                      .join('、')}
                  </div>
                )}
                {insight && insight.feedback === null ? (
                  <div className="zept-insights__feedback">
                    <Button variant="outlined" onClick={() => handleFeedback(insight.id, 'useful')}>有用</Button>
                    <Button variant="text" onClick={() => handleFeedback(insight.id, 'useless')}>没用</Button>
                  </div>
                ) : insight?.feedback ? (
                  <div className="zept-insights__row">
                    已标记：{insight.feedback === 'useful' ? '有用' : '没用'}
                  </div>
                ) : null}
                {insight && (
                  <div className="zept-insights__export">
                    <Button
                      variant="text"
                      onClick={() => handleExport(session, insight)}
                      disabled={exporting === session.id}
                    >
                      {exporting === session.id ? '生成中…' : '导出长图'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
