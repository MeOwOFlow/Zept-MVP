import { shouldTriggerCareGate } from '../lib/rules';
import { Card } from './Card';
import { Button } from './Button';
import type { Insight } from '../types/session';

interface InsightPanelProps {
  insight: Insight;
  onFeedback: (fb: 'useful' | 'useless') => void;
  onExport: () => void;
  exporting: boolean;
  onReset: () => void;
}

export function InsightPanel({ insight, onFeedback, onExport, exporting, onReset }: InsightPanelProps) {
  const isCare = shouldTriggerCareGate(insight.mood);

  return (
    <Card>
      {isCare ? (
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
              <Button variant="outlined" onClick={() => onFeedback('useful')}>有用</Button>
              <Button variant="text" onClick={() => onFeedback('useless')}>没用</Button>
            </div>
          )}
          {insight.feedback && (
            <p className="zept-session__feedback-done">已标记：{insight.feedback === 'useful' ? '有用' : '没用'}</p>
          )}
          <div className="zept-session__export">
            <Button
              variant="text"
              onClick={onExport}
              disabled={exporting}
            >
              {exporting ? '生成中…' : '导出长图'}
            </Button>
          </div>
        </>
      )}
      <Button variant="filled" onClick={onReset}>完成</Button>
    </Card>
  );
}
