import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import '../styles/welcome.css';

// 三屏理念——品牌定位 → 核心价值 → 隐私承诺
const SLIDES = [
  {
    icon: 'hourglass',
    title: '凝时',
    subtitle: '为你凝固每一刻专注',
    body: '备考的路很长，但每一分钟的投入都值得被看见。',
  },
  {
    icon: 'insights',
    title: '看见你',
    subtitle: '不只是计时，更是懂你的状态',
    body: '把专注数据翻译成洞察，让你看清自己的节奏，而非评判对错。',
  },
  {
    icon: 'shield_lock',
    title: '只属于你',
    subtitle: '数据留在本机，陪伴不打扰',
    body: '专注记录全部本地存储，不上云、不分析、不画像。',
  },
] as const;

export default function Welcome() {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const isLast = idx === SLIDES.length - 1;

  const next = () => {
    if (isLast) {
      // 标记已看过欢迎页，下次直接进 onboarding
      localStorage.setItem('zept_welcome_seen', '1');
      navigate('/onboarding');
      return;
    }
    setIdx((i) => Math.min(i + 1, SLIDES.length - 1));
  };

  const skip = () => {
    localStorage.setItem('zept_welcome_seen', '1');
    navigate('/onboarding');
  };

  return (
    <div className="zept-welcome">
      <button
        type="button"
        className="zept-welcome__skip"
        onClick={skip}
        aria-label="跳过引导"
      >
        跳过
      </button>

      <div className="zept-welcome__slides" data-idx={idx}>
        {SLIDES.map((s, i) => (
          <section
            key={s.icon}
            className={`zept-welcome__slide${i === idx ? ' zept-welcome__slide--active' : ''}`}
            aria-hidden={i !== idx}
          >
            <div className="zept-welcome__icon-wrap">
              <span className="material-symbols-rounded zept-welcome__icon" aria-hidden="true">
                {s.icon}
              </span>
            </div>
            <h1 className="zept-welcome__title">{s.title}</h1>
            <p className="zept-welcome__subtitle">{s.subtitle}</p>
            <p className="zept-welcome__body">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="zept-welcome__dots" role="tablist" aria-label="引导页切换">
        {SLIDES.map((s, i) => (
          <button
            key={s.icon}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-label={`第 ${i + 1} 屏`}
            className={`zept-welcome__dot${i === idx ? ' zept-welcome__dot--active' : ''}`}
            onClick={() => setIdx(i)}
          />
        ))}
      </div>

      <div className="zept-welcome__cta">
        <Button variant="filled" onClick={next}>
          {isLast ? '开始' : '下一步'}
        </Button>
      </div>
    </div>
  );
}
