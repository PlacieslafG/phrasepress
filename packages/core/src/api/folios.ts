import type { FastifyPluginAsync } from 'fastify'
import { and, or, eq, lt, gt, lte, gte, like, sql, exists } from 'drizzle-orm'
import { db } from '../db/client.js'
import type { Tx } from '../db/client.js'
import {
  folios, folioFieldIndex, folioRevisions, folioTerms, terms, vocabularies,
} from '../db/schema.js'
import { generateSlug, ensureUniqueSlug } from '../codices/slug.js'
import type { CodexRegistry, FieldDefinition } from '../codices/registry.js'
import type { HookManager } from '../hooks/HookManager.js'
import '../types.js'

// ─── Tipi inferiti da Drizzle ────────────────────────────────────────────────

type Folio = typeof folios.$inferSelect

// ─── Helper: fetch folio con terms raggruppati per vocabulary ─────────────────

function fetchFolioWithTerms(folioId: number) {
  const folio = db.select().from(folios).where(eq(folios.id, folioId)).get()
  if (!folio) return null

  const termRows = db
    .select({
      termId:          terms.id,
      termName:        terms.name,
      termSlug:        terms.slug,
      vocabularyId:    vocabularies.id,
      vocabularySlug:  vocabularies.slug,
      vocabularyName:  vocabularies.name,
    })
    .from(folioTerms)
    .innerJoin(terms, eq(folioTerms.termId, terms.id))
    .innerJoin(vocabularies, eq(terms.vocabularyId, vocabularies.id))
    .where(eq(folioTerms.folioId, folioId))
    .all()

  return {
    ...folio,
    fields: JSON.parse(folio.fields) as Record<string, unknown>,
    terms:  termRows,
  }
}

// ─── Helper: sincronizza folio_field_index ───────────────────────────────────
// I campi di tipo 'slug' sono sempre indicizzati (queryable implicito).

function syncFieldIndex(
  tx: Tx,
  folioId: number,
  fields: Record<string, unknown>,
  blueprint: FieldDefinition[],
) {
  tx.delete(folioFieldIndex).where(eq(folioFieldIndex.folioId, folioId)).run()

  for (const def of blueprint) {
    const isAlwaysIndexed = def.type === 'slug'
    if (!def.queryable && !isAlwaysIndexed) continue

    const value = fields[def.name]
    if (value === undefined || value === null) continue

    const isNumeric = def.type === 'number'
    tx.insert(folioFieldIndex).values({
      folioId,
      fieldName:   def.name,
      stringValue: isNumeric ? null : String(value),
      numberValue: isNumeric ? Number(value) : null,
    }).run()
  }
}

// ─── Helper: crea revisione (chiamato PRIMA di aggiornare il folio) ──────────

function createRevision(tx: Tx, folio: Folio, authorId?: number) {
  tx.insert(folioRevisions).values({
    folioId:   folio.id,
    stage:     folio.stage,
    fields:    folio.fields,
    authorId:  authorId ?? folio.authorId,
    createdAt: Math.floor(Date.now() / 1000),
  }).run()
}

// ─── Helper: applica slug auto se blueprint ha campo tipo 'slug' ─────────────

function processSlugField(
  fields: Record<string, unknown>,
  blueprint: FieldDefinition[],
  codex: string,
  excludeId?: number,
): Record<string, unknown> {
  const result = { ...fields }

  for (const def of blueprint) {
    if (def.type !== 'slug') continue

    if (!result[def.name] && def.slugSource && result[def.slugSource]) {
      const base = generateSlug(String(result[def.slugSource]))
      result[def.name] = ensureUniqueSlug(db, codex, base, excludeId)
    } else if (result[def.name]) {
      const base = generateSlug(String(result[def.name]))
      result[def.name] = ensureUniqueSlug(db, codex, base, excludeId)
    }
  }

  return result
}

// ─── Plugin Fastify ──────────────────────────────────────────────────────────

