import type { Plugin, PluginContext, CodexDefinition, FieldDefinition } from '@phrasepress/core'
import { createTables, dbListGroups, dbListItems } from './db.js'
import { registerFieldRoutes } from './routes.js'

// ─── In-memory groups (registered via registerFieldGroup() in config) ─────────

export interface FieldGroupDef {
  name:         string
  description?: string
  /** Codex names this group applies to (ex "postTypes") */
  codices:      string[]
  fields:       FieldDefinition[]
}

const inMemoryGroups: FieldGroupDef[] = []

export function registerFieldGroup(def: FieldGroupDef): void {
  inMemoryGroups.push(def)
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const fieldsPlugin: Plugin = {
  name:        'phrasepress-fields',
  version:     '1.0.0',
  description: 'Gruppi di campi personalizzati per i codici',

  async onActivate(ctx: PluginContext) {
    createTables(ctx.db)
  },

  async register(ctx: PluginContext) {
    // Esegue le migration schema ad ogni boot (idempotente)
    createTables(ctx.db)

    // Inject field group fields into codex definitions at request time
    ctx.hooks.addFilter('codices.meta', (value: unknown) => {
      const types = value as CodexDefinition[]

      let dbGroups: Array<{ codices: string[]; fields: FieldDefinition[] }> = []
      try {
        dbGroups = dbListGroups(ctx.db).map(row => ({
          codices: JSON.parse(row.postTypes) as string[],
          fields:  dbListItems(ctx.db, row.id).map(item => ({
            name:         item.name,
            label:        item.label || item.name,
            type:         item.type as FieldDefinition['type'],
            required:     item.required === 1,
            queryable:    item.queryable === 1,
            translatable: item.translatable === 1,
            options:      JSON.parse(item.options) as string[],
            fieldOptions: JSON.parse(item.fieldOptions) as Record<string, unknown>,
            default:      item.defaultValue != null ? JSON.parse(item.defaultValue) : undefined,
          })),
        }))
      } catch {
        // Tables not created yet (plugin registered but not yet activated)
      }

      const allGroups = [
        ...inMemoryGroups.map(g => ({ codices: g.codices, fields: g.fields })),
        ...dbGroups,
      ]

      if (allGroups.length === 0) return types

      return types.map(cx => {
        const extra = allGroups
          .filter(g => g.codices.includes(cx.name))
          .flatMap(g => g.fields)
        if (extra.length === 0) return cx
        return { ...cx, blueprint: [...(cx.blueprint ?? []), ...extra] }
      })
    })

    // Register CRUD API routes
    await ctx.fastify.register(async (app) => {
      await registerFieldRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/fields' })
  },
}

export default fieldsPlugin
