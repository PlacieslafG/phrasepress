import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import { generateSlug } from '@phrasepress/core'
import {
  dbListLocales, dbGetLocale, dbCreateLocale, dbUpdateLocale, dbDeleteLocale,
  dbListTranslations, dbGetTranslation, dbUpsertTranslation, dbDeleteTranslation,
  dbGetConfig, dbUpsertConfig,
  serializeLocale, serializeTranslation, serializeConfig,
  ensureUniqueTranslationSlug,
} from './db.js'
import { translateText, translateFields, testConnection, TranslatorError, type TranslatorConfig } from './translator.js'

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

// Recupera il post sorgente dal DB direttamente (senza pattern Fastify inject)
function getSourcePost(ctx: PluginContext, postId: number) {
  // Accediamo direttamente al DB del core tramite il context
  const { db } = ctx
  const raw = (db as unknown as { $client: { prepare(s: string): { get(id: number): unknown } } })
    .$client.prepare('SELECT * FROM posts WHERE id = ?').get(postId) as null | {
    id: number; post_type: string; title: string; content: string; fields: string; status: string
  }
  return raw ? {
    id:       raw.id,
    postType: raw.post_type,
    title:    raw.title,
    content:  raw.content,
    fields:   JSON.parse(raw.fields) as Record<string, unknown>,
    status:   raw.status,
  } : null
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

  // ── GET /posts/:postId/translations ──────────────────────────────────────
  app.get<{ Params: { postId: string } }>('/posts/:postId/translations', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })
    return dbListTranslations(ctx.db, postId).map(serializeTranslation)
  })

  // ── GET /posts/:postId/translations/:locale ───────────────────────────────
  app.get<{ Params: { postId: string; locale: string } }>('/posts/:postId/translations/:locale', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { postId: string; locale: string } }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })
    const translation = dbGetTranslation(ctx.db, postId, req.params.locale)
    if (!translation) return reply.status(404).send({ error: 'Translation not found' })
    return serializeTranslation(translation)
  })

  // ── PUT /posts/:postId/translations/:locale — crea o aggiorna ────────────
  app.put<{
    Params: { postId: string; locale: string }
    Body: {
      title:   string
      slug?:   string
      content?: string
      fields?:  Record<string, unknown>
      status?:  string
    }
  }>('/posts/:postId/translations/:locale', {
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
    Params: { postId: string; locale: string }
    Body: { title: string; slug?: string; content?: string; fields?: Record<string, unknown>; status?: string }
  }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })

    const locale = req.params.locale
    if (!dbGetLocale(ctx.db, locale)) {
      return reply.status(422).send({ error: `Locale '${locale}' is not registered` })
    }

    // Calcola slug unico per questo locale
    const existingTranslation = dbGetTranslation(ctx.db, postId, locale)
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
      postId,
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

  // ── DELETE /posts/:postId/translations/:locale ────────────────────────────
  app.delete<{ Params: { postId: string; locale: string } }>('/posts/:postId/translations/:locale', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { postId: string; locale: string } }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })
    dbDeleteTranslation(ctx.db, postId, req.params.locale)
    return reply.status(204).send()
  })

  // ── POST /posts/:postId/translate/:locale — auto-traduzione LLM ──────────
  app.post<{ Params: { postId: string; locale: string } }>('/posts/:postId/translate/:locale', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { postId: string; locale: string } }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })

    const locale = req.params.locale
    if (!dbGetLocale(ctx.db, locale)) {
      return reply.status(422).send({ error: `Locale '${locale}' is not registered` })
    }

    const post = getSourcePost(ctx, postId)
    if (!post) return reply.status(404).send({ error: 'Post not found' })

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

      // Recupera field definitions per sapere quali campi tradurre
      const fieldDefs = ctx.postTypes.get(post.postType)?.fields ?? []
      const translatedFields = await translateFields(config, post.fields, fieldDefs, locale)

      const existingTranslation = dbGetTranslation(ctx.db, postId, locale)
      const baseSlug  = generateSlug(translatedTitle)
      const finalSlug = ensureUniqueTranslationSlug(ctx.db, locale, baseSlug, existingTranslation?.id)

      const row = dbUpsertTranslation(ctx.db, {
        postId,
        locale,
        title:   translatedTitle,
        slug:    finalSlug,
        content: translatedContent,
        fields:  translatedFields,
        status:  post.status,
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

  // ── POST /posts/:postId/translate-all — traduce verso tutte le lingue ─────
  app.post<{ Params: { postId: string } }>('/posts/:postId/translate-all', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })

    const post = getSourcePost(ctx, postId)
    if (!post) return reply.status(404).send({ error: 'Post not found' })

    const config = getTranslatorConfig(ctx)
    if (!config.baseUrl || !config.model || !config.sourceLocale) {
      return reply.status(422).send({ error: 'LLM translator not fully configured.' })
    }

    const locales = dbListLocales(ctx.db).filter(l => l.code !== config.sourceLocale)
    const results = []

    for (const localeRow of locales) {
      try {
        const [translatedTitle, translatedContent] = await Promise.all([
          translateText(config, post.title,   localeRow.code),
          translateText(config, post.content, localeRow.code, true),
        ])
        const fieldDefs = ctx.postTypes.get(post.postType)?.fields ?? []
        const translatedFields = await translateFields(config, post.fields, fieldDefs, localeRow.code)

        const existing  = dbGetTranslation(ctx.db, postId, localeRow.code)
        const baseSlug  = generateSlug(translatedTitle)
        const finalSlug = ensureUniqueTranslationSlug(ctx.db, localeRow.code, baseSlug, existing?.id)

        const row = dbUpsertTranslation(ctx.db, {
          postId,
          locale:  localeRow.code,
          title:   translatedTitle,
          slug:    finalSlug,
          content: translatedContent,
          fields:  translatedFields,
          status:  post.status,
          isDirty: false,
        })
        results.push({ locale: localeRow.code, ok: true, translation: serializeTranslation(row) })
      } catch (err) {
        results.push({
          locale: localeRow.code,
          ok:     false,
          error:  err instanceof TranslatorError ? err.message : String(err),
        })
      }
    }

    return results
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

  // ── GET /public/posts/:postId/:locale — API pubblica (no auth) ───────────
  app.get<{ Params: { postId: string; locale: string } }>('/public/posts/:postId/:locale', {
  }, async (req: FastifyRequest<{ Params: { postId: string; locale: string } }>, reply: FastifyReply) => {
    const postId = parseInt(req.params.postId, 10)
    if (isNaN(postId)) return reply.status(400).send({ error: 'Invalid postId' })

    const translation = dbGetTranslation(ctx.db, postId, req.params.locale)
    if (!translation) return reply.status(404).send({ error: 'Translation not found' })
    return serializeTranslation(translation)
  })
}
