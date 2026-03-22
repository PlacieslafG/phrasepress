import type { Plugin, PluginContext } from '@phrasepress/core'
import { createTables } from './db.js'
import { registerAdminRoutes } from './admin-routes.js'
import { registerPublicRoutes } from './public-routes.js'

const formsPlugin: Plugin = {
  name:        'phrasepress-forms',
  version:     '1.0.0',
  description: 'Gestione form di contatto con archivio submission',

  async onActivate(ctx: PluginContext) {
    createTables(ctx.db)
  },

  async register(ctx: PluginContext) {
    await ctx.fastify.register(async (app) => {
      await registerAdminRoutes(app, ctx)
      await registerPublicRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/phrasepress-forms' })
  },
}

export default formsPlugin
