import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import {
  dbGetSettings, dbUpdateSettings,
  dbListNotifications, dbGetNotification,
  dbCreateNotification, dbUpdateNotification, dbDeleteNotification,
  serializeNotification,
} from './db.js'
import { sendMail } from './mailer.js'

// ─── Tipi body ────────────────────────────────────────────────────────────────

type SettingsBody = {
  host:      string
  port:      number
  secure:    boolean
  fromName:  string
  fromEmail: string
  authUser:  string
  authPass?: string
}

type NotificationBody = {
  formId:           string
  toEmail:          string
  subjectTemplate?: string
  enabled?:         boolean
}

// ─── Schema validazione ───────────────────────────────────────────────────────

const settingsBodySchema = {
  type: 'object',
  required: ['host', 'port', 'secure', 'fromName', 'fromEmail', 'authUser'],
  properties: {
    host:      { type: 'string' },
    port:      { type: 'number', minimum: 1, maximum: 65535 },
    secure:    { type: 'boolean' },
    fromName:  { type: 'string' },
    fromEmail: { type: 'string' },
    authUser:  { type: 'string' },
    authPass:  { type: 'string' },
  },
}

const notificationBodySchema = {
  type: 'object',
  required: ['formId', 'toEmail'],
  properties: {
    formId:          { type: 'string', minLength: 1 },
    toEmail:         { type: 'string', minLength: 1 },
    subjectTemplate: { type: 'string' },
    enabled:         { type: 'boolean' },
  },
}

// Non esponiamo mai la password SMTP — restituiamo solo se è impostata
function maskSettings(s: ReturnType<typeof dbGetSettings>) {
  return {
    host:        s.host,
    port:        s.port,
    secure:      s.secure,
    fromName:    s.fromName,
    fromEmail:   s.fromEmail,
    authUser:    s.authUser,
    hasPassword: s.authPass !== '',
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerMailerRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const auth = [ctx.fastify.authenticate, ctx.fastify.requireCapability('manage_options')]

  // ── GET /settings ─────────────────────────────────────────────────────────
  app.get('/settings', { preHandler: auth }, async () => {
    return maskSettings(dbGetSettings(ctx.db))
  })

  // ── PUT /settings ─────────────────────────────────────────────────────────
  app.put<{ Body: SettingsBody }>('/settings', {
    preHandler: auth,
    schema: { body: settingsBodySchema },
  }, async (req: FastifyRequest<{ Body: SettingsBody }>) => {
    const current = dbGetSettings(ctx.db)
    dbUpdateSettings(ctx.db, {
      host:      req.body.host,
      port:      req.body.port,
      secure:    req.body.secure,
      fromName:  req.body.fromName,
      fromEmail: req.body.fromEmail,
      authUser:  req.body.authUser,
      // Mantieni la password esistente se non fornita o vuota (campo opzionale)
      authPass:  (req.body.authPass !== undefined && req.body.authPass !== '')
                   ? req.body.authPass
                   : current.authPass,
    })
    return maskSettings(dbGetSettings(ctx.db))
  })

  // ── POST /test — invia un'email di test ────────────────────────────────────
  app.post<{ Body: { toEmail: string } }>('/test', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        required: ['toEmail'],
        properties: { toEmail: { type: 'string', minLength: 1 } },
      },
    },
  }, async (req: FastifyRequest<{ Body: { toEmail: string } }>, reply: FastifyReply) => {
    const settings = dbGetSettings(ctx.db)
    try {
      await sendMail(settings, {
        to:      req.body.toEmail,
        subject: 'Test email — PhrasePress Mailer',
        html:    '<p style="font-family:system-ui,sans-serif">La configurazione SMTP funziona correttamente.</p>',
      })
      return { success: true }
    } catch (err) {
      return reply.status(422).send({
        error: err instanceof Error ? err.message : 'Invio fallito',
      })
    }
  })

  // ── GET /notifications ─────────────────────────────────────────────────────
  app.get('/notifications', { preHandler: auth }, async () => {
    return dbListNotifications(ctx.db).map(serializeNotification)
  })

  // ── POST /notifications ────────────────────────────────────────────────────
  app.post<{ Body: NotificationBody }>('/notifications', {
    preHandler: auth,
    schema: { body: notificationBodySchema },
  }, async (req: FastifyRequest<{ Body: NotificationBody }>, reply: FastifyReply) => {
    const row = dbCreateNotification(ctx.db, {
      formId:          req.body.formId,
      toEmail:         req.body.toEmail,
      subjectTemplate: req.body.subjectTemplate ?? 'Nuova submission: {form_name}',
      enabled:         req.body.enabled ?? true,
    })
    return reply.status(201).send(serializeNotification(row))
  })

  // ── PUT /notifications/:id ─────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: NotificationBody }>('/notifications/:id', {
    preHandler: auth,
    schema: { body: notificationBodySchema },
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: NotificationBody }>, reply: FastifyReply) => {
    const existing = dbGetNotification(ctx.db, req.params.id)
    if (!existing) return reply.status(404).send({ error: 'Notification not found' })

    const row = dbUpdateNotification(ctx.db, req.params.id, {
      formId:          req.body.formId,
      toEmail:         req.body.toEmail,
      subjectTemplate: req.body.subjectTemplate ?? 'Nuova submission: {form_name}',
      enabled:         req.body.enabled ?? true,
    })
    return serializeNotification(row!)
  })

  // ── DELETE /notifications/:id ──────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/notifications/:id', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const existing = dbGetNotification(ctx.db, req.params.id)
    if (!existing) return reply.status(404).send({ error: 'Notification not found' })

    dbDeleteNotification(ctx.db, req.params.id)
    return reply.status(204).send()
  })
}
