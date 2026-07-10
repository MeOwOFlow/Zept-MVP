/**
 * @rn-status WEB-ONLY (Web Audio API) / RN-READY (接口签名可复用，内部替换为 react-native-sound 或 expo-av)
 * 番茄钟阶段切换提示音引擎：
 * - 专注结束 → 休息：C5→E5 双音上行（"可以松口气了"）
 * - 休息结束 → 专注：A4 单音（"回来了"）
 * - 全部完成：C-E-G 琶音（仪式感）
 *
 * 音色合成：正弦波 + 指数衰减，钟磬质感，短促柔和
 * 零文件依赖，纯 Web Audio API 合成
 */

type ChimeType = "work-to-break" | "break-to-work" | "all-done";

let audioCtx: AudioContext | null = null;

/**
 * 在用户手势调用栈内解锁 AudioContext（iOS Safari 必须）。
 * 必须在 startSession 等用户点击事件中调用。
 */
export function unlockAudioContext(): void {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      // 浏览器不支持 Web Audio API
      return;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

/**
 * 合成单个钟磬音
 * @param freq 频率 Hz
 * @param startAt 开始时间（相对 audioCtx.currentTime 的偏移）
 * @param duration 持续时间秒
 * @param peakGain 峰值音量 0-1
 */
function playTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);

  // ADSR 包络：attack 20ms → peak → 指数衰减
  gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(peakGain, ctx.currentTime + startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}

/**
 * 播放提示音
 * @param type 切换类型
 * @param enabled 是否启用提示音（用户设置）
 */
export function playChime(type: ChimeType, enabled: boolean): void {
  if (!enabled) return;
  if (typeof window === "undefined") return;
  if (!audioCtx || audioCtx.state !== "running") return;

  const now = 0; // 相对当前 currentTime 的偏移

  if (type === "work-to-break") {
    // C5(523.25) → E5(659.25)，间隔 180ms，每音 400ms
    playTone(audioCtx, 523.25, now, 0.4, 0.15);
    playTone(audioCtx, 659.25, now + 0.18, 0.4, 0.15);
  } else if (type === "break-to-work") {
    // A4(440)，持续 600ms，三角波木质感
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.65);
  } else {
    // C(523.25)-E(659.25)-G(783.99) 琶音，间隔 120ms
    playTone(audioCtx, 523.25, now, 0.35, 0.15);
    playTone(audioCtx, 659.25, now + 0.12, 0.35, 0.15);
    playTone(audioCtx, 783.99, now + 0.24, 0.5, 0.15);
  }
}

/**
 * 触发振动反馈（Android only，iOS 不支持 navigator.vibrate）
 * @param enabled 是否启用振动
 */
export function vibrate(enabled: boolean): void {
  if (!enabled) return;
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(200);
}

/**
 * 后台通知兜底（页面不可见时）
 * @param title 通知标题
 * @param body 通知正文
 */
export function notifyBackground(title: string, body: string): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "zept-chime",
    });
  } catch {
    // 静默失败
  }
}

/**
 * 请求通知权限（用户点击"开始专注"时调用）
 */
export async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // 静默失败
    }
  }
}
