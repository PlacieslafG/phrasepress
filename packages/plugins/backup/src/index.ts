import type { Plugin, PluginContext } from '@phrasepress/core'
import { createTables, resetStuckRunning, reconcileHistory } from './db.js'
import { registerBackupRoutes } from './routes.js'
import { BackupScheduler } from './scheduler.js'

const scheduler = new BackupScheduler()

const backupPlugin: Plugin = {
  name:        'phrasepress-backup',
  version:     '1.0.0',
  description: 'Automated and manual backup with restore — DB, media, plugins, config',

  onActivate(ctx: PluginContext) {
    createTables(ctx.db)
  },

  async register(ctx: PluginContext) {
    createTables(ctx.db)
    resetStuckRunning(ctx.db)
    await reconcileHistory(ctx.db)

    await ctx.fastify.register(async (app) => {
      await registerBackupRoutes(app, ctx, scheduler)
    }, { prefix: '/api/v1/plugins/phrasepress-backup' })

    scheduler.start(ctx.db)
  },

  onDeactivate() {
    scheduler.stop()
  },
}

export default backupPlugin
