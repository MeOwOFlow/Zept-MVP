import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportAll, clearAll } from '../lib/db';
import { useUserStore } from '../stores/userStore';
import { type ThemeMode, type ReplyStyle } from '../types/user';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import '../styles/settings.css';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '日间' },
  { value: 'dark', label: '夜间' },
];

const REPLY_STYLE_OPTIONS: Array<{ value: ReplyStyle; label: string }> = [
  { value: 'rational', label: '数据派' },
  { value: 'balanced', label: '平衡' },
  { value: 'emotional', label: '陪伴派' },
];

export default function Settings() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const loadProfile = useUserStore((s) => s.loadProfile);
  const setTheme = useUserStore((s) => s.setTheme);
  const setReplyStyle = useUserStore((s) => s.setReplyStyle);
  const setSoundEnabled = useUserStore((s) => s.setSoundEnabled);
  const setVibrationEnabled = useUserStore((s) => s.setVibrationEnabled);
  const resetProfile = useUserStore((s) => s.resetProfile);
  const [confirming, setConfirming] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zept-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    await clearAll();
    resetProfile();
    setConfirming(false);
    navigate('/onboarding');
  };

  return (
    <div className="zept-settings">
      <h1 className="zept-settings__title">我的</h1>

      <Card delay={0}>
        <h2 className="zept-settings__section">外观</h2>
        <div className="zept-settings__field">
          <label className="zept-settings__field-label">主题</label>
          <div className="zept-settings__chips">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`zept-chip ${(profile?.theme ?? 'auto') === opt.value ? 'zept-chip--active' : ''}`}
                onClick={() => setTheme(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card delay={80}>
        <h2 className="zept-settings__section">回复风格</h2>
        <div className="zept-settings__chips">
          {REPLY_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`zept-chip ${(profile?.replyStyle ?? 'balanced') === opt.value ? 'zept-chip--active' : ''}`}
              onClick={() => setReplyStyle(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="zept-settings__field-hint">影响洞察回复的语气风格</p>
      </Card>

      <Card delay={160}>
        <h2 className="zept-settings__section">提示音</h2>
        <div className="zept-settings__field">
          <label className="zept-settings__field-label">阶段切换提示音</label>
          <button
            type="button"
            className={`zept-chip ${(profile?.soundEnabled ?? true) ? 'zept-chip--active' : ''}`}
            onClick={() => setSoundEnabled(!(profile?.soundEnabled ?? true))}
          >
            {profile?.soundEnabled ?? true ? '已开启' : '已关闭'}
          </button>
        </div>
        <div className="zept-settings__field">
          <label className="zept-settings__field-label">振动反馈</label>
          <button
            type="button"
            className={`zept-chip ${(profile?.vibrationEnabled ?? true) ? 'zept-chip--active' : ''}`}
            onClick={() => setVibrationEnabled(!(profile?.vibrationEnabled ?? true))}
          >
            {profile?.vibrationEnabled ?? true ? '已开启' : '已关闭'}
          </button>
        </div>
        <p className="zept-settings__field-hint">专注/休息结束时播放钟磬提示音；振动仅 Android 生效</p>
      </Card>

      <Card delay={240}>
        <h2 className="zept-settings__section">数据</h2>
        <div className="zept-settings__actions">
          <Button variant="outlined" onClick={handleExport}>导出 JSON</Button>
          {!confirming ? (
            <Button variant="text" onClick={() => setConfirming(true)}>清空所有数据</Button>
          ) : (
            <div className="zept-settings__confirm">
              <p>确定要清空所有数据吗？此操作不可恢复。</p>
              <div className="zept-settings__confirm-actions">
                <Button variant="filled" onClick={handleClear}>确认清空</Button>
                <Button variant="text" onClick={() => setConfirming(false)}>取消</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card delay={320}>
        <h2 className="zept-settings__section">关于</h2>
        <p className="zept-settings__about">凝时 Zept — 备考专注陪伴</p>
        <p className="zept-settings__version">版本 0.1.0 · MVP</p>
        <button
          type="button"
          className={`zept-settings__compliance-toggle ${showCompliance ? 'zept-settings__compliance-toggle--open' : ''}`}
          onClick={() => setShowCompliance((v) => !v)}
          aria-expanded={showCompliance}
        >
          <span className="material-symbols-rounded">gavel</span>
          <span>合规声明</span>
          <span className="material-symbols-rounded zept-settings__compliance-chevron">expand_more</span>
        </button>
        {showCompliance && (
          <div className="zept-settings__compliance">
            <p>本应用遵循以下法规与边界，旨在为用户提供安全、负责任的专注陪伴服务。</p>
            <h3>一、适用法规</h3>
            <p>1. 《生成式人工智能服务管理暂行办法》（2023年8月15日施行）</p>
            <p>2. 《人工智能拟人化互动服务管理暂行办法》（2026年7月15日施行）</p>
            <h3>二、数据隐私</h3>
            <p>所有用户数据（目标、自评、会话记录、洞察）均存储于本地浏览器 IndexedDB，不上传服务器，不进行云端同步。数据导出与清空完全由用户控制。</p>
            <h3>三、内容安全</h3>
            <p>LLM 生成的洞察文本经前后端双重黑名单过滤，屏蔽涉及诊断、治疗、药物等医疗类词汇，以及指令性表述。</p>
            <h3>四、情绪出口</h3>
            <p>当用户自评情绪 ≤ 2 时，应用触发关怀门，展示校心理咨询中心与 12356 心理援助热线等资源出口，而非试图替代专业帮助。</p>
            <h3>五、诊疗边界</h3>
            <p>本应用不提供医疗诊断、心理诊断或治疗建议。所有洞察文本仅为学习陪伴性质，不构成专业意见。如需专业帮助，请咨询持牌心理咨询师或医疗机构。</p>
            <h3>六、LLM 服务说明</h3>
            <p>洞察文本由 DeepSeek API 经 Cloudflare Pages Functions 代理生成，API 密钥不前端暴露。LLM 调用失败时自动降级为规则模板。</p>
          </div>
        )}
      </Card>
    </div>
  );
}
