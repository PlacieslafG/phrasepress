import { mkdirSync, createWriteStream, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'
import type { PluginContext } from '@phrasepress/core'
import type { BackupIncludes, BackupSettings, StorageType } from './types.js'
import {
  insertHistory, updateHistoryStatus, applyRetention, getSettings,
} from './db.js'
import {
  getFileSize, saveLocally, uploadToS3, deleteFromS3, deleteFile,
} from './storage.js'

type Db = PluginContext['db']

interface SqliteBackupClient {
  backup(dest: string): Promise<void>
  name: string
}

const WORKSPACE_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

function resolveStoragePath(p: string): string {
  return p.startsWith('/') ? p : resolve(process.cwd(), p)
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

async function buildZip(zipPath: string, db: Db, includes: BackupIncludes): Promise<void> {
  const sqliteClient = (db as unknown as { $client: SqliteBackupClient }).$client

  const output  = createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  const finished = new Promise<void>((res, rej) => {
    output.on('close', res)
    output.on('error', rej)
    archive.on('error', rej)
  })

  archive.pipe(output)

  const dbTmpPath = zipPath + '.db'

  if (includes.db) {
    await sqliteClient.backup(dbTmpPath)
    archive.file(dbTmpPath, { name: 'database/phrasepress.db' })
  }

  if (includes.media) {
    const mediaDir = resolve(
      process.env['MEDIA_STORAGE_PATH'] ?? join(process.cwd(), 'data/uploads'),
    )
    if (existsSync(mediaDir)) {
      archive.directory(mediaDir, 'media')
    }
  }

  if (includes.plugins) {
    const pluginsDir = resolve(WORKSPACE_ROOT, 'packages/plugins')
    if (existsSync(pluginsDir)) {
      archive.directory(pluginsDir, 'plugins', (entry) => {
        const name = entry.name ?? ''
        if (name.includes('node_modules/')) return false
        if (name.endsWith('.ts') && !name.endsWith('.d.ts')) return false
        return entry
      })
    }
  }

  if (includes.config) {
    const configFile = resolve(WORKSPACE_ROOT, 'config/phrasepress.config.ts')
    if (existsSync(configFile)) {
      archive.file(configFile, { name: 'config/phrasepress.config.ts' })
    }
  }

  archive.finalize()
  await finished

  if (includes.db) {
    await deleteFile(dbTmpPath)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StartBackupResult {
  id:   number
  done: Promise<void>
}

export function startBackup(opts: {
  db:            Db
  includes:      BackupIncludes
  settings?:     BackupSettings
  storageType?:  StorageType
  scheduleId?:   number
  scheduleName?: string
}): StartBackupResult {
  const { db, includes } = opts
  const settings = opts.settings ?? getSettings(db)
  const effectiveStorage = opts.storageType ?? 'local'
  const now      = new Date()
  const filename = `backup-${formatTimestamp(now)}.zip`

  const id = insertHistory(db, {
    filename,
    filepath:     null,
    s3Key:        null,
    sizeBytes:    0,
    includes,
    storageType:  effectiveStorage,
    status:       'running',
    error:        null,
    scheduleId:   opts.scheduleId   ?? null,
    scheduleName: opts.scheduleName ?? null,
    createdAt:    Math.floor(now.getTime() / 1000),
  })

  const done = runBackupAsync(id, filename, effectiveStorage, db, includes, settings)
  return { id, done }
}

async function runBackupAsync(
  historyId:        number,
  filename:         string,
  effectiveStorage: StorageType,
  db:               Db,
  includes:         BackupIncludes,
  settings:         BackupSettings,
): Promise<void> {
  const tmpDir    = join(tmpdir(), `pp-backup-${randomUUID()}`)
  const tmpZipPath = join(tmpDir, filename)
  mkdirSync(tmpDir, { recursive: true })

  try {
    await buildZip(tmpZipPath, db, includes)

    const sizeBytes = await getFileSize(tmpZipPath)
    let filepath: string | null = null
    let s3Key:    string | null = null

    const localDir = resolveStoragePath(settings.localStoragePath)

    if (effectiveStorage === 'local' || effectiveStorage === 'both') {
      filepath = await saveLocally(tmpZipPath, localDir, filename)
    }

    if (effectiveStorage === 's3' || effectiveStorage === 'both') {
      s3Key = await uploadToS3(settings, tmpZipPath, filename)
    }

    // s3-only with keep-local: also save locally
    if (effectiveStorage === 's3' && settings.s3KeepLocal) {
      filepath = await saveLocally(tmpZipPath, localDir, filename)
    }

    updateHistoryStatus(db, historyId, 'success', { filepath: filepath ?? undefined, s3Key: s3Key ?? undefined, sizeBytes })

    if (settings.retentionDays > 0) {
      const toDelete = applyRetention(db, settings.retentionDays)
      for (const entry of toDelete) {
        if (entry.filepath) await deleteFile(entry.filepath)
        if (entry.s3Key)    await deleteFromS3(settings, entry.s3Key).catch(() => { /* best-effort */ })
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateHistoryStatus(db, historyId, 'failed', { error: msg })
    throw err
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
