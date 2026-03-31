import type { Plugin, PluginContext } from '@phrasepress/core'
import { createTables } from './db.js'
import { registerAiRoutes } from './routes.js'

const aiPlugin: Plugin = {
  name:        'phrasepress-ai',
  version:     '0.1.0',
  description: 'Chat AI con tool calling integrata nell\'admin (Copilot-like)',

  async onActivate(ctx: PluginContext) {
    createTables(ctx.db)
  },

  async register(ctx: PluginContext) {
    createTables(ctx.db)
    await ctx.fastify.register(async (app) => {
      await registerAiRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/ai' })
  },
}

export default aiPlugin
