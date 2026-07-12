import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  migrateLegacySession,
  ensureDataIntegrity,
  checkDataVersion,
  saveSession,
  clearAll,
  DATA_VERSION,
} from '../../src/lib/db';
import { STORAGE_KEYS } from '../../src/lib/storage-keys';
import type { SessionRecord } from '../../src/types/session';

const NOW = Date.now();

beforeEach(async () => {
  await db.sessions.clear();
  await db.insights.clear();
  await db.profiles.clear();
  localStorage.clear();
});

describe('migrateLegacySession', () => {
  it('完整记录不被修改', () => {
    const full: SessionRecord = {
      id: 's1', userId: 'local', goal: '考研', daysToExam: 30,
      startedAt: NOW - 1500_000, endedAt: NOW, status: 'completed',
      plannedDurationSec: 1500, actualDurationSec: 1500,
      isPomodoro: true, pomodoroCyclesCompleted: 1,
      interruptions: 0, interruptionEvents: [],
      startHour: 9, endHour: 10,
      preAssessment: { mood: 3 }, postAssessment: { mood: 4, focus: 4 },
      breakMoods: [],
    };
    const result = migrateLegacySession(full);
    expect(result).toEqual(full);
  });

  it('缺失 breakMoods + interruptionEvents 补空数组', () => {
    const legacy = {
      id: 's1', startedAt: NOW - 1500_000, endedAt: NOW,
      status: 'completed' as const,
    };
    const result = migrateLegacySession(legacy);
    expect(result.breakMoods).toEqual([]);
    expect(result.interruptionEvents).toEqual([]);
  });

  it('缺失 plannedDurationSec 补 0', () => {
    const legacy = { id: 's1', startedAt: NOW, endedAt: NOW };
    const result = migrateLegacySession(legacy);
    expect(result.plannedDurationSec).toBe(0);
  });

  it('缺失 actualDurationSec 时从 endedAt-startedAt 推算', () => {
    const startedAt = NOW - 1500_000;
    const legacy = { id: 's1', startedAt, endedAt: NOW };
    const result = migrateLegacySession(legacy);
    expect(result.actualDurationSec).toBe(1500);
  });

  it('缺失 endHour 从 endedAt 推算', () => {
    const endedAt = new Date('2026-07-06T10:30:00+08:00').getTime();
    const legacy = { id: 's1', startedAt: endedAt - 1500_000, endedAt };
    const result = migrateLegacySession(legacy);
    expect(result.endHour).toBe(10);
  });

  it('缺失 startHour 从 startedAt 推算', () => {
    const startedAt = new Date('2026-07-06T09:00:00+08:00').getTime();
    const legacy = { id: 's1', startedAt };
    const result = migrateLegacySession(legacy);
    expect(result.startHour).toBe(9);
  });

  it('缺失 endedAt 时 endHour 为 -1, actualDurationSec 为 0', () => {
    const legacy = { id: 's1', startedAt: NOW };
    const result = migrateLegacySession(legacy);
    expect(result.endedAt).toBeNull();
    expect(result.endHour).toBe(-1);
    expect(result.actualDurationSec).toBe(0);
  });
});

