import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { DEFAULT_THEME, DEFAULT_REPLY_STYLE } from '../types/user';
import type { ReplyStyle } from '../types/user';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DatePicker } from '../components/DatePicker';
import '../styles/onboarding.css';
import '../styles/datepicker.css';

const DISTRACTION_PRESETS = ['手机', '社交媒体', '游戏', '噪音', '疲劳', '焦虑'];

const REPLY_STYLE_OPTIONS: Array<{ value: ReplyStyle; label: string; desc: string }> = [
  { value: 'rational', label: '数据派', desc: '用数字说话，直给不绕弯' },
  { value: 'balanced', label: '平衡', desc: '先看见数据，再说句陪伴' },
  { value: 'emotional', label: '陪伴派', desc: '偏感性，像朋友在身旁' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const setProfile = useUserStore((s) => s.setProfile);
  const [goal, setGoal] = useState('');
  const [examDate, setExamDate] = useState('');
  const [distractions, setDistractions] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [replyStyle, setReplyStyle] = useState<ReplyStyle>(DEFAULT_REPLY_STYLE);

  const toggleDistraction = (d: string) => {
    setDistractions((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const addCustom = () => {
    const t = customInput.trim();
    if (t && !distractions.includes(t)) {
      setDistractions((prev) => [...prev, t]);
      setCustomInput('');
    }
  };

  const canSubmit = goal.trim().length > 0 && examDate.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await setProfile({
        goal: goal.trim(),
        examDate,
        topDistractions: distractions,
        onboarded: true,
        pomodoroConfig: null,  // 番茄时长由用户在 Session 首次选择
        theme: DEFAULT_THEME,
        replyStyle,
      });
      navigate('/session');
    } catch (err) {
      console.error('failed to save profile', err);
      alert('保存失败，请检查浏览器存储权限后重试');
    }
  };

  return (
    <div className="zept-onboarding">
      <h1 className="zept-onboarding__title">凝时 Zept</h1>
      <p className="zept-onboarding__subtitle">先了解你一下</p>

      <Card>
        <label className="zept-onboarding__label" htmlFor="zept-goal">你的目标</label>
        <input
          id="zept-goal"
          className="zept-onboarding__input"
          type="text"
          placeholder="比如：考研、期末、雅思"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </Card>

      <Card>
        <DatePicker
          label="你的考试日期是"
          value={examDate}
          onChange={setExamDate}
        />
      </Card>

      <Card>
        <label className="zept-onboarding__label" htmlFor="zept-custom">最容易分心的是</label>
        <div className="zept-onboarding__chips">
          {DISTRACTION_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              className={`zept-chip ${distractions.includes(d) ? 'zept-chip--active' : ''}`}
              onClick={() => toggleDistraction(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          id="zept-custom"
          className="zept-onboarding__input"
          type="text"
          placeholder="自定义..."
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
        />
        {distractions.length > 0 && (
          <p className="zept-onboarding__selected">已选：{distractions.join('、')}</p>
        )}
      </Card>

      <Card>
        <label className="zept-onboarding__label">回复风格</label>
        <div className="zept-reply-style__options">
          {REPLY_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`zept-reply-style__option ${replyStyle === opt.value ? 'zept-reply-style__option--active' : ''}`}
              onClick={() => setReplyStyle(opt.value)}
            >
              <span className="zept-reply-style__label">{opt.label}</span>
              <span className="zept-reply-style__desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      <Button variant="filled" onClick={handleSubmit} disabled={!canSubmit}>
        开始专注
      </Button>
    </div>
  );
}
