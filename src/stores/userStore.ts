import { create } from 'zustand';
import { saveUser, getUser } from '../lib/db';
import type { UserProfile } from '../types/user';

interface UserStore {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => Promise<void>;
  loadProfile: () => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
  profile: null,
  setProfile: async (p) => {
    await saveUser(p);
    set({ profile: p });
  },
  loadProfile: async () => {
    const profile = await getUser();
    set({ profile: profile ?? null });
  },
}));