describe('ensureDataIntegrity', () => {
  it('空表返回 0', async () => {
    const fixed = await ensureDataIntegrity();
    expect(fixed).toBe(0);
  });

  it('已完整的记录不被改动', async () => {
    const full: SessionRecord = {
      id: 's1', userId: 'local', goal: '考研', daysToExam: 30,
      startedAt: NOW - 1500_000, endedAt: NOW, status: 'completed',
      plannedDurationSec: 1500, actualDurationSec: 1500,
      isPomodoro: true, pomodoroCyclesCompleted: 1,
      interruptions: 0, interruptionEvents: [],
      startHour: 9, endHour: 10,
      preAssessment: null, postAssessment: null, breakMoods: [],
    };
    await saveSession(full);
    const fixed = await ensureDataIntegrity();
    expect(fixed).toBe(0);
    const unchanged = await db.sessions.get('s1');
    expect(unchanged).toEqual(full);
  });

  it('缺字段的记录被修复', async () => {
    // 模拟老数据：只存了最小字段，缺 breakMoods / interruptionEvents / endHour / plannedDurationSec
    await db.sessions.put({
      id: 'legacy1', startedAt: NOW - 1500_000, endedAt: NOW,
      status: 'completed',
    } as any);
    const fixed = await ensureDataIntegrity();
    expect(fixed).toBe(1);
    const migrated = await db.sessions.get('legacy1');
    expect(migrated?.interruptionEvents).toEqual([]);
    expect(migrated?.breakMoods).toEqual([]);
    expect(migrated?.plannedDurationSec).toBe(0);
    expect(migrated?.endHour).toBe(new Date(NOW).getHours());
    expect(migrated?.userId).toBe('local');
  });

  it('部分缺字段只修需要修的', async () => {
    const ok: SessionRecord = {
      id: 'ok', userId: 'local', goal: '考研', daysToExam: 30,
      startedAt: NOW, endedAt: NOW, status: 'completed',
      plannedDurationSec: 1500, actualDurationSec: 1500,
      isPomodoro: true, pomodoroCyclesCompleted: 1,
      interruptions: 0, interruptionEvents: [], breakMoods: [],
      startHour: 9, endHour: 10,
      preAssessment: null, postAssessment: null,
    };
    await saveSession(ok);
    await db.sessions.put({
      id: 'broken', startedAt: NOW, endedAt: NOW,
    } as any);
    const fixed = await ensureDataIntegrity();
    expect(fixed).toBe(1);
    // ok 不被改动
    const okResult = await db.sessions.get('ok');
    expect(okResult).toEqual(ok);
    // broken 被修复
    const brokenResult = await db.sessions.get('broken');
    expect(brokenResult?.interruptionEvents).toEqual([]);
  });
});

describe('checkDataVersion', () => {
  it('首次运行触发校验并写入版本号', async () => {
    const result = await checkDataVersion();
    expect(result.migrated).toBe(true);
    expect(result.fixedCount).toBe(0);
    expect(localStorage.getItem(STORAGE_KEYS.DATA_VERSION)).toBe(String(DATA_VERSION));
  });

  it('版本一致时跳过校验', async () => {
    localStorage.setItem(STORAGE_KEYS.DATA_VERSION, String(DATA_VERSION));
    // 故意放入缺字段数据，但因为版本一致不应被修
    await db.sessions.put({ id: 'broken', startedAt: NOW } as any);
    const result = await checkDataVersion();
    expect(result.migrated).toBe(false);
    expect(result.fixedCount).toBe(0);
    // 数据仍是不完整的
    const stillBroken = await db.sessions.get('broken');
    expect(stillBroken?.breakMoods).toBeUndefined();
  });

  it('版本升级时触发校验', async () => {
    localStorage.setItem(STORAGE_KEYS.DATA_VERSION, '0');
    await db.sessions.put({ id: 'broken', startedAt: NOW, endedAt: NOW } as any);
    const result = await checkDataVersion();
    expect(result.migrated).toBe(true);
    expect(result.fixedCount).toBe(1);
    expect(localStorage.getItem(STORAGE_KEYS.DATA_VERSION)).toBe(String(DATA_VERSION));
    // 数据被修复
    const fixed = await db.sessions.get('broken');
    expect(fixed?.breakMoods).toEqual([]);
  });
});

describe('clearAll cleans data version marker', () => {
  it('clearAll 后 zept-data-version 被移除', async () => {
    localStorage.setItem(STORAGE_KEYS.DATA_VERSION, String(DATA_VERSION));
    await clearAll();
    expect(localStorage.getItem(STORAGE_KEYS.DATA_VERSION)).toBeNull();
  });
});
