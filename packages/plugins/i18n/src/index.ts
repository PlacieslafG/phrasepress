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
    // Segna le traduzioni come dirty quando il folio sorgente viene aggiornato
    ctx.hooks.addAction('folio.updated', async (folioId: unknown) => {
      if (typeof folioId === 'number') {
        dbMarkTranslationsDirty(ctx.db, folioId)
      }
    })

    // Elimina tutte le traduzioni quando il folio viene eliminato definitivamente
    ctx.hooks.addAction('folio.deleted', async (folioId: unknown) => {
      if (typeof folioId === 'number') {
        dbDeleteAllTranslations(ctx.db, folioId)
      }
    })

    await ctx.fastify.register(async (app) => {
      await registerI18nRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/phrasepress-i18n' })
  },
}

export default i18nPlugin
