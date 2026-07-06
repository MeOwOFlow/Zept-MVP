/**
 * @rn-status WEB-ONLY
 * IndexedDB 存储层。RN 迁移时需替换为 WatermelonDB / SQLite / MMKV。
 * 对外暴露的 saveX/getX 接口签名可保持不变，仅替换内部实现。
 */
import Dexie, { type Table } from 'dexie';
import type { SessionRecord, Insight, UserProfile } from '../types';

const SINGLETON_KEY = 'local';

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
