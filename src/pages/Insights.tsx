import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllSessions, getAllInsights, updateInsightFeedback } from '../lib/db';
import { formatDuration } from '../lib/session';
import type { SessionRecord, Insight } from '../types/session';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MoodTrend } from '../components/MoodTrend';
import '../styles/insights.css';

interface Item { session: SessionRecord; insight: Insight | null; }

export default function Insights() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [sessions, insights] = await Promise.all([getAllSessions(), getAllInsights()]);
      const map = new Map(insights.map((i) => [i.sessionId, i]));
      setItems(
        sessions
          .sort((a, b) => b.startedAt - a.startedAt)
          .map((s) => ({ session: s, insight: map.get(s.id) ?? null })),
      );
      setLoading(false);
    })();
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
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
