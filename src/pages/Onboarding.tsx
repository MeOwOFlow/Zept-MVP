import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import '../styles/onboarding.css';

const DISTRACTION_PRESETS = ['手机', '社交媒体', '游戏', '噪音', '疲劳', '焦虑'];

export default function Onboarding() {
  const navigate = useNavigate();
  const setProfile = useUserStore((s) => s.setProfile);
  const [goal, setGoal] = useState('');
  const [examDate, setExamDate] = useState('');
  const [distractions, setDistractions] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');

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
    await setProfile({
      goal: goal.trim(),
      examDate,
      topDistractions: distractions,
      onboarded: true,
    });
    navigate('/session');
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
        <label className="zept-onboarding__label" htmlFor="zept-exam-date">你的考试日期是</label>
        <input
          id="zept-exam-date"
          className="zept-onboarding__input"
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
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

      <Button variant="filled" onClick={handleSubmit} disabled={!canSubmit}>
        开始专注
      </Button>
    </div>
  );
}
