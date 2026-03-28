import type { FastifyPluginAsync } from 'fastify'
import { and, eq, like, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { vocabularies, terms, folioTerms, folios } from '../db/schema.js'
import { generateSlug } from '../codices/slug.js'
import type { VocabularyRegistry } from '../vocabularies/registry.js'
import '../types.js'

type Term = typeof terms.$inferSelect
type TermWithCount = Term & { postCount: number }

interface TermTree extends TermWithCount {
  children: TermTree[]
}

function buildTree(flat: TermWithCount[], parentId: number | null = null): TermTree[] {
  return flat
    .filter(t => t.parentId === parentId)
    .map(t => ({ ...t, children: buildTree(flat, t.id) }))
}

const termSelect = {
  id:           terms.id,
  vocabularyId: terms.vocabularyId,
  name:         terms.name,
  slug:         terms.slug,
  description:  terms.description,
  parentId:     terms.parentId,
  postCount:    sql<number>`cast(count(${folioTerms.folioId}) as integer)`,
}

function ensureUniqueTermSlug(
  db_: typeof db,
  vocabularyId: number,
  baseSlug: string,
  excludeId?: number,
): string {
  let candidate = baseSlug
  let counter = 2
  while (true) {
    const conds = [eq(terms.vocabularyId, vocabularyId), eq(terms.slug, candidate)]
    const existing = db_
      .select({ id: terms.id })
      .from(terms)
      .where(and(...conds))
      .limit(1)
      .all()
    const conflict = excludeId !== undefined
      ? existing.filter(r => r.id !== excludeId)
      : existing
    if (conflict.length === 0) return candidate
    candidate = `${baseSlug}-${counter++}`
  }
}

function getDescendantIds(db_: typeof db, termId: number): Set<number> {
  const result = new Set<number>()
  const queue = [termId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = db_
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.parentId, current))
      .all()
    for (const c of children) {
      result.add(c.id)
      queue.push(c.id)
    }
  }
  return result
}

interface VocabulariesPluginOptions {
  vocabularyRegistry: VocabularyRegistry
}

