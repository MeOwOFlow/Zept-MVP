import { useState, useEffect, useCallback, type KeyboardEvent } from 'react';

export interface DatePickerProps {
  label: string;
  value: string;              // ISO YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string;           // ISO，默认今天
  maxDate?: string;           // ISO，默认 3 年后
}

const WEEK_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(s: string): string {
  if (!s) return '请选择日期';
  const d = parseISO(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 获取某月日历网格（7×6 = 42 格，含前尾月填充） */
function getMonthGrid(year: number, month: number): Array<{ date: Date; inMonth: boolean }> {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=周日
  const start = new Date(year, month, 1 - startDay);
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }
  return cells;
}

export function DatePicker({ label, value, onChange, minDate, maxDate }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const min = minDate ? parseISO(minDate) : today;
  const max = maxDate ? parseISO(maxDate) : new Date(today.getFullYear() + 3, 11, 31);

  // 面板内部临时选中（未确认）
  const [draft, setDraft] = useState<string>(value);
  const [viewYear, setViewYear] = useState<number>(value ? parseISO(value).getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(value ? parseISO(value).getMonth() : today.getMonth());

  // 打开面板时同步 draft 和视图
  useEffect(() => {
    if (open) {
      setDraft(value);
      const base = value ? parseISO(value) : today;
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cells = getMonthGrid(viewYear, viewMonth);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const handleConfirm = () => {
    if (draft) onChange(draft);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const handleToday = () => {
    const iso = toISO(today);
    setDraft(iso);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const handleDayClick = (date: Date) => {
    const iso = toISO(date);
    setDraft(iso);
  };

  // ESC 关闭
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="zept-dp">
      <label className="zept-dp__label">{label}</label>
      <button
        type="button"
        className="zept-dp__trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? 'zept-dp__value' : 'zept-dp__placeholder'}>
          {formatDisplay(value)}
        </span>
        <span className="zept-dp__icon" aria-hidden>📅</span>
      </button>

      {open && (
        <div className="zept-dp__overlay" onKeyDown={handleKeyDown}>
          <div className="zept-dp__scrim" onClick={handleCancel} />
          <div
            className="zept-dp__sheet"
            role="dialog"
            aria-label="选择考试日期"
            aria-modal="true"
          >
            <div className="zept-dp__header">
              <button
                type="button"
                className="zept-dp__nav-btn"
                onClick={prevMonth}
                aria-label="上一月"
              >
                ‹
              </button>
              <div className="zept-dp__title">
                {viewYear}年{MONTH_NAMES[viewMonth]}
              </div>
              <button
                type="button"
                className="zept-dp__nav-btn"
                onClick={nextMonth}
                aria-label="下一月"
              >
                ›
              </button>
            </div>

            <div className="zept-dp__weekdays">
              {WEEK_HEADERS.map((w) => (
                <div key={w} className="zept-dp__weekday">{w}</div>
              ))}
            </div>

            <div className="zept-dp__grid">
              {cells.map(({ date, inMonth }, idx) => {
                const iso = toISO(date);
                const isSelected = draft === iso;
                const isToday = toISO(today) === iso;
                const disabled = date < min || date > max;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={[
                      'zept-dp__day',
                      !inMonth ? 'zept-dp__day--out' : '',
                      isSelected ? 'zept-dp__day--selected' : '',
                      isToday && !isSelected ? 'zept-dp__day--today' : '',
                      disabled ? 'zept-dp__day--disabled' : '',
                    ].filter(Boolean).join(' ')}
                    aria-pressed={isSelected}
                    aria-label={String(date.getDate())}
                    disabled={disabled}
                    onClick={() => handleDayClick(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="zept-dp__actions">
              <button type="button" className="zept-dp__action" onClick={handleToday}>
                今天
              </button>
              <div className="zept-dp__actions-right">
                <button type="button" className="zept-dp__action zept-dp__action--cancel" onClick={handleCancel}>
                  取消
                </button>
                <button type="button" className="zept-dp__action zept-dp__action--confirm" onClick={handleConfirm}>
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
