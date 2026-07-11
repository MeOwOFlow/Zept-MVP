/**
 * @rn-status WEB-ONLY (persistence) / RN-READY (state logic with adapter injection)
 * Zustand 在 RN 可用。但当前实现强耦合：
 *   - saveUser/getUser 依赖 Dexie/IndexedDB（RN 需替换为 WatermelonDB / SQLite）
 *   - applyTheme 内部操作 document.documentElement，RN 需传 Platform.setColorScheme
 * RN 迁移时需将 db 层抽象为可注入的 userStorage adapter，theme applyFn 已支持解耦。
 */
import { create } from 'zustand';
import { saveUser, getUser } from '../lib/db';
import { applyTheme } from '../lib/theme';
import type { UserProfile, ThemeMode, ReplyStyle } from '../types/user';

interface UserStore {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => Promise<void>;
  loadProfile: () => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  setReplyStyle: (style: ReplyStyle) => Promise<void>;
  setTopDistractions: (items: string[]) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  setVibrationEnabled: (enabled: boolean) => Promise<void>;
  resetProfile: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  setProfile: async (p) => {
    await saveUser(p);
    applyTheme(p.theme);
    set({ profile: p });
  },
  loadProfile: async () => {
    const profile = await getUser();
    if (profile) applyTheme(profile.theme);
    set({ profile: profile ?? null });
  },
  setTheme: async (mode) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, theme: mode };
    await saveUser(next);
    applyTheme(mode);
    set({ profile: next });
  },

  setReplyStyle: async (style) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, replyStyle: style };
    await saveUser(next);
    set({ profile: next });
  },

  setTopDistractions: async (items) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, topDistractions: items };
    await saveUser(next);
    set({ profile: next });
  },

  setSoundEnabled: async (enabled) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, soundEnabled: enabled };
    await saveUser(next);
    set({ profile: next });
  },

  setVibrationEnabled: async (enabled) => {
    const current = get().profile;
    if (!current) return;
    const next = { ...current, vibrationEnabled: enabled };
    await saveUser(next);
    set({ profile: next });
  },

  resetProfile: () => {
    set({ profile: null });
  },
}));
