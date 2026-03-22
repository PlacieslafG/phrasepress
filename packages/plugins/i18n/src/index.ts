import type { Plugin, PluginContext } from '@phrasepress/core'
import { createTables, dbMarkTranslationsDirty, dbDeleteAllTranslations } from './db.js'
import { registerI18nRoutes } from './routes.js'

const i18nPlugin: Plugin = {
  name:        'phrasepress-i18n',
  version:     '1.0.0',
  description: 'Supporto multilingua con auto-traduzione LLM per PhrasePress',

  async onActivate(ctx: PluginContext) {
    createTables(ctx.db)
  },

  async register(ctx: PluginContext) {
    // Segna le traduzioni come dirty quando il post sorgente viene aggiornato
    ctx.hooks.addAction('post.updated', async (postId: unknown) => {
      if (typeof postId === 'number') {
        dbMarkTranslationsDirty(ctx.db, postId)
      }
    })

    // Elimina tutte le traduzioni quando il post viene eliminato definitivamente
    ctx.hooks.addAction('post.deleted', async (postId: unknown) => {
      if (typeof postId === 'number') {
        dbDeleteAllTranslations(ctx.db, postId)
      }
    })

    await ctx.fastify.register(async (app) => {
      await registerI18nRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/phrasepress-i18n' })
  },
}

export default i18nPlugin
