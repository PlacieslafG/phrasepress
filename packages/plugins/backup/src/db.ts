import type { PluginContext } from '@phrasepress/core'
import type {
  BackupSettings, BackupHistoryEntry, BackupSchedule, BackupIncludes,
  BackupStatusType, StorageType,
} from './types.js'

type Db = PluginContext['db']

// Minimal interface for the better-sqlite3 Database instance
interface SqliteClient {
  exec(sql: string): void
  prepare(sql: string): PreparedStatement
  backup(dest: string): Promise<void>
  close(): void
  name: string
  pragma(source: string): unknown
}

interface PreparedStatement {
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
  run(...params: unknown[]): { lastInsertRowid: number | bigint }
}

function client(db: Db): SqliteClient {
  return (db as unknown as { $client: SqliteClient }).$client
}

// ─── Table creation ────────────────────────────────────────────────────────────

export function createTables(db: Db): void {
  client(db).exec(`
    CREATE TABLE IF NOT EXISTS pp_backup_settings (
      id                 TEXT PRIMARY KEY,
      retention_days     INTEGER NOT NULL DEFAULT 30,
      local_storage_path TEXT NOT NULL DEFAULT './data/backups',
      s3_keep_local      INTEGER NOT NULL DEFAULT 1,
      s3_endpoint        TEXT NOT NULL DEFAULT '',
      s3_bucket          TEXT NOT NULL DEFAULT '',
      s3_access_key      TEXT NOT NULL DEFAULT '',
      s3_secret_key      TEXT NOT NULL DEFAULT '',
      s3_region          TEXT NOT NULL DEFAULT 'us-east-1',
      updated_at         INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO pp_backup_settings (id, updated_at) VALUES ('default', 0);

    CREATE TABLE IF NOT EXISTS pp_backup_schedules (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL DEFAULT 'Backup automatico',
      enabled        INTEGER NOT NULL DEFAULT 1,
      interval_hours INTEGER NOT NULL DEFAULT 24,
      include_db     INTEGER NOT NULL DEFAULT 1,
      include_media  INTEGER NOT NULL DEFAULT 1,
      include_plugins INTEGER NOT NULL DEFAULT 0,
      include_config INTEGER NOT NULL DEFAULT 0,
      storage_type   TEXT NOT NULL DEFAULT 'local',
      last_run_at    INTEGER,
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pp_backup_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filename      TEXT NOT NULL,
      filepath      TEXT,
      s3_key        TEXT,
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      includes      TEXT NOT NULL DEFAULT '{}',
      storage_type  TEXT NOT NULL DEFAULT 'local',
      status        TEXT NOT NULL DEFAULT 'running',
      error         TEXT,
      schedule_id   INTEGER,
      schedule_name TEXT,
      created_at    INTEGER NOT NULL
    );
  `)

  // Idempotent migrations for existing installations
  for (const sql of [
    'ALTER TABLE pp_backup_history ADD COLUMN schedule_id   INTEGER',
    'ALTER TABLE pp_backup_history ADD COLUMN schedule_name TEXT',
  ]) {
    try { client(db).exec(sql) } catch { /* column already exists */ }
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: BackupSettings = {
  retentionDays:    30,
  localStoragePath: './data/backups',
  s3KeepLocal:      true,
  s3Endpoint:       '',
  s3Bucket:         '',
  s3AccessKey:      '',
  s3SecretKey:      '',
  s3Region:         'us-east-1',
  updatedAt:        0,
}

function rowToSettings(r: Record<string, unknown>): BackupSettings {
  return {
    retentionDays:    r['retention_days']     as number,
    localStoragePath: r['local_storage_path'] as string,
    s3KeepLocal:      r['s3_keep_local']      === 1,
    s3Endpoint:       r['s3_endpoint']        as string,
    s3Bucket:         r['s3_bucket']          as string,
    s3AccessKey:      r['s3_access_key']      as string,
    s3SecretKey:      r['s3_secret_key']      as string,
    s3Region:         r['s3_region']          as string,
    updatedAt:        r['updated_at']         as number,
  }
}

export function getSettings(db: Db): BackupSettings {
  const row = client(db).prepare('SELECT * FROM pp_backup_settings WHERE id = ?').get('default')
  return row ? rowToSettings(row) : { ...SETTINGS_DEFAULTS }
}

export function upsertSettings(db: Db, patch: Partial<BackupSettings>): BackupSettings {
  const current = getSettings(db)
  const merged  = { ...current, ...patch, updatedAt: Math.floor(Date.now() / 1000) }
  client(db).prepare(`
    UPDATE pp_backup_settings SET
      retention_days     = ?,
      local_storage_path = ?,
      s3_keep_local      = ?,
      s3_endpoint        = ?,
      s3_bucket          = ?,
      s3_access_key      = ?,
      s3_secret_key      = ?,
      s3_region          = ?,
      updated_at         = ?
    WHERE id = 'default'
  `).run(
    merged.retentionDays,
    merged.localStoragePath,
    merged.s3KeepLocal ? 1 : 0,
    merged.s3Endpoint,
    merged.s3Bucket,
    merged.s3AccessKey,
    merged.s3SecretKey,
    merged.s3Region,
    merged.updatedAt,
  )
  return merged
}

// ─── Schedules ────────────────────────────────────────────────────────────────

function rowToSchedule(r: Record<string, unknown>): BackupSchedule {
  return {
    id:             r['id']             as number,
    name:           r['name']           as string,
    enabled:        r['enabled']        === 1,
    intervalHours:  r['interval_hours'] as number,
    includeDb:      r['include_db']     === 1,
    includeMedia:   r['include_media']  === 1,
    includePlugins: r['include_plugins'] === 1,
    includeConfig:  r['include_config'] === 1,
    storageType:    r['storage_type']   as StorageType,
    lastRunAt:      (r['last_run_at'] as number | null) ?? null,
    createdAt:      r['created_at']     as number,
  }
}

export function listSchedules(db: Db): BackupSchedule[] {
  const rows = client(db).prepare('SELECT * FROM pp_backup_schedules ORDER BY created_at ASC').all()
  return rows.map(rowToSchedule)
}

export function getSchedule(db: Db, id: number): BackupSchedule | null {
  const row = client(db).prepare('SELECT * FROM pp_backup_schedules WHERE id = ?').get(id)
  return row ? rowToSchedule(row) : null
}

export function createSchedule(db: Db, data: {
  name:           string
  enabled:        boolean
  intervalHours:  number
  includeDb:      boolean
  includeMedia:   boolean
  includePlugins: boolean
  includeConfig:  boolean
  storageType:    StorageType
}): BackupSchedule {
  const now    = Math.floor(Date.now() / 1000)
  const result = client(db).prepare(`
    INSERT INTO pp_backup_schedules
      (name, enabled, interval_hours, include_db, include_media, include_plugins, include_config, storage_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.enabled ? 1 : 0,
    data.intervalHours,
    data.includeDb      ? 1 : 0,
    data.includeMedia   ? 1 : 0,
    data.includePlugins ? 1 : 0,
    data.includeConfig  ? 1 : 0,
    data.storageType,
    now,
  )
  return getSchedule(db, Number(result.lastInsertRowid))!
}

export function updateSchedule(db: Db, id: number, patch: Partial<Omit<BackupSchedule, 'id' | 'createdAt' | 'lastRunAt'>>): BackupSchedule | null {
  const current = getSchedule(db, id)
  if (!current) return null
  const merged = { ...current, ...patch }
  client(db).prepare(`
    UPDATE pp_backup_schedules SET
      name            = ?,
      enabled         = ?,
      interval_hours  = ?,
      include_db      = ?,
      include_media   = ?,
      include_plugins = ?,
      include_config  = ?,
      storage_type    = ?
    WHERE id = ?
  `).run(
    merged.name,
    merged.enabled      ? 1 : 0,
    merged.intervalHours,
    merged.includeDb      ? 1 : 0,
    merged.includeMedia   ? 1 : 0,
    merged.includePlugins ? 1 : 0,
    merged.includeConfig  ? 1 : 0,
    merged.storageType,
    id,
  )
  return getSchedule(db, id)
}

export function deleteSchedule(db: Db, id: number): void {
  client(db).prepare('DELETE FROM pp_backup_schedules WHERE id = ?').run(id)
}

export function updateScheduleLastRun(db: Db, id: number, lastRunAt: number): void {
  client(db).prepare('UPDATE pp_backup_schedules SET last_run_at = ? WHERE id = ?').run(lastRunAt, id)
}

// ─── History ──────────────────────────────────────────────────────────────────

function rowToHistory(r: Record<string, unknown>): BackupHistoryEntry {
  return {
    id:           r['id']           as number,
    filename:     r['filename']     as string,
    filepath:     (r['filepath']    as string | null) ?? null,
    s3Key:        (r['s3_key']      as string | null) ?? null,
    sizeBytes:    r['size_bytes']   as number,
    includes:     JSON.parse(r['includes'] as string) as BackupIncludes,
    storageType:  r['storage_type'] as StorageType,
    status:       r['status']       as BackupStatusType,
    error:        (r['error']       as string | null) ?? null,
    scheduleId:   (r['schedule_id'] as number | null) ?? null,
    scheduleName: (r['schedule_name'] as string | null) ?? null,
    createdAt:    r['created_at']   as number,
  }
}

export function insertHistory(db: Db, entry: Omit<BackupHistoryEntry, 'id'>): number {
  const result = client(db).prepare(`
    INSERT INTO pp_backup_history
      (filename, filepath, s3_key, size_bytes, includes, storage_type, status, error, schedule_id, schedule_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.filename,
    entry.filepath,
    entry.s3Key,
    entry.sizeBytes,
    JSON.stringify(entry.includes),
    entry.storageType,
    entry.status,
    entry.error,
    entry.scheduleId   ?? null,
    entry.scheduleName ?? null,
    entry.createdAt,
  )
  return Number(result.lastInsertRowid)
}

export function updateHistoryStatus(
  db: Db, id: number, status: BackupStatusType,
  opts?: { error?: string; filepath?: string; s3Key?: string; sizeBytes?: number },
): void {
  client(db).prepare(`
    UPDATE pp_backup_history
    SET status     = ?,
        error      = COALESCE(?, error),
        filepath   = COALESCE(?, filepath),
        s3_key     = COALESCE(?, s3_key),
        size_bytes = COALESCE(?, size_bytes)
    WHERE id = ?
  `).run(
    status,
    opts?.error     ?? null,
    opts?.filepath  ?? null,
    opts?.s3Key     ?? null,
    opts?.sizeBytes ?? null,
    id,
  )
}

export function getHistoryEntry(db: Db, id: number): BackupHistoryEntry | null {
  const row = client(db).prepare('SELECT * FROM pp_backup_history WHERE id = ?').get(id)
  return row ? rowToHistory(row) : null
}

export function listHistory(
  db: Db, page: number, limit: number,
): { entries: BackupHistoryEntry[]; total: number } {
  const offset = (page - 1) * limit
  const rows   = client(db).prepare(
    'SELECT * FROM pp_backup_history ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).all(limit, offset)
  const totalRow = client(db).prepare('SELECT COUNT(*) as cnt FROM pp_backup_history').get()
  return {
    entries: rows.map(rowToHistory),
    total:   (totalRow?.['cnt'] as number) ?? 0,
  }
}

export function deleteHistoryEntry(db: Db, id: number): void {
  client(db).prepare('DELETE FROM pp_backup_history WHERE id = ?').run(id)
}

export function applyRetention(db: Db, retentionDays: number): BackupHistoryEntry[] {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400
  const rows   = client(db).prepare(
    "SELECT * FROM pp_backup_history WHERE created_at < ? AND status = 'success'",
  ).all(cutoff)
  const entries = rows.map(rowToHistory)
  if (entries.length > 0) {
    const placeholders = entries.map(() => '?').join(',')
    client(db).prepare(
      `DELETE FROM pp_backup_history WHERE id IN (${placeholders})`,
    ).run(...entries.map(e => e.id))
  }
  return entries
}

export function getLastSuccessfulBackupTime(db: Db): number | null {
  const row = client(db).prepare(
    "SELECT created_at FROM pp_backup_history WHERE status = 'success' ORDER BY created_at DESC LIMIT 1",
  ).get()
  return row ? (row['created_at'] as number) : null
}

export { client as getSqliteClient }

