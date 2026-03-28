import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { rm, copyFile, readdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { PluginContext } from '@phrasepress/core'
import type { BackupHistoryEntry, BackupIncludes, BackupSettings } from './types.js'
import { downloadFromS3 } from './storage.js'

type Db = PluginContext['db']

interface SqliteRestoreClient {
  name:   string
  close(): void
  pragma(source: string): unknown
}

const WORKSPACE_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')

export async function restoreFromBackup(opts: {
  db:              Db
  entry:           BackupHistoryEntry
  settings:        BackupSettings
  restoreIncludes: Partial<BackupIncludes>
}): Promise<void> {
  const { db, entry, settings, restoreIncludes } = opts

  const tmpDir = join(tmpdir(), `pp-restore-${randomUUID()}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    // ── Locate ZIP ───────────────────────────────────────────────────────────
    let zipPath = entry.filepath

    if (!zipPath || !existsSync(zipPath)) {
      if (!entry.s3Key) {
        throw new Error('Backup file not found locally and no S3 key available')
      }
      zipPath = join(tmpDir, entry.filename)
      await downloadFromS3(settings, entry.s3Key, zipPath)
    }

    // ── Extract ZIP ──────────────────────────────────────────────────────────
    const extractDir = join(tmpDir, 'extracted')
    mkdirSync(extractDir, { recursive: true })

    const unzipper = await import('unzipper')
    await createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise()

    // ── Validate all requested components BEFORE touching live data ──────────
    if (restoreIncludes.db) {
      const extractedDb = join(extractDir, 'database', 'phrasepress.db')
      if (!existsSync(extractedDb)) {
        throw new Error('database/phrasepress.db not found in backup archive')
      }
    }
    // media/ potrebbe non esistere nell'archivio se al momento del backup non c'erano file
    if (restoreIncludes.plugins) {
      const extractedPluginsDir = join(extractDir, 'plugins')
      if (!existsSync(extractedPluginsDir)) {
        throw new Error('plugins/ not found in backup archive')
      }
    }
    if (restoreIncludes.config) {
      const extractedConfig = join(extractDir, 'config', 'phrasepress.config.ts')
      if (!existsSync(extractedConfig)) {
        throw new Error('config/phrasepress.config.ts not found in backup archive')
      }
    }

    // ── Restore Media (before DB — does not break server if it fails) ────────
    if (restoreIncludes.media) {
      const extractedMediaDir = join(extractDir, 'media')
      const liveMediaDir = resolve(
        process.env['MEDIA_STORAGE_PATH'] ?? join(process.cwd(), 'data/uploads'),
      )
      await rm(liveMediaDir, { recursive: true, force: true })
      // If media/ is absent from archive the backup had no files — live dir is already cleared above
      if (existsSync(extractedMediaDir)) {
        await copyDirRecursive(extractedMediaDir, liveMediaDir)
      }
    }

    // ── Restore Plugins (before DB — does not break server if it fails) ──────
    if (restoreIncludes.plugins) {
      const extractedPluginsDir = join(extractDir, 'plugins')
      const livePluginsDir = resolve(WORKSPACE_ROOT, 'packages/plugins')
      await copyDirRecursive(extractedPluginsDir, livePluginsDir)
    }

    // ── Restore Config (before DB — does not break server if it fails) ───────
    if (restoreIncludes.config) {
      const extractedConfig = join(extractDir, 'config', 'phrasepress.config.ts')
      const liveConfig = resolve(WORKSPACE_ROOT, 'config/phrasepress.config.ts')
      await copyFile(extractedConfig, liveConfig)
    }

    // ── Restore DB — LAST: closes SQLite, server must exit after this ────────
    if (restoreIncludes.db) {
      const extractedDb = join(extractDir, 'database', 'phrasepress.db')
      const liveSqlite = (db as unknown as { $client: SqliteRestoreClient }).$client
      const liveDbPath = liveSqlite.name

      liveSqlite.pragma('wal_checkpoint(TRUNCATE)')
      liveSqlite.close()
      await copyFile(extractedDb, liveDbPath)

      // Remove stale WAL/SHM files from the old DB — they belong to a different
      // database and could cause SQLite to misinterpret the restored file.
      const walPath = liveDbPath + '-wal'
      const shmPath = liveDbPath + '-shm'
      await unlink(walPath).catch(() => { /* file may not exist */ })
      await unlink(shmPath).catch(() => { /* file may not exist */ })
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const srcPath  = join(src, e.name)
    const destPath = join(dest, e.name)
    if (e.isDirectory()) {
      await copyDirRecursive(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}
