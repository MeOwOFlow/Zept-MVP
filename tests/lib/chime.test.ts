import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- mock objects ----

const mockCreateOscillator = vi.fn();
const mockCreateGain = vi.fn();
const mockResume = vi.fn(async () => {});
const mockAudioCtx = {
  currentTime: 0,
  state: "running" as AudioContextState,
  resume: mockResume,
  createOscillator: mockCreateOscillator,
  createGain: mockCreateGain,
  destination: {},
};

const mockOsc = {
  type: "sine" as OscillatorType,
  frequency: { setValueAtTime: vi.fn() },
  start: vi.fn(),
  stop: vi.fn(),
  connect: vi.fn(),
};
const mockGain = {
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
};

// AudioContext mock：用 class 构造函数返回 mockAudioCtx（箭头函数不支持 new）
// chime.ts 内部 `new AudioContext()` 会拿到 mockAudioCtx 实例
vi.stubGlobal("AudioContext", class MockAudioContext {
  constructor() {
    return mockAudioCtx;
  }
});

// navigator.vibrate mock（保留原 navigator 其余字段）
vi.stubGlobal("navigator", {
  ...globalThis.navigator,
  vibrate: vi.fn(),
});

// Notification mock
const mockNotification = vi.fn();
Object.defineProperty(mockNotification, "permission", {
  value: "granted",
  configurable: true,
  writable: true,
});
Object.defineProperty(mockNotification, "requestPermission", {
  value: vi.fn(async () => "granted"),
  configurable: true,
  writable: true,
});
vi.stubGlobal("Notification", mockNotification);

// chime 模块在 import 时仅声明 `let audioCtx = null`，不调用 AudioContext，
// 所以 import 顺序不影响 mock；mock 在 unlockAudioContext() 被调用时才生效。
import { unlockAudioContext, playChime, vibrate, notifyBackground } from "../../src/lib/chime";

beforeEach(() => {
  mockCreateOscillator.mockClear().mockReturnValue(mockOsc);
  mockCreateGain.mockClear().mockReturnValue(mockGain);
  mockResume.mockClear();
  mockOsc.type = "sine";
  mockOsc.frequency.setValueAtTime.mockClear();
  mockOsc.start.mockClear();
  mockOsc.stop.mockClear();
  mockOsc.connect.mockClear().mockReturnValue(mockGain);
  mockGain.gain.setValueAtTime.mockClear();
  mockGain.gain.linearRampToValueAtTime.mockClear();
  mockGain.gain.exponentialRampToValueAtTime.mockClear();
  mockGain.connect.mockClear().mockReturnValue(mockAudioCtx.destination);
  mockAudioCtx.currentTime = 0;
  mockAudioCtx.state = "running";
  mockNotification.mockClear();
  (globalThis.navigator.vibrate as ReturnType<typeof vi.fn>).mockClear();
  // 每个测试前重新解锁，确保 chime 模块的 audioCtx 指向 mockAudioCtx
  unlockAudioContext();
});

describe("chime - unlockAudioContext", () => {
  it("AudioContext 解锁后 state 为 running", () => {
    unlockAudioContext();
    expect(mockAudioCtx.state).toBe("running");
  });

  it("state=suspended 时调用 resume", () => {
    mockAudioCtx.state = "suspended";
    unlockAudioContext();
    expect(mockResume).toHaveBeenCalled();
    mockAudioCtx.state = "running";
  });
});

describe("chime - playChime", () => {
  it("enabled=false 时不播放", () => {
    playChime("work-to-break", false);
    expect(mockCreateOscillator).not.toHaveBeenCalled();
  });

  it("work-to-break 播放双音 C5→E5", () => {
    playChime("work-to-break", true);
    expect(mockCreateOscillator).toHaveBeenCalledTimes(2);
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 0);
  });

  it("break-to-work 播放单音 A4 三角波", () => {
    playChime("break-to-work", true);
    expect(mockCreateOscillator).toHaveBeenCalledTimes(1);
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(mockOsc.type).toBe("triangle");
  });

  it("all-done 播放三音琶音 C-E-G", () => {
    playChime("all-done", true);
    expect(mockCreateOscillator).toHaveBeenCalledTimes(3);
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 0);
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 0.12);
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(783.99, 0.24);
  });
});

describe("chime - vibrate", () => {
  it("enabled=true 时调用 navigator.vibrate", () => {
    vibrate(true);
    expect(globalThis.navigator.vibrate).toHaveBeenCalledWith(200);
  });

  it("enabled=false 时不调用", () => {
    (globalThis.navigator.vibrate as ReturnType<typeof vi.fn>).mockClear();
    vibrate(false);
    expect(globalThis.navigator.vibrate).not.toHaveBeenCalled();
  });
});

describe("chime - notifyBackground", () => {
  it("页面可见时不发送通知", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    notifyBackground("标题", "正文");
    expect(mockNotification).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("页面隐藏且权限已授予时发送通知", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    notifyBackground("标题", "正文");
    expect(mockNotification).toHaveBeenCalledWith(
      "标题",
      expect.objectContaining({
        body: "正文",
        tag: "zept-chime",
      }),
    );
    vi.restoreAllMocks();
  });

  it("权限未授予时不发送", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    Object.defineProperty(mockNotification, "permission", {
      value: "denied",
      configurable: true,
      writable: true,
    });
    notifyBackground("标题", "正文");
    expect(mockNotification).not.toHaveBeenCalled();
    Object.defineProperty(mockNotification, "permission", {
      value: "granted",
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });
});
