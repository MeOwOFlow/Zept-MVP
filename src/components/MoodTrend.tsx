import type { SessionRecord } from "../types/session";
import {
  getDatasetConfidence,
  detectOutliers,
  type ConfidenceLevel,
} from "../lib/moodConfidence";
import "../styles/moodTrend.css";

interface MoodPoint {
  label: string;
  mood: number;
  sessionId: string;
}

/**
 * 将多场会话的情绪数据展平为时间轴上的点序列。
 * 每场会话贡献：前评 → 各休息采样 → 后评
 */
function extractMoodPoints(sessions: SessionRecord[]): MoodPoint[] {
  const points: MoodPoint[] = [];
  for (const s of sessions) {
    if (s.preAssessment) {
      points.push({ label: "前", mood: s.preAssessment.mood, sessionId: s.id });
    }
    for (const b of s.breakMoods) {
      if (b.mood !== null) {
        points.push({ label: "休", mood: b.mood, sessionId: s.id });
      }
    }
    if (s.postAssessment) {
      points.push({ label: "后", mood: s.postAssessment.mood, sessionId: s.id });
    }
  }
  return points;
}

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "高置信度",
  medium: "中置信度",
  low: "低置信度",
};

const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  high: "var(--primary)",
  medium: "var(--secondary)",
  low: "var(--tertiary)",
};

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

  const confidence = getDatasetConfidence(sorted);
  const moodValues = points.map((p) => p.mood);
  const outlierIndices = new Set(detectOutliers(moodValues));

  // SVG 画布
  const W = 320;
  const H = 140;
  const padX = 28;
  const padY = 24;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const moodToY = (m: number) => padY + plotH - ((m - 1) / 4) * plotH;

  const validPoints = points.map((p, i) => ({
    ...p,
    x: padX + i * xStep,
    y: moodToY(p.mood),
    isOutlier: outlierIndices.has(i),
  }));

  // 折线路径
  const pathD = validPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // 置信区间填充（high 时画半透明带，low/medium 不画）
  const showConfidenceBand = confidence.level === "high" && validPoints.length >= 3;
  let bandPath = "";
  if (showConfidenceBand) {
    const upper = validPoints.map((p) => ({ x: p.x, y: moodToY(Math.min(5, p.mood + 0.5)) }));
    const lower = validPoints.map((p) => ({ x: p.x, y: moodToY(Math.max(1, p.mood - 0.5)) }));
    bandPath = [
      ...upper.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
      ...lower.reverse().map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
      "Z",
    ].join(" ");
  }

  return (
    <div className="zept-mood-trend">
      <div className="zept-mood-trend__header">
        <span className="zept-mood-trend__title">情绪趋势</span>
        <span
          className="zept-mood-trend__confidence"
          style={{ color: CONFIDENCE_COLOR[confidence.level] }}
        >
          {CONFIDENCE_LABEL[confidence.level]} · {confidence.totalPoints} 点
        </span>
      </div>

      {confidence.flatline && (
        <p className="zept-mood-trend__warning">
          数据过于平稳，可能存在随手填写，趋势仅供参考
        </p>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="zept-mood-trend__svg">
        {/* Y 轴参考线 1-5 */}
        {[1, 2, 3, 4, 5].map((v) => {
          const y = moodToY(v);
          return (
            <g key={v}>
              <line
                x1={padX}
                y1={y}
                x2={W - padX}
                y2={y}
                stroke="var(--outline-variant)"
                strokeWidth="0.5"
                strokeDasharray="2 4"
              />
              <text
                x={padX - 6}
                y={y + 3}
                fontSize="8"
                fill="var(--on-surface-muted)"
                textAnchor="end"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* 置信区间带 */}
        {showConfidenceBand && bandPath && (
          <path d={bandPath} fill="var(--primary)" opacity="0.1" />
        )}

        {/* 折线 */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={CONFIDENCE_COLOR[confidence.level]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* 数据点 */}
        {validPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.isOutlier ? 4 : 3}
            fill={p.isOutlier ? "var(--error)" : CONFIDENCE_COLOR[confidence.level]}
            stroke="var(--surface)"
            strokeWidth="1"
          />
        ))}

        {/* 离群点标注 */}
        {validPoints
          .filter((p) => p.isOutlier)
          .map((p, i) => (
            <text
              key={`outlier-${i}`}
              x={p.x}
              y={p.y - 8}
              fontSize="7"
              fill="var(--error)"
              textAnchor="middle"
            >
              !
            </text>
          ))}
      </svg>

      <div className="zept-mood-trend__legend">
        <span className="zept-mood-trend__legend-item">
          ● 正常点
        </span>
        <span className="zept-mood-trend__legend-item">
          <span style={{ color: "var(--error)" }}>●</span> 离群点
        </span>
        {showConfidenceBand && (
          <span className="zept-mood-trend__legend-item">
            <span style={{ opacity: 0.3 }}>▬</span> 置信区间
          </span>
        )}
      </div>
    </div>
  );
}
