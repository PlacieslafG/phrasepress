import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql, desc, asc, eq } from 'drizzle-orm'
import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── Schema (plugin-managed table) ───────────────────────────────────────────

export const dbMonitorQueryLog = sqliteTable('db_monitor_query_log', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  url:        text('url').notNull(),
  method:     text('method').notNull(),
  durationMs: integer('duration_ms').notNull(),
  statusCode: integer('status_code'),
  userAgent:  text('user_agent'),
  userId:     integer('user_id'),
  createdAt:  integer('created_at').notNull(),
})

export type QueryLogRow = typeof dbMonitorQueryLog.$inferSelect

// ─── Table lifecycle ──────────────────────────────────────────────────────────

export function createQueryLogTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS db_monitor_query_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      url         TEXT    NOT NULL,
      method      TEXT    NOT NULL,
      duration_ms INTEGER NOT NULL,
      status_code INTEGER,
      user_agent  TEXT,
      user_id     INTEGER,
      created_at  INTEGER NOT NULL
    )
  `)
  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_db_monitor_query_log_duration
    ON db_monitor_query_log (duration_ms)
  `)
  db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_db_monitor_query_log_created_at
    ON db_monitor_query_log (created_at)
  `)
}

// ─── Insert ───────────────────────────────────────────────────────────────────

export interface QueryLogInput {
  url:        string
  method:     string
  durationMs: number
  statusCode: number | null
  userAgent:  string | null
  userId:     number | null
}

const MAX_URL_LENGTH       = 500
const MAX_USER_AGENT_LENGTH = 200

export function insertQueryLog(db: Db, input: QueryLogInput): void {
  db.insert(dbMonitorQueryLog).values({
    url:        input.url.slice(0, MAX_URL_LENGTH),
    method:     input.method.toUpperCase(),
    durationMs: input.durationMs,
    statusCode: input.statusCode ?? null,
    userAgent:  input.userAgent ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    userId:     input.userId ?? null,
    createdAt:  Math.floor(Date.now() / 1000),
  }).run()
}

// ─── Query log list ───────────────────────────────────────────────────────────

export type QueryLogSort = 'slowest' | 'fastest' | 'newest' | 'oldest'

export interface QueryLogPage {
  data:  QueryLogRow[]
  total: number
  page:  number
  limit: number
}

export function listQueryLog(
  db: Db,
  page: number,
  limit: number,
  sort: QueryLogSort,
): QueryLogPage {
  const offset = (page - 1) * limit

  const orderBy = {
    slowest: desc(dbMonitorQueryLog.durationMs),
    fastest: asc(dbMonitorQueryLog.durationMs),
    newest:  desc(dbMonitorQueryLog.createdAt),
    oldest:  asc(dbMonitorQueryLog.createdAt),
  }[sort]

  const data = db
    .select()
    .from(dbMonitorQueryLog)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)
    .all()

  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dbMonitorQueryLog)
    .get()

  const total = countResult?.count ?? 0

  return { data, total, page, limit }
}

// ─── Aggregated stats ─────────────────────────────────────────────────────────

export interface QueryLogStats {
  count:   number
  avgMs:   number
  p50Ms:   number
  p95Ms:   number
  maxMs:   number
  slowest: Array<{ url: string; method: string; durationMs: number; createdAt: number }>
}

export function getQueryLogStats(db: Db): QueryLogStats {
  const aggResult = db.get(sql`
    SELECT
      COUNT(*)                  AS count,
      COALESCE(AVG(duration_ms), 0) AS avg_ms,
      COALESCE(MAX(duration_ms), 0) AS max_ms
    FROM db_monitor_query_log
  `) as { count: number; avg_ms: number; max_ms: number } | undefined

  if (!aggResult || aggResult.count === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, slowest: [] }
  }

  const count = aggResult.count

  // Compute P50 and P95 using SQLite offset-based approach
  const p50Row = db.get(sql`
    SELECT duration_ms FROM db_monitor_query_log
    ORDER BY duration_ms
    LIMIT 1 OFFSET ${Math.floor(count * 0.5)}
  `) as { duration_ms: number } | undefined

  const p95Row = db.get(sql`
    SELECT duration_ms FROM db_monitor_query_log
    ORDER BY duration_ms
    LIMIT 1 OFFSET ${Math.floor(count * 0.95)}
  `) as { duration_ms: number } | undefined

  const slowest = db
    .select({
      url:        dbMonitorQueryLog.url,
      method:     dbMonitorQueryLog.method,
      durationMs: dbMonitorQueryLog.durationMs,
      createdAt:  dbMonitorQueryLog.createdAt,
    })
    .from(dbMonitorQueryLog)
    .orderBy(desc(dbMonitorQueryLog.durationMs))
    .limit(10)
    .all()

  return {
    count,
    avgMs:  Math.round(aggResult.avg_ms),
    p50Ms:  p50Row?.duration_ms ?? 0,
    p95Ms:  p95Row?.duration_ms ?? 0,
    maxMs:  aggResult.max_ms,
    slowest,
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function clearQueryLog(db: Db): { deleted: number } {
  const before = (db.get(sql`SELECT COUNT(*) AS cnt FROM db_monitor_query_log`) as { cnt: number }).cnt
  db.delete(dbMonitorQueryLog).run()
  return { deleted: before }
}
