import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import {
  dbListLocales, dbGetLocale, dbCreateLocale, dbUpdateLocale, dbDeleteLocale,
  dbListTranslations, dbGetTranslation, dbUpsertTranslation, dbDeleteTranslation,
  dbGetConfig, dbUpsertConfig,
  serializeLocale, serializeTranslation, serializeConfig,
  ensureUniqueTranslationSlug,
  type LocaleRow,
} from './db.js'
import { translateText, translateFields, testConnection, pingServer, TranslatorError, type TranslatorConfig } from './translator.js'

// Inlined to avoid a runtime import of @phrasepress/core (no dist/ in dev)
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTranslatorConfig(ctx: PluginContext): TranslatorConfig {
  const cfg = dbGetConfig(ctx.db)
  return {
    baseUrl:        cfg.baseUrl,
    model:          cfg.model,
    apiKey:         cfg.apiKey || undefined,
    promptTemplate: cfg.promptTemplate || undefined,
    sourceLocale:   cfg.sourceLocale,
  }
}

// Recupera il folio sorgente dal DB direttamente (senza pattern Fastify inject)
function getSourcePost(ctx: PluginContext, folioId: number) {
  const { db } = ctx
  const raw = (db as unknown as { $client: { prepare(s: string): { get(id: number): unknown } } })
    .$client.prepare('SELECT * FROM folios WHERE id = ?').get(folioId) as null | {
    id: number; codex: string; stage: string; fields: string
  }
  if (!raw) return null
  const fields = JSON.parse(raw.fields) as Record<string, unknown>
  return {
    id:      raw.id,
    codex:   raw.codex,
    title:   (fields['title'] as string) ?? '',
    content: (fields['content'] as string) ?? '',
    fields,
    stage:   raw.stage,
  }
}

// Recupera i field defs completi passando per il filtro codices.meta.
// Necessario per includere i campi definiti tramite il fields plugin (non solo quelli statici del registry).
async function getFieldDefs(
  ctx: PluginContext,
  codex: string,
): Promise<Array<{ name: string; type: string; fieldOptions?: Record<string, unknown> }>> {
  const base = ctx.codices.getAll()
  const filtered = await ctx.hooks.applyFilters('codices.meta', base) as Array<{ name: string; blueprint?: Array<{ name: string; type: string; fieldOptions?: Record<string, unknown> }> }>
  return filtered.find(cx => cx.name === codex)?.blueprint ?? []
}

// ─── Background translation jobs ────────────────────────────────────────────

export interface TranslateAllJob {
  status:    'running' | 'done'
  total:     number
  completed: number
  failed:    number
  createdAt: number
}

const jobs = new Map<string, TranslateAllJob>()

function pruneJobs(): void {
  const cutoff = Date.now() - 3_600_000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}

