import { eq } from 'drizzle-orm'
import { pluginStatus } from '../db/schema.js'
import type { Plugin, PluginContext, PluginStatus } from './types.js'

export class PluginLoader {
  private readonly plugins: Plugin[]
  private readonly ctx: PluginContext

  constructor(plugins: Plugin[], ctx: PluginContext) {
    this.plugins = plugins
    this.ctx = ctx
  }

  async loadAll(): Promise<void> {
    for (const plugin of this.plugins) {
      // Assicura che esista un record in plugin_status
      const record = this.ctx.db
        .select()
        .from(pluginStatus)
        .where(eq(pluginStatus.pluginName, plugin.name))
        .get()

      if (!record) {
        this.ctx.db.insert(pluginStatus).values({
          pluginName: plugin.name,
          active:     0,
        }).run()
        continue  // nuovo plugin: non attivo di default
      }

      if (!record.active) continue

      try {
        await plugin.register(this.ctx)
      } catch (err) {
        // Error isolation: un plugin che crasha non blocca il boot
        console.error(`[plugins] failed to load plugin '${plugin.name}':`, err)
      }
    }
  }

  async activate(pluginName: string): Promise<void> {
    const plugin = this.plugins.find(p => p.name === pluginName)
    if (!plugin) throw new Error(`Plugin '${pluginName}' not found in config`)

    const record = this.ctx.db
      .select()
      .from(pluginStatus)
      .where(eq(pluginStatus.pluginName, pluginName))
      .get()

    if (record?.active) return  // già attivo

    if (plugin.onActivate) {
      await plugin.onActivate(this.ctx)
    }
    // register() will be called on next boot via loadAll().
    // Fastify is already sealed at this point so routes cannot be added here.

    this.ctx.db
      .insert(pluginStatus)
      .values({ pluginName, active: 1, activatedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({
        target: pluginStatus.pluginName,
        set:    { active: 1, activatedAt: Math.floor(Date.now() / 1000) },
      })
      .run()
  }

  async deactivate(pluginName: string): Promise<void> {
    const plugin = this.plugins.find(p => p.name === pluginName)
    if (!plugin) throw new Error(`Plugin '${pluginName}' not found in config`)

    if (plugin.onDeactivate) {
      await plugin.onDeactivate(this.ctx)
    }

    this.ctx.db
      .update(pluginStatus)
      .set({ active: 0 })
      .where(eq(pluginStatus.pluginName, pluginName))
      .run()
  }

  getStatus(): PluginStatus[] {
    const records = this.ctx.db.select().from(pluginStatus).all()
    const recordMap = new Map(records.map(r => [r.pluginName, r]))

    return this.plugins.map(p => {
      const record = recordMap.get(p.name)
      return {
        name:        p.name,
        version:     p.version,
        description: p.description ?? '',
        active:      record?.active === 1,
        activatedAt: record?.activatedAt ?? null,
      }
    })
  }
}
