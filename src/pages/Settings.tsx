import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportAll, clearAll } from '../lib/db';
import { useUserStore } from '../stores/userStore';
import { type ThemeMode } from '../types/user';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import '../styles/settings.css';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '日间' },
  { value: 'dark', label: '夜间' },
];

export default function Settings() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const loadProfile = useUserStore((s) => s.loadProfile);
  const setTheme = useUserStore((s) => s.setTheme);
  const [confirming, setConfirming] = useState(false);

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
