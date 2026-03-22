import type { FastifyPluginAsync } from 'fastify'
import { and, eq, like, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { taxonomies, terms, postTerms, posts } from '../db/schema.js'
import { generateSlug } from '../post-types/slug.js'
import type { TaxonomyRegistry } from '../taxonomies/registry.js'
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
  id:          terms.id,
  taxonomyId:  terms.taxonomyId,
  name:        terms.name,
  slug:        terms.slug,
  description: terms.description,
  parentId:    terms.parentId,
  postCount:   sql<number>`cast(count(${postTerms.postId}) as integer)`,
}

function ensureUniqueTermSlug(db_: typeof db, taxonomyId: number, baseSlug: string, excludeId?: number): string {
  let candidate = baseSlug
  let counter = 2
  while (true) {
    const conds = [eq(terms.taxonomyId, taxonomyId), eq(terms.slug, candidate)]
    if (excludeId !== undefined) conds.push(eq(terms.id, excludeId))
    const existing = db_
      .select({ id: terms.id })
      .from(terms)
      .where(and(...conds))
      .limit(1)
      .all()
    if (existing.length === 0) return candidate
    candidate = `${baseSlug}-${counter++}`
  }
}

// Raccoglie tutti gli ID discendenti di un term (per prevenire cicli)
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

interface TaxonomiesPluginOptions {
  taxonomyRegistry: TaxonomyRegistry
}

