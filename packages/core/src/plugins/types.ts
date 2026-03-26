import type { FastifyInstance } from 'fastify'
import type { IHookManager } from '../hooks/HookManager.js'
import type { CodexRegistry } from '../codices/registry.js'
import type { VocabularyRegistry } from '../vocabularies/registry.js'
import type { Db } from '../db/client.js'
import type { PhrasePressConfig } from '../config.js'

export interface PluginContext {
  hooks:       IHookManager
  codices:     CodexRegistry
  vocabularies: VocabularyRegistry
  db:          Db
  fastify:     FastifyInstance
  config:      PhrasePressConfig
  // Alias backward-compat per plugin esistenti
  /** @deprecated Usare `codices` */
  postTypes:   CodexRegistry
  /** @deprecated Usare `vocabularies` */
  taxonomies:  VocabularyRegistry
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