async function runTranslateAll(
  ctx:     PluginContext,
  jobId:   string,
  folioId: number,
  post:    { id: number; codex: string; title: string; content: string; fields: Record<string, unknown>; stage: string },
  config:  TranslatorConfig,
  locales: LocaleRow[],
): Promise<void> {
  const job = jobs.get(jobId)!
  for (const localeRow of locales) {
    try {
      const [translatedTitle, translatedContent] = await Promise.all([
        translateText(config, post.title,   localeRow.code),
        translateText(config, post.content, localeRow.code, true),
      ])
      const fieldDefs = await getFieldDefs(ctx, post.codex)
      const translatedFields = await translateFields(config, post.fields, fieldDefs, localeRow.code)
      const existing  = dbGetTranslation(ctx.db, folioId, localeRow.code)
      const baseSlug  = generateSlug(translatedTitle)
      const finalSlug = ensureUniqueTranslationSlug(ctx.db, localeRow.code, baseSlug, existing?.id)
      dbUpsertTranslation(ctx.db, {
        folioId, locale: localeRow.code, title: translatedTitle, slug: finalSlug,
        content: translatedContent, fields: translatedFields, status: post.stage, isDirty: false,
      })
      job.completed++
    } catch {
      job.failed++
    }
  }
  job.status = 'done'
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerI18nRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const auth = [ctx.fastify.authenticate, ctx.fastify.requireCapability('manage_plugins')]

  // ── GET /locales ─────────────────────────────────────────────────────────
  app.get('/locales', { preHandler: auth }, async () => {
    return dbListLocales(ctx.db).map(serializeLocale)
  })

  // ── POST /locales ────────────────────────────────────────────────────────
  app.post<{ Body: { code: string; label: string; isDefault?: boolean } }>('/locales', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        required: ['code', 'label'],
        properties: {
          code:      { type: 'string', minLength: 2, maxLength: 10, pattern: '^[a-zA-Z_-]+$' },
          label:     { type: 'string', minLength: 1 },
          isDefault: { type: 'boolean' },
        },
      },
    },
  }, async (req: FastifyRequest<{ Body: { code: string; label: string; isDefault?: boolean } }>, reply: FastifyReply) => {
    if (dbGetLocale(ctx.db, req.body.code)) {
      return reply.status(422).send({ error: 'Locale already exists', field: 'code' })
    }
    const locale = dbCreateLocale(ctx.db, {
      code:      req.body.code,
      label:     req.body.label,
      isDefault: req.body.isDefault ?? false,
    })
    return reply.status(201).send(serializeLocale(locale))
  })

  // ── PATCH /locales/:code — aggiorna label / isDefault ────────────────────
  app.patch<{
    Params: { code: string }
    Body: { label?: string; isDefault?: boolean }
  }>('/locales/:code', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        properties: {
          label:     { type: 'string', minLength: 1 },
          isDefault: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    if (!dbGetLocale(ctx.db, req.params.code)) {
      return reply.status(404).send({ error: 'Locale not found' })
    }
    const updated = dbUpdateLocale(ctx.db, req.params.code, req.body)
    return serializeLocale(updated!)
  })

  // ── DELETE /locales/:code ────────────────────────────────────────────────
  app.delete<{ Params: { code: string } }>('/locales/:code', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    if (!dbGetLocale(ctx.db, req.params.code)) {
      return reply.status(404).send({ error: 'Locale not found' })
    }
    dbDeleteLocale(ctx.db, req.params.code)
    return reply.status(204).send()
  })

  // ── GET /folios/:folioId/translations ──────────────────────────────────────
  app.get<{ Params: { folioId: string } }>('/folios/:folioId/translations', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { folioId: string } }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })
    return dbListTranslations(ctx.db, folioId).map(serializeTranslation)
  })

  // ── GET /folios/:folioId/translations/:locale ───────────────────────────────
  app.get<{ Params: { folioId: string; locale: string } }>('/folios/:folioId/translations/:locale', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { folioId: string; locale: string } }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })
    const translation = dbGetTranslation(ctx.db, folioId, req.params.locale)
    if (!translation) return reply.status(404).send({ error: 'Translation not found' })
    return serializeTranslation(translation)
  })

  // ── PUT /folios/:folioId/translations/:locale — crea o aggiorna ────────────
  app.put<{
    Params: { folioId: string; locale: string }
    Body: {
      title:   string
      slug?:   string
      content?: string
      fields?:  Record<string, unknown>
      status?:  string
    }
  }>('/folios/:folioId/translations/:locale', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title:   { type: 'string', minLength: 1 },
          slug:    { type: 'string' },
          content: { type: 'string' },
          fields:  { type: 'object' },
          status:  { type: 'string', enum: ['draft', 'published', 'trash'] },
        },
      },
    },
  }, async (req: FastifyRequest<{
    Params: { folioId: string; locale: string }
    Body: { title: string; slug?: string; content?: string; fields?: Record<string, unknown>; status?: string }
  }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })

    const locale = req.params.locale
    if (!dbGetLocale(ctx.db, locale)) {
      return reply.status(422).send({ error: `Locale '${locale}' is not registered` })
    }

    // Calcola slug unico per questo locale
    const existingTranslation = dbGetTranslation(ctx.db, folioId, locale)
    const baseSlug = req.body.slug
      ? generateSlug(req.body.slug)
      : generateSlug(req.body.title)
    const finalSlug = ensureUniqueTranslationSlug(
      ctx.db,
      locale,
      baseSlug,
      existingTranslation?.id,
    )

    const row = dbUpsertTranslation(ctx.db, {
      folioId,
      locale,
      title:   req.body.title,
      slug:    finalSlug,
      content: req.body.content ?? '',
      fields:  req.body.fields  ?? {},
      status:  req.body.status  ?? 'draft',
      isDirty: false,
    })
    return serializeTranslation(row)
  })

  // ── DELETE /folios/:folioId/translations/:locale ────────────────────────────
  app.delete<{ Params: { folioId: string; locale: string } }>('/folios/:folioId/translations/:locale', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { folioId: string; locale: string } }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })
    dbDeleteTranslation(ctx.db, folioId, req.params.locale)
    return reply.status(204).send()
  })

  // ── POST /folios/:folioId/translate/:locale — auto-traduzione LLM ──────────
  app.post<{ Params: { folioId: string; locale: string } }>('/folios/:folioId/translate/:locale', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { folioId: string; locale: string } }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })

    const locale = req.params.locale
    if (!dbGetLocale(ctx.db, locale)) {
      return reply.status(422).send({ error: `Locale '${locale}' is not registered` })
    }

    const post = getSourcePost(ctx, folioId)
    if (!post) return reply.status(404).send({ error: 'Folio not found' })

    const config = getTranslatorConfig(ctx)
    if (!config.baseUrl || !config.model) {
      return reply.status(422).send({ error: 'LLM translator not configured. Set baseUrl and model in i18n settings.' })
    }
    if (!config.sourceLocale) {
      return reply.status(422).send({ error: 'Source locale not configured in i18n settings.' })
    }

    try {
      const [translatedTitle, translatedContent] = await Promise.all([
        translateText(config, post.title,   locale),
        translateText(config, post.content, locale, true),
      ])

      // Recupera field definitions tramite il filtro hook per includere i campi del fields plugin
      const fieldDefs = await getFieldDefs(ctx, post.codex)
      const translatedFields = await translateFields(config, post.fields, fieldDefs, locale)

      const existingTranslation = dbGetTranslation(ctx.db, folioId, locale)
      const baseSlug  = generateSlug(translatedTitle)
      const finalSlug = ensureUniqueTranslationSlug(ctx.db, locale, baseSlug, existingTranslation?.id)

      const row = dbUpsertTranslation(ctx.db, {
        folioId,
        locale,
        title:   translatedTitle,
        slug:    finalSlug,
        content: translatedContent,
        fields:  translatedFields,
        status:  post.stage,
        isDirty: false,
      })
      return serializeTranslation(row)
    } catch (err) {
      if (err instanceof TranslatorError) {
        return reply.status(502).send({ error: err.message })
      }
      throw err
    }
  })

  // ── POST /folios/:folioId/translate-all — avvia traduzione asincrona ────────
  app.post<{ Params: { folioId: string } }>('/folios/:folioId/translate-all', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { folioId: string } }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })

    const post = getSourcePost(ctx, folioId)
    if (!post) return reply.status(404).send({ error: 'Folio not found' })

    const config = getTranslatorConfig(ctx)
    if (!config.baseUrl || !config.model || !config.sourceLocale) {
      return reply.status(422).send({ error: 'LLM translator not fully configured.' })
    }

    const locales = dbListLocales(ctx.db).filter(l => l.code !== config.sourceLocale)

    pruneJobs()
    const jobId = randomUUID()
    jobs.set(jobId, { status: 'running', total: locales.length, completed: 0, failed: 0, createdAt: Date.now() })

    // Avvia in background — non blocca la risposta HTTP
    void runTranslateAll(ctx, jobId, folioId, post, config, locales)

    return reply.status(202).send({ jobId, total: locales.length })
  })

  // ── GET /jobs/:jobId — stato di un job di traduzione ─────────────────────
  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const job = jobs.get(req.params.jobId)
    if (!job) return reply.status(404).send({ error: 'Job not found or expired' })
    return job
  })

  // ── GET /settings ────────────────────────────────────────────────────────
  app.get('/settings', { preHandler: auth }, async () => {
    return serializeConfig(dbGetConfig(ctx.db))
  })

  // ── PUT /settings ────────────────────────────────────────────────────────
  app.put<{
    Body: {
      baseUrl?:        string
      model?:          string
      apiKey?:         string
      promptTemplate?: string
      sourceLocale?:   string
    }
  }>('/settings', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        properties: {
          baseUrl:        { type: 'string' },
          model:          { type: 'string' },
          apiKey:         { type: 'string' },
          promptTemplate: { type: 'string' },
          sourceLocale:   { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest<{
    Body: { baseUrl?: string; model?: string; apiKey?: string; promptTemplate?: string; sourceLocale?: string }
  }>) => {
    const updated = dbUpsertConfig(ctx.db, req.body)
    return serializeConfig(updated)
  })

  // ── POST /settings/test — verifica connessione LLM ───────────────────────
  app.post('/settings/test', { preHandler: auth }, async (_req, reply) => {
    const config = getTranslatorConfig(ctx)
    const result = await testConnection(config)
    if (!result.ok) {
      return reply.status(502).send({ error: result.message })
    }
    return { message: result.message }
  })

  // ── GET /settings/ping — ping rapido senza inferenza LLM ─────────────────
  app.get('/settings/ping', { preHandler: auth }, async (_req, reply) => {
    const config = getTranslatorConfig(ctx)
    const result = await pingServer(config)
    if (!result.ok) {
      return reply.status(502).send({ error: result.message })
    }
    return { message: result.message }
  })

  // ── GET /public/folios/:folioId/:locale — API pubblica (no auth) ───────────
  app.get<{ Params: { folioId: string; locale: string } }>('/public/folios/:folioId/:locale', {
  }, async (req: FastifyRequest<{ Params: { folioId: string; locale: string } }>, reply: FastifyReply) => {
    const folioId = parseInt(req.params.folioId, 10)
    if (isNaN(folioId)) return reply.status(400).send({ error: 'Invalid folioId' })

    const translation = dbGetTranslation(ctx.db, folioId, req.params.locale)
    if (!translation) return reply.status(404).send({ error: 'Translation not found' })
    return serializeTranslation(translation)
  })
}
