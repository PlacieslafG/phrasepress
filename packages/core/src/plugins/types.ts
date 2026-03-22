import type { FastifyInstance } from 'fastify'
import type { HookManager } from '../hooks/HookManager.js'
import type { PostTypeRegistry } from '../post-types/registry.js'
import type { TaxonomyRegistry } from '../taxonomies/registry.js'
import type { Db } from '../db/client.js'
import type { PhrasePressConfig } from '../config.js'

export interface PluginContext {
  hooks:      HookManager
  postTypes:  PostTypeRegistry
  taxonomies: TaxonomyRegistry
  db:         Db
  fastify:    FastifyInstance
  config:     PhrasePressConfig
}

export interface Plugin {
  name:         string
  version:      string
  description?: string
  register(ctx: PluginContext): void | Promise<void>
  onActivate?(ctx: PluginContext):   void | Promise<void>
  onDeactivate?(ctx: PluginContext): void | Promise<void>
}

export interface PluginStatus {
  name:        string
  version:     string
  description: string
  active:      boolean
  activatedAt: number | null
}
