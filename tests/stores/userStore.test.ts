import { describe, it, expect, vi, beforeEach } from 'vitest';

const { putMock, getMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  getMock: vi.fn(),
}));
vi.mock('../../src/lib/db', () => ({
  db: { profiles: { put: putMock, get: getMock } },
  saveUser: vi.fn(async (u: any) => putMock(u)),
  getUser: vi.fn(async () => getMock()),
}));

import { useUserStore } from '../../src/stores/userStore';
import { DEFAULT_POMODORO_CONFIG, type UserProfile } from '../../src/types/user';

const profile: UserProfile = {
  goal: '考研', examDate: '2026-12-21', topDistractions: ['手机'], onboarded: true,
  pomodoroConfig: DEFAULT_POMODORO_CONFIG,
};

beforeEach(() => {
  useUserStore.setState({ profile: null });
  putMock.mockReset();
  getMock.mockReset();
});

describe('userStore', () => {
  it('setProfile 更新 state', async () => {
    await useUserStore.getState().setProfile(profile);
    expect(useUserStore.getState().profile).toEqual(profile);
  });

  it('loadProfile 读取后更新 state', async () => {
    getMock.mockResolvedValue(profile);
    await useUserStore.getState().loadProfile();
    expect(useUserStore.getState().profile).toEqual(profile);
  });

  it('loadProfile 空时保持 null', async () => {
    getMock.mockResolvedValue(undefined);
    await useUserStore.getState().loadProfile();
    expect(useUserStore.getState().profile).toBeNull();
  });
});
