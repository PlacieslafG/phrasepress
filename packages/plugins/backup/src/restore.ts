import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { rm, copyFile, readdir } from 'node:fs/promises'
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

    // ── Restore DB ───────────────────────────────────────────────────────────
    if (restoreIncludes.db) {
      const extractedDb = join(extractDir, 'database', 'phrasepress.db')
      if (!existsSync(extractedDb)) {
        throw new Error('database/phrasepress.db not found in backup archive')
      }
      const liveSqlite = (db as unknown as { $client: SqliteRestoreClient }).$client
      const liveDbPath = liveSqlite.name

      liveSqlite.pragma('wal_checkpoint(TRUNCATE)')
      liveSqlite.close()
      await copyFile(extractedDb, liveDbPath)
    }

    // ── Restore Media ────────────────────────────────────────────────────────
    if (restoreIncludes.media) {
      const extractedMediaDir = join(extractDir, 'media')
      if (!existsSync(extractedMediaDir)) {
        throw new Error('media/ not found in backup archive')
      }
      const liveMediaDir = resolve(
        process.env['MEDIA_STORAGE_PATH'] ?? join(process.cwd(), 'data/uploads'),
      )
      await rm(liveMediaDir, { recursive: true, force: true })
      await copyDirRecursive(extractedMediaDir, liveMediaDir)
    }

    // ── Restore Plugins ──────────────────────────────────────────────────────
    if (restoreIncludes.plugins) {
      const extractedPluginsDir = join(extractDir, 'plugins')
      if (!existsSync(extractedPluginsDir)) {
        throw new Error('plugins/ not found in backup archive')
      }
      const livePluginsDir = resolve(WORKSPACE_ROOT, 'packages/plugins')
      await copyDirRecursive(extractedPluginsDir, livePluginsDir)
    }

    // ── Restore Config ───────────────────────────────────────────────────────
    if (restoreIncludes.config) {
      const extractedConfig = join(extractDir, 'config', 'phrasepress.config.ts')
      if (!existsSync(extractedConfig)) {
        throw new Error('config/phrasepress.config.ts not found in backup archive')
      }
      const liveConfig = resolve(WORKSPACE_ROOT, 'config/phrasepress.config.ts')
      await copyFile(extractedConfig, liveConfig)
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
