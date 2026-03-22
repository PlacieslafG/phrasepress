import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import type { FormField } from './db.js'
import {
  dbListForms, dbGetForm, dbCreateForm, dbUpdateForm, dbDeleteForm,
  dbListSubmissions, dbDeleteSubmission,
  serializeForm, serializeSubmission,
} from './db.js'

// ─── Schema validation ────────────────────────────────────────────────────────

const formFieldSchema = {
  type: 'object',
  required: ['id', 'name', 'label', 'type', 'required', 'sortOrder'],
  properties: {
    id:          { type: 'string' },
    name:        { type: 'string', minLength: 1 },
    label:       { type: 'string', minLength: 1 },
    type:        { type: 'string', enum: ['text', 'email', 'textarea', 'number', 'select', 'checkbox', 'date'] },
    required:    { type: 'boolean' },
    placeholder: { type: 'string' },
    options:     { type: 'array', items: { type: 'string' } },
    sortOrder:   { type: 'number' },
  },
}

const formBodySchema = {
  type: 'object',
  required: ['name', 'slug'],
  properties: {
    name:        { type: 'string', minLength: 1 },
    slug:        { type: 'string', minLength: 1, pattern: '^[a-z0-9-]+$' },
    description: { type: 'string' },
    fields:      { type: 'array', items: formFieldSchema },
    status:      { type: 'string', enum: ['active', 'inactive'] },
  },
}

type FormBody = {
  name:        string
  slug:        string
  description?: string
  fields?:     FormField[]
  status?:     'active' | 'inactive'
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerAdminRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const auth = [ctx.fastify.authenticate, ctx.fastify.requireCapability('manage_plugins')]

  // ── GET /forms — lista form ────────────────────────────────────────────────
  app.get('/forms', { preHandler: auth }, async () => {
    return dbListForms(ctx.db).map(serializeForm)
  })

  // ── POST /forms — crea form ────────────────────────────────────────────────
  app.post<{ Body: FormBody }>('/forms', {
    preHandler: auth,
    schema: { body: formBodySchema },
  }, async (req: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply) => {
    // Verifica slug univoco
    const existing = dbGetForm(ctx.db, req.body.slug)
    if (existing) {
      return reply.status(422).send({ error: 'Slug already exists', field: 'slug' })
    }

    const row = dbCreateForm(ctx.db, {
      name:        req.body.name,
      slug:        req.body.slug,
      description: req.body.description ?? '',
      fields:      req.body.fields ?? [],
      status:      req.body.status ?? 'active',
    })
    return reply.status(201).send(serializeForm(row))
  })

  // ── GET /forms/:id — dettaglio form ───────────────────────────────────────
  app.get<{ Params: { id: string } }>('/forms/:id', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const form = dbGetForm(ctx.db, req.params.id)
    if (!form) return reply.status(404).send({ error: 'Form not found' })
    return serializeForm(form)
  })

  // ── PUT /forms/:id — aggiorna form ────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: FormBody }>('/forms/:id', {
    preHandler: auth,
    schema: { body: formBodySchema },
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: FormBody }>, reply: FastifyReply) => {
    const existing = dbGetForm(ctx.db, req.params.id)
    if (!existing) return reply.status(404).send({ error: 'Form not found' })

    const row = dbUpdateForm(ctx.db, req.params.id, {
      name:        req.body.name,
      slug:        req.body.slug,
      description: req.body.description ?? '',
      fields:      req.body.fields ?? [],
      status:      req.body.status ?? 'active',
    })
    return serializeForm(row!)
  })

  // ── DELETE /forms/:id — elimina form e tutte le submission ────────────────
  app.delete<{ Params: { id: string } }>('/forms/:id', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const existing = dbGetForm(ctx.db, req.params.id)
    if (!existing) return reply.status(404).send({ error: 'Form not found' })

    dbDeleteForm(ctx.db, req.params.id)
    return reply.status(204).send()
  })

  // ── GET /forms/:id/submissions — lista submission di un form ──────────────
  app.get<{
    Params: { id: string }
    Querystring: { page?: string; limit?: string }
  }>('/forms/:id/submissions', {
    preHandler: auth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>, reply: FastifyReply) => {
    const form = dbGetForm(ctx.db, req.params.id)
    if (!form) return reply.status(404).send({ error: 'Form not found' })

    const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10))
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)))

    const { rows, total } = dbListSubmissions(ctx.db, req.params.id, page, limit)
    return {
      data:  rows.map(serializeSubmission),
      total,
      page,
      limit,
    }
  })

  // ── DELETE /submissions/:id — elimina una singola submission ──────────────
  app.delete<{ Params: { id: string } }>('/submissions/:id', {
    preHandler: auth,
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    dbDeleteSubmission(ctx.db, req.params.id)
    return reply.status(204).send()
  })
}
