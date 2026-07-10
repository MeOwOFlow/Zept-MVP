import { useCallback, type KeyboardEvent } from 'react';

type Rating = 1 | 2 | 3 | 4 | 5;

export interface SliderProps {
  label: string;
  value: Rating;
  onChange: (value: Rating) => void;
  hideHeader?: boolean;
}

const TICKS: Rating[] = [1, 2, 3, 4, 5];

export function Slider({ label, value, onChange, hideHeader = false }: SliderProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowRight' && value < 5) {
        onChange((value + 1) as Rating);
      } else if (e.key === 'ArrowLeft' && value > 1) {
        onChange((value - 1) as Rating);
      }
    },
    [value, onChange],
  );

  return (
    <div className="zept-slider">
      {!hideHeader && (
        <div className="zept-slider__header">
          <span className="zept-slider__label">{label}</span>
          <span className="zept-slider__value">{value}</span>
        </div>
      )}
      <div
        className="zept-slider__track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={value}
        onKeyDown={handleKeyDown}
      >
        {TICKS.map((tick) => (
          <button
            key={tick}
            type="button"
            className={[
              'zept-slider__tick',
              tick === value ? 'zept-slider__tick--active' : '',
              tick <= value ? 'zept-slider__tick--filled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={String(tick)}
            onClick={() => onChange(tick)}
          >
            <span className="zept-slider__tick-label">{tick}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface DualSliderProps {
  mood: Rating;
  focus: Rating;
  onMoodChange: (v: Rating) => void;
  onFocusChange: (v: Rating) => void;
}

function DualSlider({ mood, focus, onMoodChange, onFocusChange }: DualSliderProps) {
  return (
    <div className="zept-slider-dual">
      <Slider label="情绪" value={mood} onChange={onMoodChange} />
      <Slider label="专注度" value={focus} onChange={onFocusChange} />
    </div>
  );
}

Slider.Dual = DualSlider;
