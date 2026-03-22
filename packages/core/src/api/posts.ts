import type { FastifyPluginAsync } from 'fastify'
import { and, or, eq, ne, lt, gt, lte, gte, like, sql, exists, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import type { Tx } from '../db/client.js'
import { posts, postFieldIndex, postRevisions, postTerms, terms, taxonomies } from '../db/schema.js'
import { generateSlug, ensureUniqueSlug } from '../post-types/slug.js'
import type { PostTypeRegistry } from '../post-types/registry.js'
import '../types.js'

// ─── Tipi inferiti da Drizzle ────────────────────────────────────────────────

type Post = typeof posts.$inferSelect
type NewPost = typeof posts.$inferInsert

// ─── Helper: fetch post con terms raggruppati per taxonomy ─────────────────

function fetchPostWithTerms(postId: number) {
  const post = db.select().from(posts).where(eq(posts.id, postId)).get()
  if (!post) return null

  const postTermsRows = db
    .select({
      termId:       terms.id,
      termName:     terms.name,
      termSlug:     terms.slug,
      taxonomyId:   taxonomies.id,
      taxonomySlug: taxonomies.slug,
      taxonomyName: taxonomies.name,
    })
    .from(postTerms)
    .innerJoin(terms, eq(postTerms.termId, terms.id))
    .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
    .where(eq(postTerms.postId, postId))
    .all()

  return {
    ...post,
    fields: JSON.parse(post.fields) as Record<string, unknown>,
    terms:  postTermsRows,
  }
}

// ─── Helper: sincronizza post_field_index ────────────────────────────────────

interface FieldDef {
  name:      string
  type:      string
  queryable?: boolean
}

function syncFieldIndex(tx: Tx, postId: number, fields: Record<string, unknown>, fieldDefs: FieldDef[]) {
  tx.delete(postFieldIndex).where(eq(postFieldIndex.postId, postId)).run()

  for (const def of fieldDefs) {
    if (!def.queryable) continue
    const value = fields[def.name]
    if (value === undefined || value === null) continue

    const isNumeric = def.type === 'number'
    tx.insert(postFieldIndex).values({
      postId,
      fieldName:   def.name,
      stringValue: isNumeric ? null : String(value),
      numberValue: isNumeric ? Number(value) : null,
    }).run()
  }
}

// ─── Helper: crea revisione (chiamato PRIMA di aggiornare il post) ───────────

function createRevision(tx: Tx, post: Post, authorId?: number) {
  tx.insert(postRevisions).values({
    postId:    post.id,
    title:     post.title,
    slug:      post.slug,
    content:   post.content,
    fields:    post.fields,
    status:    post.status,
    authorId:  authorId ?? post.authorId,
    createdAt: Math.floor(Date.now() / 1000),
  }).run()
}

// ─── Plugin Fastify ──────────────────────────────────────────────────────────

interface PostsPluginOptions {
  postTypeRegistry: PostTypeRegistry
}

// Regex per riconoscere il formato ?fieldName[op]=value
const FIELD_FILTER_RE = /^([\w]+)\[(gt|gte|lt|lte|eq)\]$/

const postsRoutes: FastifyPluginAsync<PostsPluginOptions> = async (fastify, opts) => {
  const { postTypeRegistry } = opts

  // ── GET /posts ─────────────────────────────────────────────────────────────
  fastify.get<{
    Querystring: Record<string, string>
  }>('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['type'],
        properties: {
          type:    { type: 'string' },
          status:  { type: 'string', enum: ['draft', 'published', 'trash', 'any'] },
          page:    { type: 'string' },
          limit:   { type: 'string' },
          orderBy:  { type: 'string' },
          order:    { type: 'string', enum: ['asc', 'desc'] },
          search:   { type: 'string' },
          authorId: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo:   { type: 'string' },
        },
        additionalProperties: true,  // permette filtri dinamici per terms e fields
      },
    },
  }, async (request, reply) => {
    const q = request.query
    const postType = q['type']!
    const status   = q['status'] ?? 'published'
    const page     = Math.max(1, parseInt(q['page'] ?? '1', 10))
    const limit    = Math.min(100, Math.max(1, parseInt(q['limit'] ?? '20', 10)))
    const offset   = (page - 1) * limit
    const orderField = q['orderBy'] ?? 'createdAt'
    const orderDir   = q['order'] ?? 'desc'

    if (!postTypeRegistry.exists(postType)) {
      return reply.status(404).send({ error: `Post type '${postType}' not found` })
    }

    const conditions = [eq(posts.postType, postType)]
    if (status !== 'any') {
      conditions.push(eq(posts.status, status))
    }
    if (q['search']) {
      const term = `%${q['search']}%`
      conditions.push(or(like(posts.title, term), like(posts.content, term))!)
    }

    if (q['authorId']) {
      conditions.push(eq(posts.authorId, parseInt(q['authorId'], 10)))
    }
    if (q['dateFrom']) {
      conditions.push(gte(posts.createdAt, parseInt(q['dateFrom'], 10)))
    }
    if (q['dateTo']) {
      conditions.push(lte(posts.createdAt, parseInt(q['dateTo'], 10)))
    }

    const ptDef = postTypeRegistry.get(postType)
    const fieldDefs = ptDef?.fields ?? []

    // Analizza i parametri extra: term filters e field filters
    const termFilters: Record<string, string> = {}
    const fieldFilters: Array<{ name: string; op: string; value: string }> = []

    for (const [key, value] of Object.entries(q)) {
      if (['type', 'status', 'page', 'limit', 'orderBy', 'order', 'search', 'authorId', 'dateFrom', 'dateTo'].includes(key)) continue
      const fieldMatch = FIELD_FILTER_RE.exec(key)
      if (fieldMatch) {
        fieldFilters.push({ name: fieldMatch[1]!, op: fieldMatch[2]!, value })
      } else {
        // Assume sia un filtro su taxonomy (taxonomySlug=termSlug)
        termFilters[key] = value
      }
    }

    // Filtri su taxonomy terms (EXISTS subquery)
    for (const [taxSlug, termSlug] of Object.entries(termFilters)) {
      conditions.push(
        exists(
          db.select({ one: sql`1` })
            .from(postTerms)
            .innerJoin(terms, eq(postTerms.termId, terms.id))
            .innerJoin(taxonomies, eq(terms.taxonomyId, taxonomies.id))
            .where(
              and(
                eq(postTerms.postId, posts.id),
                eq(taxonomies.slug, taxSlug),
                eq(terms.slug, termSlug),
              ),
            ),
        ),
      )
    }

    // Filtri su campi queryable (EXISTS subquery su post_field_index)
    for (const { name, op, value } of fieldFilters) {
      const def = fieldDefs.find(f => f.name === name)
      const isNumeric = def?.type === 'number'
      const numVal = parseFloat(value)

      const colExpr = isNumeric ? postFieldIndex.numberValue : postFieldIndex.stringValue
      const typedVal = isNumeric ? numVal : value

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- valore tipizzato runtime
      let cmp: ReturnType<typeof eq>
      if (op === 'eq')  cmp = eq(colExpr, typedVal as any)
      else if (op === 'lt')  cmp = lt(colExpr, typedVal as any)
      else if (op === 'lte') cmp = lte(colExpr, typedVal as any)
      else if (op === 'gt')  cmp = gt(colExpr, typedVal as any)
      else                   cmp = gte(colExpr, typedVal as any)

      conditions.push(
        exists(
          db.select({ one: sql`1` })
            .from(postFieldIndex)
            .where(
              and(
                eq(postFieldIndex.postId, posts.id),
                eq(postFieldIndex.fieldName, name),
                cmp,
              ),
            ),
        ),
      )
    }

    const where = and(...conditions)

    const orderCol = (() => {
      switch (orderField) {
        case 'title':     return posts.title
        case 'updatedAt': return posts.updatedAt
        case 'status':    return posts.status
        default:          return posts.createdAt
      }
    })()

    const [data, countRow] = await Promise.all([
      db.select().from(posts)
        .where(where)
        .orderBy(orderDir === 'asc' ? sql`${orderCol} asc` : sql`${orderCol} desc`)
        .limit(limit)
        .offset(offset)
        .all(),
      db.select({ count: sql<number>`count(*)` }).from(posts).where(where).get(),
    ])

    return {
      data: data.map(p => ({ ...p, fields: JSON.parse(p.fields) as Record<string, unknown> })),
      total: countRow?.count ?? 0,
      page,
      limit,
    }
  })

  // ── GET /posts/:idOrSlug ────────────────────────────────────────────────────
  fastify.get<{ Params: { idOrSlug: string }; Querystring: { type?: string } }>('/:idOrSlug', {
    schema: {
      params: {
        type: 'object',
        properties: { idOrSlug: { type: 'string' } },
        required: ['idOrSlug'],
      },
    },
  }, async (request, reply) => {
    const { idOrSlug } = request.params
    const postType = request.query.type

    const isId = /^\d+$/.test(idOrSlug)
    const condition = isId
      ? eq(posts.id, parseInt(idOrSlug, 10))
      : postType
        ? and(eq(posts.slug, idOrSlug), eq(posts.postType, postType))
        : eq(posts.slug, idOrSlug)

    const post = db.select().from(posts).where(condition).get()
    if (!post) return reply.status(404).send({ error: 'Post not found' })

    return fetchPostWithTerms(post.id)
  })

  // ── POST /posts ─────────────────────────────────────────────────────────────
  fastify.post<{
    Body: {
      postType: string
      title:    string
      slug?:    string
      content?: string
      fields?:  Record<string, unknown>
      status?:  'draft' | 'published'
      termIds?: number[]
    }
  }>('/', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_posts')],
    schema: {
      body: {
        type: 'object',
        required: ['postType', 'title'],
        properties: {
          postType: { type: 'string' },
          title:    { type: 'string', minLength: 1 },
          slug:     { type: 'string' },
          content:  { type: 'string' },
          fields:   { type: 'object' },
          status:   { type: 'string', enum: ['draft', 'published'] },
          termIds:  { type: 'array', items: { type: 'number' } },
        },
      },
    },
  }, async (request, reply) => {
    const { postType, title, slug: rawSlug, content = '', fields = {}, status = 'draft', termIds = [] } = request.body

    if (!postTypeRegistry.exists(postType)) {
      return reply.status(422).send({ error: `Post type '${postType}' is not registered` })
    }

    const ptDef = postTypeRegistry.get(postType)!
    const fieldDefs = ptDef.fields ?? []

    // Valida campi required
    for (const def of fieldDefs) {
      if (def.required && (fields[def.name] === undefined || fields[def.name] === null)) {
        return reply.status(422).send({ error: `Field '${def.name}' is required`, field: def.name })
      }
    }

    const baseSlug = rawSlug ? generateSlug(rawSlug) : generateSlug(title)
    const finalSlug = ensureUniqueSlug(db, postType, baseSlug)
    const now = Math.floor(Date.now() / 1000)
    const authorId = request.userId

    const inserted = db.transaction((tx) => {
      const [post] = tx.insert(posts).values({
        postType,
        title,
        slug:      finalSlug,
        content,
        fields:    JSON.stringify(fields),
        status,
        authorId,
        createdAt: now,
        updatedAt: now,
      }).returning().all()

      if (!post) throw new Error('Failed to insert post')

      syncFieldIndex(tx, post.id, fields, fieldDefs)

      if (termIds.length > 0) {
        tx.insert(postTerms).values(termIds.map(tid => ({ postId: post.id, termId: tid }))).run()
      }

      createRevision(tx, post, authorId)

      return post
    })

    return reply.status(201).send(fetchPostWithTerms(inserted.id))
  })

  // ── PUT /posts/:id ──────────────────────────────────────────────────────────
  fastify.put<{
    Params: { id: string }
    Body: {
      title?:   string
      slug?:    string
      content?: string
      fields?:  Record<string, unknown>
      status?:  'draft' | 'published' | 'trash'
      termIds?: number[]
    }
  }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_posts')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          title:   { type: 'string', minLength: 1 },
          slug:    { type: 'string' },
          content: { type: 'string' },
          fields:  { type: 'object' },
          status:  { type: 'string', enum: ['draft', 'published', 'trash'] },
          termIds: { type: 'array', items: { type: 'number' } },
        },
      },
    },
  }, async (request, reply) => {
    const postId = parseInt(request.params.id, 10)
    const existing = db.select().from(posts).where(eq(posts.id, postId)).get()
    if (!existing) return reply.status(404).send({ error: 'Post not found' })

    // Controlla permesso edit_others_posts se non è l'autore
    if (existing.authorId !== request.userId && !request.userCapabilities.includes('edit_others_posts')) {
      return reply.status(403).send({ error: 'Insufficient permissions to edit this post' })
    }

    const { title, slug: rawSlug, content, fields, status, termIds } = request.body
    const ptDef = postTypeRegistry.get(existing.postType)
    const fieldDefs = ptDef?.fields ?? []

    let finalSlug = existing.slug
    if (rawSlug !== undefined) {
      finalSlug = ensureUniqueSlug(db, existing.postType, generateSlug(rawSlug), postId)
    } else if (title !== undefined && title !== existing.title) {
      finalSlug = ensureUniqueSlug(db, existing.postType, generateSlug(title), postId)
    }

    const updatedFields = fields !== undefined ? fields : JSON.parse(existing.fields) as Record<string, unknown>
    const authorId = request.userId

    db.transaction((tx) => {
      // Snapshot PRIMA di aggiornare
      createRevision(tx, existing, authorId)

      tx.update(posts).set({
        title:     title ?? existing.title,
        slug:      finalSlug,
        content:   content ?? existing.content,
        fields:    JSON.stringify(updatedFields),
        status:    status ?? existing.status,
        updatedAt: Math.floor(Date.now() / 1000),
      }).where(eq(posts.id, postId)).run()

      syncFieldIndex(tx, postId, updatedFields, fieldDefs)

      if (termIds !== undefined) {
        tx.delete(postTerms).where(eq(postTerms.postId, postId)).run()
        if (termIds.length > 0) {
          tx.insert(postTerms).values(termIds.map(tid => ({ postId, termId: tid }))).run()
        }
      }
    })

    return fetchPostWithTerms(postId)
  })

  // ── DELETE /posts/:id ───────────────────────────────────────────────────────
  fastify.delete<{
    Params: { id: string }
    Querystring: { force?: string }
  }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('delete_posts')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: { force: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const postId = parseInt(request.params.id, 10)
    const force  = request.query.force === 'true'

    const existing = db.select({ id: posts.id, authorId: posts.authorId }).from(posts).where(eq(posts.id, postId)).get()
    if (!existing) return reply.status(404).send({ error: 'Post not found' })

    if (existing.authorId !== request.userId && !request.userCapabilities.includes('delete_others_posts')) {
      return reply.status(403).send({ error: 'Insufficient permissions to delete this post' })
    }

    if (force) {
      // Hard delete — cascata su post_field_index, post_revisions, post_terms
      db.delete(posts).where(eq(posts.id, postId)).run()
    } else {
      // Soft delete
      db.update(posts).set({ status: 'trash', updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(posts.id, postId)).run()
    }

    return reply.status(204).send()
  })

  // ── GET /posts/:id/revisions ────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/revisions', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const postId = parseInt(request.params.id, 10)
    const existing = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get()
    if (!existing) return reply.status(404).send({ error: 'Post not found' })

    const revisions = db
      .select()
      .from(postRevisions)
      .where(eq(postRevisions.postId, postId))
      .orderBy(sql`${postRevisions.createdAt} desc`)
      .all()

    return revisions.map(r => ({ ...r, fields: JSON.parse(r.fields) as Record<string, unknown> }))
  })

  // ── POST /posts/:id/revisions/:revId/restore ────────────────────────────────
  fastify.post<{ Params: { id: string; revId: string } }>('/:id/revisions/:revId/restore', {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_posts')],
    schema: {
      params: {
        type: 'object',
        required: ['id', 'revId'],
        properties: {
          id:    { type: 'string' },
          revId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const postId = parseInt(request.params.id, 10)
    const revId  = parseInt(request.params.revId, 10)

    const existing = db.select().from(posts).where(eq(posts.id, postId)).get()
    if (!existing) return reply.status(404).send({ error: 'Post not found' })

    const revision = db.select().from(postRevisions)
      .where(and(eq(postRevisions.id, revId), eq(postRevisions.postId, postId)))
      .get()
    if (!revision) return reply.status(404).send({ error: 'Revision not found' })

    const ptDef = postTypeRegistry.get(existing.postType)
    const fieldDefs = ptDef?.fields ?? []
    const restoredFields = JSON.parse(revision.fields) as Record<string, unknown>

    db.transaction((tx) => {
      // Salva snapshot attuale prima di sovrascrivere
      createRevision(tx, existing, request.userId)

      tx.update(posts).set({
        title:     revision.title,
        slug:      revision.slug,
        content:   revision.content,
        fields:    revision.fields,
        status:    revision.status,
        updatedAt: Math.floor(Date.now() / 1000),
      }).where(eq(posts.id, postId)).run()

      syncFieldIndex(tx, postId, restoredFields, fieldDefs)
    })

    return fetchPostWithTerms(postId)
  })
}

export default postsRoutes
