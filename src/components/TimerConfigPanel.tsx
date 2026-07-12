import { useState, useEffect } from 'react';
import type { PomodoroConfig } from '../types/user';

export const WORK_MIN = 1, WORK_MAX = 180;
export const BREAK_MIN = 1, BREAK_MAX = 60;
export const CYCLES_MIN = 1, CYCLES_MAX = 12;

export interface DraftConfig {
  workDurationMin?: number;
  shortBreakMin?: number;
  targetCycles?: number;
}

const POMODORO_PRESETS: Array<{ id: string; label: string; sub: string; config: PomodoroConfig }> = [
  { id: 'classic', label: '经典', sub: '25/5 ×4', config: { workDurationMin: 25, shortBreakMin: 5, targetCycles: 4 } },
  { id: 'deep', label: '深度', sub: '50/10 ×3', config: { workDurationMin: 50, shortBreakMin: 10, targetCycles: 3 } },
  { id: 'sprint', label: '冲刺', sub: '90/15 ×2', config: { workDurationMin: 90, shortBreakMin: 15, targetCycles: 2 } },
];

const TRIO_RING_R = 140;
const TRIO_CIRCUMFERENCE = 2 * Math.PI * TRIO_RING_R;

type TrioKey = 'work' | 'break' | 'rounds';

function clampDuration(v: number): number {
  return Math.max(WORK_MIN, Math.min(WORK_MAX, v));
}

export function isValidField(v: number | undefined, min: number, max: number): v is number {
  return v !== undefined && v >= min && v <= max && Number.isInteger(v);
}

interface TimerConfigPanelProps {
  draft: DraftConfig;
  onDraftChange: (patch: Partial<DraftConfig>) => void;
}

export function TimerConfigPanel({ draft, onDraftChange }: TimerConfigPanelProps) {
  const [trioText, setTrioText] = useState({ work: '', break: '', rounds: '' });
  const [bump, setBump] = useState<{ key: TrioKey; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    setTrioText({
      work: draft.workDurationMin !== undefined ? String(draft.workDurationMin) : '',
      break: draft.shortBreakMin !== undefined ? String(draft.shortBreakMin) : '',
      rounds: draft.targetCycles !== undefined ? String(draft.targetCycles) : '',
    });
  }, [draft.workDurationMin, draft.shortBreakMin, draft.targetCycles]);

  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => setBump(null), 300);
    return () => clearTimeout(t);
  }, [bump]);

  const adjustTrio = (key: TrioKey, dir: 1 | -1) => {
    if (key === 'work') {
      const cur = draft.workDurationMin ?? 25;
      onDraftChange({ workDurationMin: clampDuration(cur + dir) });
    } else if (key === 'break') {
      const cur = draft.shortBreakMin ?? 5;
      onDraftChange({ shortBreakMin: Math.max(BREAK_MIN, Math.min(BREAK_MAX, cur + dir)) });
    } else {
      const cur = draft.targetCycles ?? 4;
      onDraftChange({ targetCycles: Math.max(CYCLES_MIN, Math.min(CYCLES_MAX, cur + dir)) });
    }
    setBump({ key, dir });
  };

  const commitTrioInput = (key: TrioKey, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    const parsed = parseInt(digits, 10);
    if (isNaN(parsed) || parsed < 1) {
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
      onDraftChange({ workDurationMin: clampDuration(parsed) });
    } else if (key === 'break') {
      onDraftChange({ shortBreakMin: Math.max(BREAK_MIN, Math.min(BREAK_MAX, parsed)) });
    } else {
      onDraftChange({ targetCycles: Math.max(CYCLES_MIN, Math.min(CYCLES_MAX, parsed)) });
    }
  };

  const applyPreset = (config: PomodoroConfig) => {
    onDraftChange({
      workDurationMin: config.workDurationMin,
      shortBreakMin: config.shortBreakMin,
      targetCycles: config.targetCycles,
    });
  };

  return (
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
            <svg viewBox="0 0 300 300" className="zept-trio-ring__svg">
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
  );
}
