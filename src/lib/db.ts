/**
 * @rn-status WEB-ONLY
 * IndexedDB 存储层。RN 迁移时需替换为 WatermelonDB / SQLite / MMKV。
 * 对外暴露的 saveX/getX 接口签名可保持不变，仅替换内部实现。
 */
import Dexie, { type Table } from 'dexie';
import type { SessionRecord, Insight, UserProfile } from '../types';

const SINGLETON_KEY = 'local';

/**
 * 数据层版本号。变更 schema 或字段语义时 +1，对应 db.version(N).upgrade()。
 * 当前 v1：初始结构。新版本需在 constructor 里链式加 .version(2).stores().upgrade()。
 */
export const DATA_VERSION = 1;
const LS_VERSION_KEY = 'zept-data-version';

class ZeptDB extends Dexie {
  sessions!: Table<SessionRecord, string>;
  insights!: Table<Insight, string>;
  profiles!: Table<UserProfile & { id: string }, string>;

  constructor() {
    super('zept-db');
    this.version(1).stores({
      sessions: 'id, startedAt, status',
      insights: 'id, sessionId, createdAt, feedback',
      profiles: 'id',
    });
    // 未来 schema 变更示例（保持兼容链）：
    // this.version(2).stores({ sessions: 'id, startedAt, status, endHour' }).upgrade(async tx => {
    //   await tx.table('sessions').toCollection().modify(s => { if (s.endHour === undefined) s.endHour = new Date(s.endedAt ?? Date.now()).getHours(); });
    // });
  }
}

export const db = new ZeptDB();

// ---------- Sessions ----------

export async function saveSession(session: SessionRecord): Promise<void> {
  await db.sessions.put(session);
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db.sessions.get(id);
}

export async function getRecentSessions(n: number): Promise<SessionRecord[]> {
  return db.sessions.orderBy('startedAt').reverse().limit(n).toArray();
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  return db.sessions.toArray();
}

// ---------- Insights ----------

export async function saveInsight(insight: Insight): Promise<void> {
  await db.insights.put(insight);
}

export async function getInsight(id: string): Promise<Insight | undefined> {
  return db.insights.get(id);
}

export async function getAllInsights(): Promise<Insight[]> {
  return db.insights.toArray();
}

export async function getUsefulInsights(n: number): Promise<Insight[]> {
  // 走 feedback 索引，避免全表扫描
  const list = await db.insights
    .where('feedback')
    .equals('useful')
    .reverse()
    .sortBy('createdAt');
  return list.slice(0, n);
}

export async function updateInsightFeedback(id: string, feedback: 'useful' | 'useless'): Promise<void> {
  await db.insights.update(id, { feedback });
}

// ---------- User ----------

export async function saveUser(user: UserProfile): Promise<void> {
  await db.profiles.put({ ...user, id: SINGLETON_KEY });
}

export async function getUser(): Promise<UserProfile | undefined> {
  const row = await db.profiles.get(SINGLETON_KEY);
  if (!row) return undefined;
  const { id: _id, ...rest } = row;
  return rest;
}

// ---------- Maintenance ----------

export async function clearAll(): Promise<void> {
  await Promise.all([db.sessions.clear(), db.insights.clear(), db.profiles.clear()]);
  // 一键清空需包含运行态和欢迎标记
  localStorage.removeItem('zept-session-state');
  localStorage.removeItem('zept_welcome_seen');
  // 清理日报/周报缓存（zept-report-{scope}-{periodKey}）
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('zept-report-')) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  // 清理数据版本标记（下次启动会重新跑完整性校验）
  localStorage.removeItem(LS_VERSION_KEY);
}

export async function exportAll(): Promise<{
  sessions: SessionRecord[];
  insights: Insight[];
  user?: UserProfile;
}> {
  const [sessions, insights, user] = await Promise.all([
    db.sessions.toArray(),
    db.insights.toArray(),
    getUser(),
  ]);
  return { sessions, insights, user };
}

// ---------- 数据完整性校验（部署后字段缺失防护） ----------

/**
 * 修复单条会话缺失/异常字段，返回新对象（不 mutate 原对象）。
 * 场景：升级部署后老数据缺 breakMoods / interruptionEvents / endHour 等字段。
 */
export function migrateLegacySession(s: Partial<SessionRecord> & { id: string; startedAt: number }): SessionRecord {
  const endedAt = s.endedAt ?? null;
  return {
    id: s.id,
    userId: s.userId ?? SINGLETON_KEY,
    goal: s.goal ?? '',
    daysToExam: s.daysToExam ?? 0,
    startedAt: s.startedAt,
    endedAt,
    status: s.status ?? 'completed',
    plannedDurationSec: s.plannedDurationSec ?? 0,
    actualDurationSec: s.actualDurationSec ?? (endedAt ? Math.max(0, Math.round((endedAt - s.startedAt) / 1000)) : 0),
    isPomodoro: s.isPomodoro ?? false,
    pomodoroCyclesCompleted: s.pomodoroCyclesCompleted ?? 0,
    interruptions: s.interruptions ?? 0,
    interruptionEvents: Array.isArray(s.interruptionEvents) ? s.interruptionEvents : [],
    startHour: s.startHour ?? new Date(s.startedAt).getHours(),
    endHour: s.endHour ?? (endedAt !== null ? new Date(endedAt).getHours() : -1),
    preAssessment: s.preAssessment ?? null,
    postAssessment: s.postAssessment ?? null,
    breakMoods: Array.isArray(s.breakMoods) ? s.breakMoods : [],
    insightId: s.insightId,
  };
}

/**
 * 启动时校验数据完整性：扫描 sessions 表，修复缺字段的老记录。
 * - 幂等：已完整的记录不会被改动
 * - 安全：只补默认值，不删数据
 * - 返回修复的条数（用于调试/日志）
 */
export async function ensureDataIntegrity(): Promise<number> {
  const all = await db.sessions.toArray();
  const needMigration = all.filter((s) =>
    !Array.isArray(s.interruptionEvents) ||
    !Array.isArray(s.breakMoods) ||
    s.endHour === undefined ||
    s.plannedDurationSec === undefined,
  );
  if (needMigration.length === 0) return 0;

  const fixed = needMigration.map((s) => migrateLegacySession(s));
  await db.sessions.bulkPut(fixed);
  return fixed.length;
}

/**
 * 检查数据版本是否匹配。不匹配时触发 ensureDataIntegrity。
 * - 当前版本一致 → 跳过
 * - 版本不一致或首次 → 跑一次完整性校验，然后写入当前版本号
 */
export async function checkDataVersion(): Promise<{ migrated: boolean; fixedCount: number }> {
  const stored = localStorage.getItem(LS_VERSION_KEY);
  const current = String(DATA_VERSION);
  if (stored === current) {
    // 已校验过，无需重复
    return { migrated: false, fixedCount: 0 };
  }
  // 版本变化或首次 → 跑完整性校验
  const fixedCount = await ensureDataIntegrity();
  localStorage.setItem(LS_VERSION_KEY, current);
  return { migrated: true, fixedCount };
}
