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
}));
