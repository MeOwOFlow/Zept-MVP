import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportAll, clearAll } from '../lib/db';
import { useUserStore } from '../stores/userStore';
import { DEFAULT_POMODORO_CONFIG, type PomodoroConfig, type ThemeMode } from '../types/user';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import '../styles/settings.css';

const WORK_OPTIONS = [15, 20, 25, 30, 45, 50, 60, 90];
const SHORT_BREAK_OPTIONS = [3, 5, 10, 15];
const LONG_BREAK_OPTIONS = [10, 15, 20, 30];
const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '日间' },
  { value: 'dark', label: '夜间' },
];
const LONG_BREAK_EVERY_OPTIONS = [
  { value: 0, label: '关闭长休' },
  { value: 2, label: '每 2 轮' },
  { value: 3, label: '每 3 轮' },
  { value: 4, label: '每 4 轮' },
  { value: 5, label: '每 5 轮' },
  { value: 6, label: '每 6 轮' },
];

export default function Settings() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const loadProfile = useUserStore((s) => s.loadProfile);
  const setTheme = useUserStore((s) => s.setTheme);
  const [confirming, setConfirming] = useState(false);
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_POMODORO_CONFIG);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile?.pomodoroConfig) {
      setConfig(profile.pomodoroConfig);
    }
  }, [profile]);

  const updateConfig = async (patch: Partial<PomodoroConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    if (profile) {
      await setProfile({ ...profile, pomodoroConfig: next });
    }
  };

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
    setConfirming(false);
    navigate('/onboarding');
  };

  return (
    <div className="zept-settings">
      <h1 className="zept-settings__title">设置</h1>

      <Card>
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

      <Card>
        <h2 className="zept-settings__section">番茄设置</h2>

        <div className="zept-settings__field">
          <label className="zept-settings__field-label">专注时长</label>
          <div className="zept-settings__chips">
            {WORK_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                className={`zept-chip ${config.workDurationMin === min ? 'zept-chip--active' : ''}`}
                onClick={() => updateConfig({ workDurationMin: min })}
              >
                {min} 分钟
              </button>
            ))}
          </div>
        </div>

        <div className="zept-settings__field">
          <label className="zept-settings__field-label">短休时长</label>
          <div className="zept-settings__chips">
            {SHORT_BREAK_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                className={`zept-chip ${config.shortBreakMin === min ? 'zept-chip--active' : ''}`}
                onClick={() => updateConfig({ shortBreakMin: min })}
              >
                {min} 分钟
              </button>
            ))}
          </div>
        </div>

        <div className="zept-settings__field">
          <label className="zept-settings__field-label">长休时长</label>
          <div className="zept-settings__chips">
            {LONG_BREAK_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                className={`zept-chip ${config.longBreakMin === min ? 'zept-chip--active' : ''}`}
                onClick={() => updateConfig({ longBreakMin: min })}
                disabled={config.longBreakEvery === 0}
              >
                {min} 分钟
              </button>
            ))}
          </div>
        </div>

        <div className="zept-settings__field">
          <label className="zept-settings__field-label">长休触发</label>
          <div className="zept-settings__chips">
            {LONG_BREAK_EVERY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`zept-chip ${config.longBreakEvery === opt.value ? 'zept-chip--active' : ''}`}
                onClick={() => updateConfig({ longBreakEvery: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
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

      <Card>
        <h2 className="zept-settings__section">关于</h2>
        <p className="zept-settings__about">凝时 Zept — 备考专注陪伴</p>
        <p className="zept-settings__version">版本 0.1.0 · MVP</p>
        <a href="/compliance.html" target="_blank" rel="noopener noreferrer">合规声明</a>
      </Card>
    </div>
  );
}