const vocabulariesRoutes: FastifyPluginAsync<VocabulariesPluginOptions> = async (fastify, opts) => {
  const { vocabularyRegistry } = opts

  // ── GET /vocabularies ────────────────────────────────────────────────────────
  fastify.get('/', async () => vocabularyRegistry.getAll())

  async function resolveVocabulary(slug: string) {
    const def = vocabularyRegistry.get(slug)
    if (!def) return null
    const row = db.select().from(vocabularies).where(eq(vocabularies.slug, slug)).get()
    if (!row) return null
    return { def, row }
  }

  // ── GET /vocabularies/:vocabularySlug/terms ───────────────────────────────────
  fastify.get<{
    Params:      { vocabularySlug: string }
    Querystring: { parent?: string; search?: string; page?: string; limit?: string; hierarchical?: string }
  }>('/:vocabularySlug/terms', {
    schema: {
      params:      { type: 'object', required: ['vocabularySlug'], properties: { vocabularySlug: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          parent:       { type: 'string' },
          search:       { type: 'string' },
          page:         { type: 'string' },
          limit:        { type: 'string' },
          hierarchical: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const voc = await resolveVocabulary(request.params.vocabularySlug)
    if (!voc) return reply.status(404).send({ error: 'Vocabulary not found' })

    const q = request.query
    const wantTree = q.hierarchical === 'true'
    const page   = Math.max(1, parseInt(q.page ?? '1', 10))
    const limit  = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10)))
    const offset = (page - 1) * limit

    const conditions = [eq(terms.vocabularyId, voc.row.id)]
    if (q.search) conditions.push(like(terms.name, `%${q.search}%`))
    if (q.parent !== undefined) {
      const parentId = parseInt(q.parent, 10)
      conditions.push(isNaN(parentId) || parentId === 0 ? isNull(terms.parentId) : eq(terms.parentId, parentId))
    }
    const where = and(...conditions)

    if (wantTree) {
      const all = db
        .select(termSelect)
        .from(terms)
        .leftJoin(folioTerms, eq(folioTerms.termId, terms.id))
        .where(eq(terms.vocabularyId, voc.row.id))
        .groupBy(terms.id)
        .all()
      return { data: buildTree(all) }
    }

    const data = db
      .select(termSelect)
      .from(terms)
      .leftJoin(folioTerms, eq(folioTerms.termId, terms.id))
      .where(where)
      .groupBy(terms.id)
      .limit(limit)
      .offset(offset)
      .all()
    const countRow = db.select({ count: sql<number>`count(*)` }).from(terms).where(where).get()
    return { data, total: countRow?.count ?? 0, page, limit }
  })

  // ── GET /vocabularies/:vocabularySlug/terms/:idOrSlug ────────────────────────
  fastify.get<{ Params: { vocabularySlug: string; idOrSlug: string } }>(
    '/:vocabularySlug/terms/:idOrSlug',
    {
      schema: {
        params: {
          type: 'object',
          required: ['vocabularySlug', 'idOrSlug'],
          properties: {
            vocabularySlug: { type: 'string' },
            idOrSlug:       { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const voc = await resolveVocabulary(request.params.vocabularySlug)
      if (!voc) return reply.status(404).send({ error: 'Vocabulary not found' })

      const { idOrSlug } = request.params
      const isId = /^\d+$/.test(idOrSlug)
      const condition = isId
        ? and(eq(terms.id, parseInt(idOrSlug, 10)), eq(terms.vocabularyId, voc.row.id))
        : and(eq(terms.slug, idOrSlug), eq(terms.vocabularyId, voc.row.id))

      const term = db.select().from(terms).where(condition).get()
      if (!term) return reply.status(404).send({ error: 'Term not found' })
      return term
    },
  )

  // ── POST /vocabularies/:vocabularySlug/terms ──────────────────────────────────
  fastify.post<{
    Params: { vocabularySlug: string }
    Body:   { name: string; slug?: string; description?: string; parentId?: number }
  }>('/:vocabularySlug/terms', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_terms')],
    schema: {
      params: { type: 'object', required: ['vocabularySlug'], properties: { vocabularySlug: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:        { type: 'string', minLength: 1 },
          slug:        { type: 'string' },
          description: { type: 'string' },
          parentId:    { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const voc = await resolveVocabulary(request.params.vocabularySlug)
    if (!voc) return reply.status(404).send({ error: 'Vocabulary not found' })

    const { name, slug: rawSlug, description = '', parentId } = request.body

    if (parentId !== undefined) {
      if (!voc.row.hierarchical) {
        return reply.status(422).send({ error: 'This vocabulary does not support hierarchical terms' })
      }
      const parent = db.select({ vocabularyId: terms.vocabularyId })
        .from(terms).where(eq(terms.id, parentId)).get()
      if (!parent || parent.vocabularyId !== voc.row.id) {
        return reply.status(422).send({ error: 'Parent term not found in this vocabulary' })
      }
    }

    const baseSlug  = rawSlug ? generateSlug(rawSlug) : generateSlug(name)
    const finalSlug = ensureUniqueTermSlug(db, voc.row.id, baseSlug)

    const [inserted] = db.insert(terms).values({
      vocabularyId: voc.row.id,
      name,
      slug:         finalSlug,
      description,
      parentId:     parentId ?? null,
    }).returning().all()

    return reply.status(201).send(inserted)
  })

  // ── PUT /vocabularies/:vocabularySlug/terms/:id ───────────────────────────────
  fastify.put<{
    Params: { vocabularySlug: string; id: string }
    Body:   { name?: string; slug?: string; description?: string; parentId?: number | null }
  }>('/:vocabularySlug/terms/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_terms')],
    schema: {
      params: {
        type: 'object',
        required: ['vocabularySlug', 'id'],
        properties: { vocabularySlug: { type: 'string' }, id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name:        { type: 'string', minLength: 1 },
          slug:        { type: 'string' },
          description: { type: 'string' },
          parentId:    { type: ['number', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const voc = await resolveVocabulary(request.params.vocabularySlug)
    if (!voc) return reply.status(404).send({ error: 'Vocabulary not found' })

    const termId  = parseInt(request.params.id, 10)
    const existing = db.select().from(terms)
      .where(and(eq(terms.id, termId), eq(terms.vocabularyId, voc.row.id))).get()
    if (!existing) return reply.status(404).send({ error: 'Term not found' })

    const { name, slug: rawSlug, description, parentId } = request.body

    if (parentId !== undefined && parentId !== null) {
      if (!voc.row.hierarchical) {
        return reply.status(422).send({ error: 'This vocabulary does not support hierarchical terms' })
      }
      const descendants = getDescendantIds(db, termId)
      if (parentId === termId || descendants.has(parentId)) {
        return reply.status(422).send({ error: 'Cannot set a descendant as parent (circular reference)' })
      }
      const parent = db.select({ vocabularyId: terms.vocabularyId })
        .from(terms).where(eq(terms.id, parentId)).get()
      if (!parent || parent.vocabularyId !== voc.row.id) {
        return reply.status(422).send({ error: 'Parent term not found in this vocabulary' })
      }
    }

    let finalSlug = existing.slug
    if (rawSlug !== undefined) {
      finalSlug = ensureUniqueTermSlug(db, voc.row.id, generateSlug(rawSlug), termId)
    } else if (name !== undefined && name !== existing.name) {
      finalSlug = ensureUniqueTermSlug(db, voc.row.id, generateSlug(name), termId)
    }

    const [updated] = db.update(terms).set({
      name:        name        ?? existing.name,
      slug:        finalSlug,
      description: description ?? existing.description,
      parentId:    parentId !== undefined ? parentId : existing.parentId,
    }).where(eq(terms.id, termId)).returning().all()

    return updated
  })

  // ── DELETE /vocabularies/:vocabularySlug/terms/:id ────────────────────────────
  fastify.delete<{
    Params:      { vocabularySlug: string; id: string }
    Querystring: { reassignChildren?: string }
  }>('/:vocabularySlug/terms/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_terms')],
    schema: {
      params: {
        type: 'object',
        required: ['vocabularySlug', 'id'],
        properties: { vocabularySlug: { type: 'string' }, id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { reassignChildren: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const voc = await resolveVocabulary(request.params.vocabularySlug)
    if (!voc) return reply.status(404).send({ error: 'Vocabulary not found' })

    const termId  = parseInt(request.params.id, 10)
    const existing = db.select({ id: terms.id })
      .from(terms)
      .where(and(eq(terms.id, termId), eq(terms.vocabularyId, voc.row.id)))
      .get()
    if (!existing) return reply.status(404).send({ error: 'Term not found' })

    const children = db.select({ id: terms.id }).from(terms).where(eq(terms.parentId, termId)).all()

    if (children.length > 0) {
      const { reassignChildren } = request.query
      if (!reassignChildren) {
        return reply.status(422).send({
          error: 'Term has children. Provide ?reassignChildren=<parentId> or 0 to move to root',
        })
      }
      const newParentId = parseInt(reassignChildren, 10) || null
      db.update(terms).set({ parentId: newParentId }).where(eq(terms.parentId, termId)).run()
    }

    db.delete(terms).where(eq(terms.id, termId)).run()
    return reply.status(204).send()
  })
}

// ─── Route /folios/:id/terms ──────────────────────────────────────────────────
// Gestione terms di un Folio specifico, separate per coesistere con folioRoutes.

interface FolioTermsPluginOptions {
  vocabularyRegistry: VocabularyRegistry
}

export const folioTermsRoutes: FastifyPluginAsync<FolioTermsPluginOptions> = async (fastify, opts) => {
  const { vocabularyRegistry: _voc } = opts   // disponibile per future validazioni

  // ── GET /:codex/:id/terms ─────────────────────────────────────────────────
  fastify.get<{ Params: { codex: string; id: string } }>('/:codex/:id/terms', {
    schema: {
      params: {
        type: 'object',
        required: ['codex', 'id'],
        properties: { codex: { type: 'string' }, id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const folioId = parseInt(request.params.id, 10)
    const folioExists = db.select({ id: folios.id }).from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.codex, request.params.codex)))
      .get()
    if (!folioExists) return reply.status(404).send({ error: 'Folio not found' })

    const rows = db
      .select({
        termId:         terms.id,
        termName:       terms.name,
        termSlug:       terms.slug,
        vocabularySlug: vocabularies.slug,
      })
      .from(folioTerms)
      .innerJoin(terms, eq(folioTerms.termId, terms.id))
      .innerJoin(vocabularies, eq(terms.vocabularyId, vocabularies.id))
      .where(eq(folioTerms.folioId, folioId))
      .all()

    const grouped: Record<string, Array<{ id: number; name: string; slug: string }>> = {}
    for (const row of rows) {
      const key = row.vocabularySlug
      if (!grouped[key]) grouped[key] = []
      grouped[key]!.push({ id: row.termId, name: row.termName, slug: row.termSlug })
    }
    return grouped
  })

  // ── PUT /:codex/:id/terms/:vocabularySlug ─────────────────────────────────
  fastify.put<{
    Params: { codex: string; id: string; vocabularySlug: string }
    Body:   { termIds: number[] }
  }>('/:codex/:id/terms/:vocabularySlug', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_folios')],
    schema: {
      params: {
        type: 'object',
        required: ['codex', 'id', 'vocabularySlug'],
        properties: {
          codex:          { type: 'string' },
          id:             { type: 'string' },
          vocabularySlug: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['termIds'],
        properties: { termIds: { type: 'array', items: { type: 'number' } } },
      },
    },
  }, async (request, reply) => {
    const folioId = parseInt(request.params.id, 10)
    const folioExists = db.select({ id: folios.id }).from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.codex, request.params.codex)))
      .get()
    if (!folioExists) return reply.status(404).send({ error: 'Folio not found' })

    const voc = db.select({ id: vocabularies.id })
      .from(vocabularies)
      .where(eq(vocabularies.slug, request.params.vocabularySlug))
      .get()
    if (!voc) return reply.status(404).send({ error: 'Vocabulary not found' })

    // Rimuovi i term di questa vocabulary dal folio
    const existingTermIds = db
      .select({ termId: folioTerms.termId })
      .from(folioTerms)
      .innerJoin(terms, eq(folioTerms.termId, terms.id))
      .where(and(eq(folioTerms.folioId, folioId), eq(terms.vocabularyId, voc.id)))
      .all()
      .map(r => r.termId)

    if (existingTermIds.length > 0) {
      for (const tid of existingTermIds) {
        db.delete(folioTerms)
          .where(and(eq(folioTerms.folioId, folioId), eq(folioTerms.termId, tid)))
          .run()
      }
    }

    if (request.body.termIds.length > 0) {
      db.insert(folioTerms)
        .values(request.body.termIds.map(tid => ({ folioId, termId: tid })))
        .run()
    }

    return reply.status(204).send()
  })
}

export default vocabulariesRoutes
