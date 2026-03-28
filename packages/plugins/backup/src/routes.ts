import { createReadStream, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import type { TriggerBackupBody, RestoreBody, BackupIncludes, StorageType, CreateScheduleBody } from './types.js'
import {
  getSettings, upsertSettings,
  listHistory, getHistoryEntry, deleteHistoryEntry,
  listSchedules, getSchedule, createSchedule, updateSchedule, deleteSchedule,
} from './db.js'
import { startBackup } from './backup.js'
import { restoreFromBackup } from './restore.js'
import { downloadFromS3, deleteFile, deleteFromS3 } from './storage.js'
import type { BackupScheduler } from './scheduler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Stessa tecnica usata dall'attivazione plugin: scrive lo stesso file watchato da nodemon.
function triggerRestart(): void {
  const triggerFile = resolve(__dirname, '../../../../packages/core/src/api/restart-trigger.ts')
  writeFileSync(triggerFile, `// restart trigger — auto-generated\nexport const t = ${Date.now()}\n`)
}

// ─── Debug helpers ────────────────────────────────────────────────────────────

function getTriggerFilePath(): string {
  return resolve(__dirname, '../../../../packages/core/src/api/restart-trigger.ts')
}

function debugTriggerInfo(): Record<string, unknown> {
  const triggerFile = getTriggerFilePath()
  let currentContent: string | null = null
  let fileExists = false
  let fileStat: { mtime: string; size: number } | null = null

  try {
    currentContent = readFileSync(triggerFile, 'utf8')
    const stat = statSync(triggerFile)
    fileExists = true
    fileStat = { mtime: stat.mtime.toISOString(), size: stat.size }
  } catch { /* file may not exist */ }

  return {
    __dirname_at_runtime: __dirname,
    trigger_file_path: triggerFile,
    trigger_file_exists: fileExists,
    trigger_file_stat: fileStat,
    trigger_file_content: currentContent,
  }
}

// ─── JSON Schemas ─────────────────────────────────────────────────────────────

const settingsPutSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    retentionDays:    { type: 'integer', minimum: 0 },
    localStoragePath: { type: 'string', minLength: 1 },
    s3KeepLocal:      { type: 'boolean' },
    s3Endpoint:       { type: 'string' },
    s3Bucket:         { type: 'string' },
    s3AccessKey:      { type: 'string' },
    s3SecretKey:      { type: 'string' },
    s3Region:         { type: 'string' },
  },
} as const

const scheduleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'intervalHours'],
  properties: {
    name:           { type: 'string', minLength: 1 },
    enabled:        { type: 'boolean' },
    intervalHours:  { type: 'integer', minimum: 1 },
    includeDb:      { type: 'boolean' },
    includeMedia:   { type: 'boolean' },
    includePlugins: { type: 'boolean' },
    includeConfig:  { type: 'boolean' },
    storageType:    { type: 'string', enum: ['local', 's3', 'both'] },
  },
} as const

const scheduleUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name:           { type: 'string', minLength: 1 },
    enabled:        { type: 'boolean' },
    intervalHours:  { type: 'integer', minimum: 1 },
    includeDb:      { type: 'boolean' },
    includeMedia:   { type: 'boolean' },
    includePlugins: { type: 'boolean' },
    includeConfig:  { type: 'boolean' },
    storageType:    { type: 'string', enum: ['local', 's3', 'both'] },
  },
} as const

const triggerBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includes: {
      type: 'object',
      additionalProperties: false,
      properties: {
        db:      { type: 'boolean' },
        media:   { type: 'boolean' },
        plugins: { type: 'boolean' },
        config:  { type: 'boolean' },
      },
    },
    storageType: { type: 'string', enum: ['local', 's3', 'both'] },
  },
} as const

const restoreBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includes: {
      type: 'object',
      additionalProperties: false,
      properties: {
        db:      { type: 'boolean' },
        media:   { type: 'boolean' },
        plugins: { type: 'boolean' },
        config:  { type: 'boolean' },
      },
    },
  },
} as const

const paginationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page:  { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerBackupRoutes(
  app:       FastifyInstance,
  ctx:       PluginContext,
  scheduler: BackupScheduler,
): Promise<void> {
  const auth          = ctx.fastify.authenticate
  const requireManage = ctx.fastify.requireCapability('manage_options')

  // ── GET /debug ─────────────────────────────────────────────────────────────
  // DEBUG ONLY — da rimuovere in produzione
  app.get('/debug', {
    preHandler: [auth, requireManage],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const info = debugTriggerInfo()
    console.log('[BACKUP DEBUG] /debug endpoint called:', JSON.stringify(info, null, 2))
    return reply.send(info)
  })

  // ── POST /debug/trigger ───────────────────────────────────────────────────
  // DEBUG ONLY — testa il trigger in isolamento, da rimuovere in produzione
  app.post('/debug/trigger', {
    preHandler: [auth, requireManage],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const before = debugTriggerInfo()
    let writeError: string | null = null
    let writeSuccess = false

    try {
      triggerRestart()
      writeSuccess = true
    } catch (err) {
      writeError = err instanceof Error ? err.message : String(err)
    }

    const after = debugTriggerInfo()
    const result = {
      write_success: writeSuccess,
      write_error: writeError,
      before,
      after,
      trigger_content_changed: before.trigger_file_content !== after.trigger_file_content,
    }
    console.log('[BACKUP DEBUG] /debug/trigger result:', JSON.stringify(result, null, 2))
    return reply.send(result)
  })

  // ── GET /settings ─────────────────────────────────────────────────────────
  app.get('/settings', {
    preHandler: [auth, requireManage],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const settings = getSettings(ctx.db)
    return reply.send({ ...settings, s3SecretKey: settings.s3SecretKey ? '••••••••' : '' })
  })

  // ── PUT /settings ─────────────────────────────────────────────────────────
  app.put<{ Body: Record<string, unknown> }>('/settings', {
    preHandler: [auth, requireManage],
    schema:     { body: settingsPutSchema },
  }, async (req: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
    const body = req.body
    if (typeof body['s3SecretKey'] === 'string' && body['s3SecretKey'].startsWith('•')) {
      delete body['s3SecretKey']
    }
    const updated = upsertSettings(ctx.db, body)
    return reply.send({ ...updated, s3SecretKey: updated.s3SecretKey ? '••••••••' : '' })
  })

  // ── GET /status ───────────────────────────────────────────────────────────
  app.get('/status', {
    preHandler: [auth, requireManage],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(scheduler.getStatus())
  })

  // ── GET /schedules ────────────────────────────────────────────────────────
  app.get('/schedules', {
    preHandler: [auth, requireManage],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(listSchedules(ctx.db))
  })

  // ── POST /schedules ───────────────────────────────────────────────────────
  app.post<{ Body: CreateScheduleBody }>('/schedules', {
    preHandler: [auth, requireManage],
    schema:     { body: scheduleBodySchema },
  }, async (req: FastifyRequest<{ Body: CreateScheduleBody }>, reply: FastifyReply) => {
    const schedule = createSchedule(ctx.db, {
      name:           req.body.name,
      enabled:        req.body.enabled        ?? true,
      intervalHours:  req.body.intervalHours,
      includeDb:      req.body.includeDb      ?? true,
      includeMedia:   req.body.includeMedia   ?? true,
      includePlugins: req.body.includePlugins ?? false,
      includeConfig:  req.body.includeConfig  ?? false,
      storageType:    (req.body.storageType   as StorageType | undefined) ?? 'local',
    })
    if (schedule.enabled) scheduler.restartSchedule(ctx.db, schedule.id)
    return reply.status(201).send(schedule)
  })

  // ── PUT /schedules/:id ────────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: Partial<CreateScheduleBody> }>('/schedules/:id', {
    preHandler: [auth, requireManage],
    schema:     { body: scheduleUpdateSchema },
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: Partial<CreateScheduleBody> }>, reply: FastifyReply) => {
    const id = parseInt(req.params.id, 10)
    if (!getSchedule(ctx.db, id)) return reply.status(404).send({ error: 'Schedule not found' })

    const updated = updateSchedule(ctx.db, id, req.body as Partial<Parameters<typeof updateSchedule>[2]>)
    if (!updated) return reply.status(404).send({ error: 'Schedule not found' })

    if (updated.enabled) {
      scheduler.restartSchedule(ctx.db, id)
    } else {
      scheduler.stopSchedule(id)
    }
    return reply.send(updated)
  })

  // ── DELETE /schedules/:id ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/schedules/:id', {
    preHandler: [auth, requireManage],
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(req.params.id, 10)
    if (!getSchedule(ctx.db, id)) return reply.status(404).send({ error: 'Schedule not found' })
    scheduler.stopSchedule(id)
    deleteSchedule(ctx.db, id)
    return reply.status(204).send()
  })

  // ── GET /history ──────────────────────────────────────────────────────────
  app.get<{ Querystring: { page?: number; limit?: number } }>('/history', {
    preHandler: [auth, requireManage],
    schema:     { querystring: paginationSchema },
  }, async (req: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>, reply: FastifyReply) => {
    const page  = req.query.page  ?? 1
    const limit = req.query.limit ?? 20
    const { entries, total } = listHistory(ctx.db, page, limit)
    return reply.send({ entries, total, page, limit })
  })

  // ── POST /trigger ─────────────────────────────────────────────────────────
  app.post<{ Body: TriggerBackupBody }>('/trigger', {
    preHandler: [auth, requireManage],
    schema:     { body: triggerBodySchema },
  }, async (req: FastifyRequest<{ Body: TriggerBackupBody }>, reply: FastifyReply) => {
    const status = scheduler.getStatus()
    if (status.isRunning) {
      return reply.status(409).send({ error: 'A backup is already running', currentJobIds: status.currentJobIds })
    }

    const defaults: BackupIncludes = { db: true, media: true, plugins: false, config: false }
    const includes: BackupIncludes = { ...defaults, ...(req.body.includes ?? {}) }

    const { id, done } = startBackup({
      db:          ctx.db,
      includes,
      storageType: req.body.storageType as StorageType | undefined,
    })
    done.catch(() => { /* error stored in backup_history */ })

    return reply.status(202).send({ id })
  })

  // ── GET /history/:id/download ──────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/history/:id/download', {
    preHandler: [auth, requireManage],
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id    = parseInt(req.params.id, 10)
    const entry = getHistoryEntry(ctx.db, id)
    if (!entry) return reply.status(404).send({ error: 'Backup not found' })
    if (entry.status !== 'success') {
      return reply.status(422).send({ error: 'Backup is not in success state' })
    }

    let filePath = entry.filepath
    let tempFile: string | null = null

    if (!filePath || !existsSync(filePath)) {
      if (!entry.s3Key) {
        return reply.status(404).send({ error: 'Backup file is not available (not local, no S3 key)' })
      }
      const settings = getSettings(ctx.db)
      tempFile = join(tmpdir(), entry.filename)
      await downloadFromS3(settings, entry.s3Key, tempFile)
      filePath = tempFile
    }

    const { size } = statSync(filePath)
    const stream   = createReadStream(filePath)

    if (tempFile) {
      stream.on('end', () => { unlink(tempFile!).catch(() => { /* best-effort */ }) })
    }

    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="${entry.filename}"`)
    reply.header('Content-Length', size)
    return reply.send(stream)
  })

  // ── POST /history/:id/restore ──────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: RestoreBody }>('/history/:id/restore', {
    preHandler: [auth, requireManage],
    schema:     { body: restoreBodySchema },
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: RestoreBody }>, reply: FastifyReply) => {
    const id    = parseInt(req.params.id, 10)
    const entry = getHistoryEntry(ctx.db, id)
    if (!entry) return reply.status(404).send({ error: 'Backup not found' })
    if (entry.status !== 'success') {
      return reply.status(422).send({ error: 'Cannot restore from a failed backup' })
    }

    const settings        = getSettings(ctx.db)
    const restoreIncludes = req.body.includes ?? entry.includes

    console.log(`[BACKUP RESTORE] Avvio restore backup #${id} — includes:`, restoreIncludes)
    console.log(`[BACKUP RESTORE] Trigger file path sarà: ${getTriggerFilePath()}`)

    try {
      await restoreFromBackup({ db: ctx.db, entry, settings, restoreIncludes })
      console.log('[BACKUP RESTORE] restoreFromBackup() completato senza errori')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[BACKUP RESTORE] restoreFromBackup() ha lanciato un errore:', msg)
      // If db was closed during restore the server is broken regardless — exit to let it restart cleanly.
      // We detect this by checking if the error is NOT a validation error (those throw before touching live data).
      const dbWasClosed = restoreIncludes.db === true
        && !msg.includes('not found in backup archive')
        && !msg.includes('not available')
      if (dbWasClosed) {
        console.log('[BACKUP RESTORE] DB era chiuso — invio risposta 500 e triggero restart')
        await reply.status(500).send({ error: `Restore failed after DB was replaced: ${msg}. Il server si riavvierà.` })
        setTimeout(() => {
          console.log('[BACKUP RESTORE] triggerRestart() chiamato dopo errore con DB chiuso')
          triggerRestart()
          console.log('[BACKUP RESTORE] triggerRestart() completato')
        }, 300)
        return reply
      }
      return reply.status(500).send({ error: `Restore failed: ${msg}` })
    }

    console.log('[BACKUP RESTORE] Invio risposta success...')
    await reply.send({ success: true, restarting: true })
    console.log('[BACKUP RESTORE] Risposta inviata. Schedulo triggerRestart() tra 300ms...')
    setTimeout(() => {
      console.log('[BACKUP RESTORE] triggerRestart() chiamato — scrivo su:', getTriggerFilePath())
      try {
        triggerRestart()
        console.log('[BACKUP RESTORE] triggerRestart() OK — file scritto, nodemon dovrebbe riavviarsi')
      } catch (err) {
        console.error('[BACKUP RESTORE] triggerRestart() FALLITO:', err)
      }
    }, 300)
  })

  // ── DELETE /history/:id ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/history/:id', {
    preHandler: [auth, requireManage],
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id    = parseInt(req.params.id, 10)
    const entry = getHistoryEntry(ctx.db, id)
    if (!entry) return reply.status(404).send({ error: 'Backup not found' })

    if (entry.filepath) await deleteFile(entry.filepath)
    if (entry.s3Key) {
      const settings = getSettings(ctx.db)
      await deleteFromS3(settings, entry.s3Key).catch(() => { /* best-effort */ })
    }
    deleteHistoryEntry(ctx.db, id)
    return reply.status(204).send()
  })
}