interface FoliosPluginOptions {
  codexRegistry: CodexRegistry
  hooksManager?: HookManager
}

// Regex per riconoscere il formato ?fieldName[op]=value
const FIELD_FILTER_RE = /^([\w]+)\[(gt|gte|lt|lte|eq)\]$/

// Nomi di route riservati: NON devono essere intercettati come codex
const RESERVED_PATHS = new Set([
  'auth', 'users', 'roles', 'vocabularies', 'taxonomies',
  'plugins', 'codices', 'post-types', 'stats', 'media',
  'field-groups', 'fields', 'forms', 'i18n', 'mailer', 'db-monitor',
])

const folioRoutes: FastifyPluginAsync<FoliosPluginOptions> = async (fastify, opts) => {
  const { codexRegistry, hooksManager } = opts

  // ── GET /:codex ─────────────────────────────────────────────────────────────
  fastify.get<{
    Params:      { codex: string }
    Querystring: Record<string, string>
  }>('/:codex', {
    schema: {
      params:      { type: 'object', required: ['codex'], properties: { codex: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          stage:    { type: 'string' },
          page:     { type: 'string' },
          limit:    { type: 'string' },
          orderBy:  { type: 'string' },
          order:    { type: 'string', enum: ['asc', 'desc'] },
          search:   { type: 'string' },
          authorId: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo:   { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  }, async (request, reply) => {
    const { codex } = request.params

    if (RESERVED_PATHS.has(codex)) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (!codexRegistry.exists(codex)) {
      return reply.status(404).send({ error: `Codex '${codex}' not found` })
    }

    const q = request.query
    const stage      = q['stage'] ?? 'published'
    const page       = Math.max(1, parseInt(q['page'] ?? '1', 10))
    const limit      = Math.min(100, Math.max(1, parseInt(q['limit'] ?? '20', 10)))
    const offset     = (page - 1) * limit
    const orderField = q['orderBy'] ?? 'createdAt'
    const orderDir   = q['order'] ?? 'desc'

    const conditions = [eq(folios.codex, codex)]
    if (stage !== 'any') {
      conditions.push(eq(folios.stage, stage))
    }
    if (q['authorId']) {
      conditions.push(eq(folios.authorId, parseInt(q['authorId'], 10)))
    }
    if (q['dateFrom']) {
      conditions.push(gte(folios.createdAt, parseInt(q['dateFrom'], 10)))
    }
    if (q['dateTo']) {
      conditions.push(lte(folios.createdAt, parseInt(q['dateTo'], 10)))
    }

    // Ricerca full-text nel field index (stringa)
    if (q['search']) {
      const pattern = `%${q['search']}%`
      conditions.push(
        exists(
          db.select({ one: sql`1` })
            .from(folioFieldIndex)
            .where(and(
              eq(folioFieldIndex.folioId, folios.id),
              like(folioFieldIndex.stringValue, pattern),
            )),
        ),
      )
    }

    const codexDef  = codexRegistry.get(codex)!
    const blueprint = codexDef.blueprint ?? []

    // Analizza parametri extra: vocabulary term filters e field filters
    const termFilters: Record<string, string> = {}
    const fieldFilters: Array<{ name: string; op: string; value: string }> = []
    const reservedParams = new Set(['stage', 'page', 'limit', 'orderBy', 'order', 'search', 'authorId', 'dateFrom', 'dateTo'])

    for (const [key, value] of Object.entries(q)) {
      if (reservedParams.has(key)) continue
      const fieldMatch = FIELD_FILTER_RE.exec(key)
      if (fieldMatch) {
        fieldFilters.push({ name: fieldMatch[1]!, op: fieldMatch[2]!, value })
      } else {
        termFilters[key] = value
      }
    }

    // Filtri su vocabulary terms (EXISTS subquery)
    for (const [vocSlug, termSlug] of Object.entries(termFilters)) {
      conditions.push(
        exists(
          db.select({ one: sql`1` })
            .from(folioTerms)
            .innerJoin(terms, eq(folioTerms.termId, terms.id))
            .innerJoin(vocabularies, eq(terms.vocabularyId, vocabularies.id))
            .where(
              and(
                eq(folioTerms.folioId, folios.id),
                eq(vocabularies.slug, vocSlug),
                eq(terms.slug, termSlug),
              ),
            ),
        ),
      )
    }

    // Filtri su campi queryable (EXISTS subquery su folio_field_index)
    for (const { name, op, value } of fieldFilters) {
      const def = blueprint.find(f => f.name === name)
      const isNumeric = def?.type === 'number'
      const numVal = parseFloat(value)

      const colExpr  = isNumeric ? folioFieldIndex.numberValue : folioFieldIndex.stringValue
      const typedVal = isNumeric ? numVal : value

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- valore tipizzato runtime
      let cmp: ReturnType<typeof eq>
      if (op === 'eq')       cmp = eq(colExpr, typedVal as any)
      else if (op === 'lt')  cmp = lt(colExpr, typedVal as any)
      else if (op === 'lte') cmp = lte(colExpr, typedVal as any)
      else if (op === 'gt')  cmp = gt(colExpr, typedVal as any)
      else                   cmp = gte(colExpr, typedVal as any)

      conditions.push(
        exists(
          db.select({ one: sql`1` })
            .from(folioFieldIndex)
            .where(and(
              eq(folioFieldIndex.folioId, folios.id),
              eq(folioFieldIndex.fieldName, name),
              cmp,
            )),
        ),
      )
    }

    const where = and(...conditions)

    const orderCol = (() => {
      switch (orderField) {
        case 'updatedAt': return folios.updatedAt
        case 'stage':     return folios.stage
        default:          return folios.createdAt
      }
    })()

    const [data, countRow] = await Promise.all([
      db.select().from(folios)
        .where(where)
        .orderBy(orderDir === 'asc' ? sql`${orderCol} asc` : sql`${orderCol} desc`)
        .limit(limit)
        .offset(offset)
        .all(),
      db.select({ count: sql<number>`count(*)` }).from(folios).where(where).get(),
    ])

    return {
      data:  data.map(f => ({ ...f, fields: JSON.parse(f.fields) as Record<string, unknown> })),
      total: countRow?.count ?? 0,
      page,
      limit,
    }
  })

  // ── GET /:codex/:idOrSlug ───────────────────────────────────────────────────
  fastify.get<{
    Params: { codex: string; idOrSlug: string }
  }>('/:codex/:idOrSlug', {
    schema: {
      params: {
        type: 'object',
        properties: {
          codex:     { type: 'string' },
          idOrSlug:  { type: 'string' },
        },
        required: ['codex', 'idOrSlug'],
      },
    },
  }, async (request, reply) => {
    const { codex, idOrSlug } = request.params

    if (RESERVED_PATHS.has(codex)) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (!codexRegistry.exists(codex)) {
      return reply.status(404).send({ error: `Codex '${codex}' not found` })
    }

    const isId = /^\d+$/.test(idOrSlug)
    let folio: typeof folios.$inferSelect | undefined

    if (isId) {
      folio = db.select().from(folios)
        .where(and(eq(folios.id, parseInt(idOrSlug, 10)), eq(folios.codex, codex)))
        .get()
    } else {
      // Cerca per slug nel field index
      const slimRow = db
        .select({ id: folios.id })
        .from(folios)
        .innerJoin(folioFieldIndex, eq(folioFieldIndex.folioId, folios.id))
        .where(and(
          eq(folios.codex, codex),
          eq(folioFieldIndex.fieldName, 'slug'),
          eq(folioFieldIndex.stringValue, idOrSlug),
        ))
        .get()

      if (slimRow) {
        folio = db.select().from(folios).where(eq(folios.id, slimRow.id)).get()
      }
    }

    if (!folio) return reply.status(404).send({ error: 'Folio not found' })

    return fetchFolioWithTerms(folio.id)
  })

  // ── POST /:codex ─────────────────────────────────────────────────────────────
  fastify.post<{
    Params: { codex: string }
    Body: {
      fields?:  Record<string, unknown>
      stage?:   string
      termIds?: number[]
    }
  }>('/:codex', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_folios')],
    schema: {
      params: {
        type: 'object',
        required: ['codex'],
        properties: { codex: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          fields:  { type: 'object', additionalProperties: true },
          stage:   { type: 'string' },
          termIds: { type: 'array', items: { type: 'number' } },
        },
      },
    },
  }, async (request, reply) => {
    const { codex } = request.params

    if (RESERVED_PATHS.has(codex)) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (!codexRegistry.exists(codex)) {
      return reply.status(422).send({ error: `Codex '${codex}' is not registered` })
    }

    const codexDef  = codexRegistry.get(codex)!
    const blueprint = codexDef.blueprint ?? []
    const { fields = {}, termIds = [] } = request.body
    const stage    = request.body.stage ?? codexRegistry.getDefaultStage(codex)
    const authorId = request.userId

    // Valida campi required
    for (const def of blueprint) {
      if (def.required && (fields[def.name] === undefined || fields[def.name] === null)) {
        return reply.status(422).send({ error: `Field '${def.name}' is required`, field: def.name })
      }
    }

    const processedFields = processSlugField(fields, blueprint, codex)
    const now = Math.floor(Date.now() / 1000)

    const inserted = db.transaction((tx) => {
      const [folio] = tx.insert(folios).values({
        codex,
        stage,
        fields:    JSON.stringify(processedFields),
        authorId,
        createdAt: now,
        updatedAt: now,
      }).returning().all()

      if (!folio) throw new Error('Failed to insert folio')

      syncFieldIndex(tx, folio.id, processedFields, blueprint)

      if (termIds.length > 0) {
        tx.insert(folioTerms).values(termIds.map(tid => ({ folioId: folio.id, termId: tid }))).run()
      }

      createRevision(tx, folio, authorId)

      return folio
    })

    return reply.status(201).send(fetchFolioWithTerms(inserted.id))
  })

  // ── PUT /:codex/:id ──────────────────────────────────────────────────────────
  fastify.put<{
    Params: { codex: string; id: string }
    Body: {
      fields?:  Record<string, unknown>
      stage?:   string
      termIds?: number[]
    }
  }>('/:codex/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_folios')],
    schema: {
      params: {
        type: 'object',
        required: ['codex', 'id'],
        properties: {
          codex: { type: 'string' },
          id:    { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          fields:  { type: 'object', additionalProperties: true },
          stage:   { type: 'string' },
          termIds: { type: 'array', items: { type: 'number' } },
        },
      },
    },
  }, async (request, reply) => {
    const { codex } = request.params
    const folioId   = parseInt(request.params.id, 10)

    const existing = db.select().from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.codex, codex)))
      .get()
    if (!existing) return reply.status(404).send({ error: 'Folio not found' })

    if (existing.authorId !== request.userId && !request.userCapabilities.includes('edit_others_folios')) {
      return reply.status(403).send({ error: 'Insufficient permissions to edit this folio' })
    }

    const codexDef  = codexRegistry.get(codex)
    const blueprint = codexDef?.blueprint ?? []

    const { fields, stage, termIds } = request.body
    const updatedFields = fields !== undefined
      ? fields
      : JSON.parse(existing.fields) as Record<string, unknown>

    const processedFields = processSlugField(updatedFields, blueprint, codex, folioId)
    const authorId = request.userId

    db.transaction((tx) => {
      // Snapshot PRIMA di aggiornare
      createRevision(tx, existing, authorId)

      tx.update(folios).set({
        stage:     stage ?? existing.stage,
        fields:    JSON.stringify(processedFields),
        updatedAt: Math.floor(Date.now() / 1000),
      }).where(eq(folios.id, folioId)).run()

      syncFieldIndex(tx, folioId, processedFields, blueprint)

      if (termIds !== undefined) {
        tx.delete(folioTerms).where(eq(folioTerms.folioId, folioId)).run()
        if (termIds.length > 0) {
          tx.insert(folioTerms).values(termIds.map(tid => ({ folioId, termId: tid }))).run()
        }
      }
    })

    await hooksManager?.doAction('folio.updated', folioId)
    return fetchFolioWithTerms(folioId)
  })

  // ── DELETE /:codex/:id ───────────────────────────────────────────────────────
  fastify.delete<{
    Params:      { codex: string; id: string }
    Querystring: { force?: string }
  }>('/:codex/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('delete_folios')],
    schema: {
      params: {
        type: 'object',
        required: ['codex', 'id'],
        properties: {
          codex: { type: 'string' },
          id:    { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: { force: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { codex } = request.params
    const folioId   = parseInt(request.params.id, 10)
    const force     = request.query.force === 'true'

    const existing = db.select().from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.codex, codex)))
      .get()
    if (!existing) return reply.status(404).send({ error: 'Folio not found' })

    if (existing.authorId !== request.userId && !request.userCapabilities.includes('delete_others_folios')) {
      return reply.status(403).send({ error: 'Insufficient permissions to delete this folio' })
    }

    if (force) {
      db.delete(folios).where(eq(folios.id, folioId)).run()
      await hooksManager?.doAction('folio.deleted', folioId)
    } else {
      // Soft delete: sposta in stage 'trash'
      db.update(folios).set({
        stage:     'trash',
        updatedAt: Math.floor(Date.now() / 1000),
      }).where(eq(folios.id, folioId)).run()
    }

    return reply.status(204).send()
  })

  // ── GET /:codex/:id/revisions ─────────────────────────────────────────────────
  fastify.get<{ Params: { codex: string; id: string } }>('/:codex/:id/revisions', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['codex', 'id'],
        properties: {
          codex: { type: 'string' },
          id:    { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { codex } = request.params
    const folioId   = parseInt(request.params.id, 10)

    const existing = db.select().from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.codex, codex)))
      .get()
    if (!existing) return reply.status(404).send({ error: 'Folio not found' })

    return db.select().from(folioRevisions)
      .where(eq(folioRevisions.folioId, folioId))
      .orderBy(sql`${folioRevisions.createdAt} desc`)
      .all()
  })

  // ── POST /:codex/:id/revisions/:revId/restore ─────────────────────────────────
  fastify.post<{ Params: { codex: string; id: string; revId: string } }>(
    '/:codex/:id/revisions/:revId/restore',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('edit_folios')],
      schema: {
        params: {
          type: 'object',
          required: ['codex', 'id', 'revId'],
          properties: {
            codex:  { type: 'string' },
            id:     { type: 'string' },
            revId:  { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { codex } = request.params
      const folioId   = parseInt(request.params.id, 10)
      const revId     = parseInt(request.params.revId, 10)

      const existing = db.select().from(folios)
        .where(and(eq(folios.id, folioId), eq(folios.codex, codex)))
        .get()
      if (!existing) return reply.status(404).send({ error: 'Folio not found' })

      const revision = db.select().from(folioRevisions)
        .where(and(eq(folioRevisions.id, revId), eq(folioRevisions.folioId, folioId)))
        .get()
      if (!revision) return reply.status(404).send({ error: 'Revision not found' })

      const codexDef  = codexRegistry.get(codex)
      const blueprint = codexDef?.blueprint ?? []
      const fields    = JSON.parse(revision.fields) as Record<string, unknown>
      const authorId  = request.userId

      db.transaction((tx) => {
        createRevision(tx, existing, authorId)

        tx.update(folios).set({
          stage:     revision.stage,
          fields:    revision.fields,
          updatedAt: Math.floor(Date.now() / 1000),
        }).where(eq(folios.id, folioId)).run()

        syncFieldIndex(tx, folioId, fields, blueprint)
      })

      return fetchFolioWithTerms(folioId)
    },
  )
}

export default folioRoutes
