import type { ThemeMode } from '../types/user';

/**
 * 应用主题到 document root。
 * - 'light' / 'dark' 直接写入 data-theme
 * - 'auto' 写入 data-theme="auto"，CSS 通过 prefers-color-scheme 媒体查询接管
 *
 * 注意：此函数只在浏览器环境执行，lib 层不依赖 React，
 * 通过传入 applyFn 实现解耦（RN 端可传 Platform.setColorScheme）。
 */
export function applyTheme(
  mode: ThemeMode,
  applyFn: (mode: ThemeMode) => void = defaultDomApply,
): void {
  applyFn(mode);
  // 同步更新 PWA theme-color
  const isDark = mode === 'dark' || (mode === 'auto' && getSystemTheme() === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', getThemeColor(isDark));
  }
}

export function getThemeColor(isDark: boolean): string {
  return isDark ? '#000000' : '#f2f2f7';
}

function defaultDomApply(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
}

/**
 * 获取当前系统主题（用于 auto 模式的实时判断）。
 * 浏览器端用 matchMedia，非浏览器返回 'dark' 兜底。
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * 监听系统主题变化（auto 模式下使用）。
 * 返回 cleanup 函数。
 */
export function watchSystemTheme(onChange: (theme: 'light' | 'dark') => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = (e: MediaQueryListEvent) => {
    // 同步更新 theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', getThemeColor(!e.matches));
    }
    onChange(e.matches ? 'light' : 'dark');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
