import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { posts } from '../db/schema.js'
import { sql } from 'drizzle-orm'
import type { PostTypeRegistry } from '../post-types/registry.js'
import type { HookManager } from '../hooks/HookManager.js'
import '../types.js'

interface MetaPluginOptions {
  postTypeRegistry: PostTypeRegistry
  hooks: HookManager
}

const metaRoutes: FastifyPluginAsync<MetaPluginOptions> = async (fastify, opts) => {
  const { postTypeRegistry, hooks } = opts

  // ── GET /post-types ─────────────────────────────────────────────────────────
  fastify.get('/post-types', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const types = postTypeRegistry.getAll()
    return hooks.applyFilters('post_types.meta', types)
  })

  // ── GET /stats ──────────────────────────────────────────────────────────────
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const postTypes = postTypeRegistry.getAll().map((pt) => pt.name)
    const statuses  = ['published', 'draft', 'trash'] as const

    const counts = db
      .select({
        postType: posts.postType,
        status:   posts.status,
        total:    sql<number>`COUNT(*)`.as('total'),
      })
      .from(posts)
      .groupBy(posts.postType, posts.status)
      .all()

    // Trasforma in { [postType]: { publish: N, draft: N, trash: N, total: N } }
    const result: Record<string, Record<string, number>> = {}

    for (const pt of postTypes) {
      result[pt] = { published: 0, draft: 0, trash: 0, total: 0 }
    }

    for (const row of counts) {
      const pt = row.postType
      if (!result[pt]) continue
      if (statuses.includes(row.status as typeof statuses[number])) {
        result[pt][row.status] = row.total
      }
      result[pt]['total'] += row.total
    }

    return result
  })
}

export { metaRoutes }
