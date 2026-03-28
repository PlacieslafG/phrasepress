import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { folios } from '../db/schema.js'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { CodexRegistry } from '../codices/registry.js'
import type { IHookManager } from '../hooks/HookManager.js'
import '../types.js'

// Generated once per process — changes on every server restart.
const SERVER_BOOT_ID = randomUUID()

interface MetaPluginOptions {
  codexRegistry: CodexRegistry
  hooks: IHookManager
}

const metaRoutes: FastifyPluginAsync<MetaPluginOptions> = async (fastify, opts) => {
  const { codexRegistry, hooks } = opts

  // ── GET /health ──────────────────────────────────────────────────────────────
  // Unauthenticated — usato dall'admin UI per polling post-riavvio
  fastify.get('/health', async () => {
    return { ok: true, bootId: SERVER_BOOT_ID }
  })

  // ── GET /codices ─────────────────────────────────────────────────────────────
  fastify.get('/codices', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const types = codexRegistry.getAll()
    return hooks.applyFilters('codices.meta', types)
  })

  // ── GET /stats ───────────────────────────────────────────────────────────────
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const codexNames = codexRegistry.getAll().map((c) => c.name)

    const counts = db
      .select({
        codex: folios.codex,
        stage: folios.stage,
        total: sql<number>`COUNT(*)`.as('total'),
      })
      .from(folios)
      .groupBy(folios.codex, folios.stage)
      .all()

    // Trasforma in { [codex]: { published: N, draft: N, trash: N, total: N } }
    const result: Record<string, Record<string, number>> = {}

    for (const name of codexNames) {
      result[name] = { published: 0, draft: 0, trash: 0, total: 0 }
    }

    for (const row of counts) {
      const name = row.codex
      if (!result[name]) continue
      result[name][row.stage] = (result[name][row.stage] ?? 0) + row.total
      result[name]['total'] += row.total
    }

    return result
  })
}

export { metaRoutes }
