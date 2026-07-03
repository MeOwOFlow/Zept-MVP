import type { SessionRecord } from "../types/session";
import "../styles/moodTrend.css";

interface MoodPoint {
  label: string;
  mood: number | null;
}

/**
 * 将多场会话的情绪数据展平为时间轴上的点序列。
 * 每场会话贡献：前评 → 各休息采样 → 后评
 */
function extractMoodPoints(sessions: SessionRecord[]): MoodPoint[] {
  const points: MoodPoint[] = [];
  for (const s of sessions) {
    if (s.preAssessment) {
      points.push({ label: "前", mood: s.preAssessment.mood });
    }
    for (const b of s.breakMoods) {
      if (b.mood !== null) {
        points.push({ label: "休", mood: b.mood });
      }
    }
    if (s.postAssessment) {
      points.push({ label: "后", mood: s.postAssessment.mood });
    }
  }
  return points;
}

export function MoodTrend({ sessions }: { sessions: SessionRecord[] }) {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const points = extractMoodPoints(sorted);

  if (points.length < 2) {
    return (
      <div className="zept-mood-trend zept-mood-trend--empty">
        <p className="zept-mood-trend__hint">再完成几次专注，就能看到情绪趋势了</p>
      </div>
    );
  }

  const W = 320;
  const H = 120;
  const padX = 24;
  const padY = 20;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  // mood 值域 1-5，映射到画布坐标
  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const moodToY = (m: number) => padY + plotH - ((m - 1) / 4) * plotH;

  const validPoints = points.map((p, i) => ({
    ...p,
    x: padX + i * xStep,
    y: p.mood !== null ? moodToY(p.mood) : null,
  }));

  // 构建折线路径（跳过 null 点，断开线段）
  const segments: string[] = [];
  let currentSeg = "";
  for (const p of validPoints) {
    if (p.y !== null) {
      if (!currentSeg) {
        currentSeg += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      } else {
        currentSeg += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
    } else {
      if (currentSeg) { segments.push(currentSeg); currentSeg = ""; }
    }
  }
  if (currentSeg) segments.push(currentSeg);
  const pathD = segments.join(" ");

  return (
    <div className="zept-mood-trend">
      <div className="zept-mood-trend__header">
        <span className="zept-mood-trend__title">情绪趋势</span>
        <span className="zept-mood-trend__count">{points.length} 个采样点</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="zept-mood-trend__svg">
        {/* Y 轴参考线 1-5 */}
        {[1, 2, 3, 4, 5].map((v) => {
          const y = moodToY(v);
          return (
            <g key={v}>
              <line x1={padX} y1={y} x2={W - padX} y2={y}
                stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="2 4" />
              <text x={padX - 6} y={y + 3} fontSize="8" fill="var(--on-surface-muted)" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {/* 折线 */}
        {pathD && (
          <path d={pathD} fill="none" stroke="var(--tertiary)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* 数据点 */}
        {validPoints.map((p, i) =>
          p.y !== null ? (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--tertiary)" />
          ) : null,
        )}
      </svg>
    </div>
  );
}
