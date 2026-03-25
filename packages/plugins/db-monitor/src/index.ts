import type { Plugin, PluginContext } from '@phrasepress/core'
import { createQueryLogTable } from './query-tracker.js'
import { registerDbMonitorRoutes } from './routes.js'

const dbMonitorPlugin: Plugin = {
  name:        'phrasepress-db-monitor',
  version:     '1.0.0',
  description: 'Database monitoring: index analysis, table stats, query speed tracking',

  onActivate(ctx: PluginContext) {
    createQueryLogTable(ctx.db)
  },

  async register(ctx: PluginContext) {
    // Ensure table exists on every boot (idempotent - uses CREATE TABLE IF NOT EXISTS)
    createQueryLogTable(ctx.db)

    await ctx.fastify.register(async (app) => {
      await registerDbMonitorRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/db-monitor' })
  },
}

export default dbMonitorPlugin