const taxonomiesRoutes: FastifyPluginAsync<TaxonomiesPluginOptions> = async (fastify, opts) => {
  const { taxonomyRegistry } = opts

  // ── GET /taxonomies ──────────────────────────────────────────────────────────
  fastify.get('/', async () => {
    return taxonomyRegistry.getAll()
  })

  // Middleware: risolve la taxonomy dal param e la inietta nel request lifecycle
  async function resolveTaxonomy(slug: string) {
    const def = taxonomyRegistry.get(slug)
    if (!def) return null
    const row = db.select().from(taxonomies).where(eq(taxonomies.slug, slug)).get()
    if (!row) return null
    return { def, row }
  }

  // ── GET /taxonomies/:taxonomySlug/terms ──────────────────────────────────────
  fastify.get<{
    Params:      { taxonomySlug: string }
    Querystring: { parent?: string; search?: string; page?: string; limit?: string; hierarchical?: string }
  }>('/:taxonomySlug/terms', {
    schema: {
      params:      { type: 'object', required: ['taxonomySlug'], properties: { taxonomySlug: { type: 'string' } } },
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
    const tax = await resolveTaxonomy(request.params.taxonomySlug)
    if (!tax) return reply.status(404).send({ error: 'Taxonomy not found' })

    const q = request.query
    const wantTree = q.hierarchical === 'true'
    const page  = Math.max(1, parseInt(q.page ?? '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10)))
    const offset = (page - 1) * limit

    const conditions = [eq(terms.taxonomyId, tax.row.id)]
    if (q.search) conditions.push(like(terms.name, `%${q.search}%`))
    if (q.parent !== undefined) {
      const parentId = parseInt(q.parent, 10)
      conditions.push(isNaN(parentId) || parentId === 0 ? isNull(terms.parentId) : eq(terms.parentId, parentId))
    }
    const where = and(...conditions)

    if (wantTree) {
      // Carica tutti i terms per costruire l'albero (ignora paginazione)
      const all = db
        .select(termSelect)
        .from(terms)
        .leftJoin(postTerms, eq(postTerms.termId, terms.id))
        .where(eq(terms.taxonomyId, tax.row.id))
        .groupBy(terms.id)
        .all()
      return { data: buildTree(all) }
    }

    const data = db
      .select(termSelect)
      .from(terms)
      .leftJoin(postTerms, eq(postTerms.termId, terms.id))
      .where(where)
      .groupBy(terms.id)
      .limit(limit)
      .offset(offset)
      .all()
    const countRow = db.select({ count: sql<number>`count(*)` }).from(terms).where(where).get()
    return { data, total: countRow?.count ?? 0, page, limit }
  })

  // ── GET /taxonomies/:taxonomySlug/terms/:idOrSlug ────────────────────────────
  fastify.get<{ Params: { taxonomySlug: string; idOrSlug: string } }>('/:taxonomySlug/terms/:idOrSlug', {
    schema: {
      params: {
        type: 'object',
        required: ['taxonomySlug', 'idOrSlug'],
        properties: { taxonomySlug: { type: 'string' }, idOrSlug: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const tax = await resolveTaxonomy(request.params.taxonomySlug)
    if (!tax) return reply.status(404).send({ error: 'Taxonomy not found' })

    const { idOrSlug } = request.params
    const isId = /^\d+$/.test(idOrSlug)
    const condition = isId
      ? and(eq(terms.id, parseInt(idOrSlug, 10)), eq(terms.taxonomyId, tax.row.id))
      : and(eq(terms.slug, idOrSlug), eq(terms.taxonomyId, tax.row.id))

    const term = db.select().from(terms).where(condition).get()
    if (!term) return reply.status(404).send({ error: 'Term not found' })
    return term
  })

  // ── POST /taxonomies/:taxonomySlug/terms ─────────────────────────────────────
  fastify.post<{
    Params: { taxonomySlug: string }
    Body: { name: string; slug?: string; description?: string; parentId?: number }
  }>('/:taxonomySlug/terms', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_terms')],
    schema: {
      params: { type: 'object', required: ['taxonomySlug'], properties: { taxonomySlug: { type: 'string' } } },
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
    const tax = await resolveTaxonomy(request.params.taxonomySlug)
    if (!tax) return reply.status(404).send({ error: 'Taxonomy not found' })

    const { name, slug: rawSlug, description = '', parentId } = request.body

    if (parentId !== undefined) {
      if (!tax.row.hierarchical) {
        return reply.status(422).send({ error: 'This taxonomy does not support hierarchical terms' })
      }
      const parent = db.select({ taxonomyId: terms.taxonomyId })
        .from(terms).where(eq(terms.id, parentId)).get()
      if (!parent || parent.taxonomyId !== tax.row.id) {
        return reply.status(422).send({ error: 'Parent term not found in this taxonomy' })
      }
    }

    const baseSlug = rawSlug ? generateSlug(rawSlug) : generateSlug(name)
    const finalSlug = ensureUniqueTermSlug(db, tax.row.id, baseSlug)

    const [inserted] = db.insert(terms).values({
      taxonomyId:  tax.row.id,
      name,
      slug:        finalSlug,
      description,
      parentId:    parentId ?? null,
    }).returning().all()

    return reply.status(201).send(inserted)
  })

  // ── PUT /taxonomies/:taxonomySlug/terms/:id ──────────────────────────────────
  fastify.put<{
    Params: { taxonomySlug: string; id: string }
    Body: { name?: string; slug?: string; description?: string; parentId?: number | null }
  }>('/:taxonomySlug/terms/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_terms')],
    schema: {
      params: {
        type: 'object',
        required: ['taxonomySlug', 'id'],
        properties: { taxonomySlug: { type: 'string' }, id: { type: 'string' } },
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
    const tax = await resolveTaxonomy(request.params.taxonomySlug)
    if (!tax) return reply.status(404).send({ error: 'Taxonomy not found' })

    const termId = parseInt(request.params.id, 10)
    const existing = db.select().from(terms)
      .where(and(eq(terms.id, termId), eq(terms.taxonomyId, tax.row.id))).get()
    if (!existing) return reply.status(404).send({ error: 'Term not found' })

    const { name, slug: rawSlug, description, parentId } = request.body

    if (parentId !== undefined && parentId !== null) {
      if (!tax.row.hierarchical) {
        return reply.status(422).send({ error: 'This taxonomy does not support hierarchical terms' })
      }
      // Previene cicli: il nuovo parent non deve essere un discendente del term
      const descendants = getDescendantIds(db, termId)
      if (parentId === termId || descendants.has(parentId)) {
        return reply.status(422).send({ error: 'Cannot set a descendant as parent (circular reference)' })
      }
      const parent = db.select({ taxonomyId: terms.taxonomyId })
        .from(terms).where(eq(terms.id, parentId)).get()
      if (!parent || parent.taxonomyId !== tax.row.id) {
        return reply.status(422).send({ error: 'Parent term not found in this taxonomy' })
      }
    }

    let finalSlug = existing.slug
    if (rawSlug !== undefined) {
      finalSlug = ensureUniqueTermSlug(db, tax.row.id, generateSlug(rawSlug), termId)
    } else if (name !== undefined && name !== existing.name) {
      finalSlug = ensureUniqueTermSlug(db, tax.row.id, generateSlug(name), termId)
    }

    const [updated] = db.update(terms).set({
      name:        name        ?? existing.name,
      slug:        finalSlug,
      description: description ?? existing.description,
      parentId:    parentId !== undefined ? parentId : existing.parentId,
    }).where(eq(terms.id, termId)).returning().all()

    return updated
  })

  // ── DELETE /taxonomies/:taxonomySlug/terms/:id ───────────────────────────────
  fastify.delete<{
    Params:      { taxonomySlug: string; id: string }
    Querystring: { reassignChildren?: string }
  }>('/:taxonomySlug/terms/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_terms')],
    schema: {
      params: {
        type: 'object',
        required: ['taxonomySlug', 'id'],
        properties: { taxonomySlug: { type: 'string' }, id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { reassignChildren: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const tax = await resolveTaxonomy(request.params.taxonomySlug)
    if (!tax) return reply.status(404).send({ error: 'Taxonomy not found' })

    const termId = parseInt(request.params.id, 10)
    const existing = db.select({ id: terms.id })
      .from(terms)
      .where(and(eq(terms.id, termId), eq(terms.taxonomyId, tax.row.id)))
      .get()
    if (!existing) return reply.status(404).send({ error: 'Term not found' })

    const children = db.select({ id: terms.id }).from(terms).where(eq(terms.parentId, termId)).all()

    if (children.length > 0) {
      const { reassignChildren } = request.query
      if (!reassignChildren) {
        return reply.status(422).send({ error: 'Term has children. Provide ?reassignChildren=<parentId> or 0 to move to root' })
      }
      const newParentId = parseInt(reassignChildren, 10) || null
      db.update(terms).set({ parentId: newParentId }).where(eq(terms.parentId, termId)).run()
    }

    db.delete(terms).where(eq(terms.id, termId)).run()
    return reply.status(204).send()
  })
}

// ─── Route aggiuntive: /posts/:id/terms ──────────────────────────────────────
// Registrate separatamente con prefisso /posts per coesistere col plugin posts

interface PostTermsPluginOptions {
  taxonomyRegistry: TaxonomyRegistry
}

export const postTermsRoutes: FastifyPluginAsync<PostTermsPluginOptions> = async (fastify, opts) => {
  const { taxonomyRegistry } = opts

  // ── GET /posts/:id/terms ────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/terms', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const postId = parseInt(request.params.id, 10)
    const postExists = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get()
    if (!postExists) return reply.status(404).send({ error: 'Post not found' })

    const rows = db
      .select({
        termId:       terms.id,
        termName:     terms.name,
        termSlug:     terms.slug,
        taxonomySlug: taxonomies.slug,
      })
      .from(postTerms)
      .innerJoin(terms, eq(postTerms.termId, terms.id))
      .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
      .where(eq(postTerms.postId, postId))
      .all()

    // Raggruppa per taxonomy slug
    const grouped: Record<string, Array<{ id: number; name: string; slug: string }>> = {}
    for (const row of rows) {
      const key = row.taxonomySlug
      if (!grouped[key]) grouped[key] = []
      grouped[key]!.push({ id: row.termId, name: row.termName, slug: row.termSlug })
    }
    return grouped
  })

  // ── PUT /posts/:id/terms ────────────────────────────────────────────────────
  fastify.put<{ Params: { id: string }; Body: { termIds: number[] } }>('/:id/terms', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_posts')],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['termIds'],
        properties: { termIds: { type: 'array', items: { type: 'number' } } },
      },
    },
  }, async (request, reply) => {
    const postId = parseInt(request.params.id, 10)
    const postExists = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get()
    if (!postExists) return reply.status(404).send({ error: 'Post not found' })

    db.delete(postTerms).where(eq(postTerms.postId, postId)).run()
    if (request.body.termIds.length > 0) {
      db.insert(postTerms)
        .values(request.body.termIds.map(tid => ({ postId, termId: tid })))
        .run()
    }

    return reply.status(204).send()
  })
}

export default taxonomiesRoutes
