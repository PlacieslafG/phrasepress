import Fastify, { type FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { registerAuth } from '../auth/jwt.js'
import { CodexRegistry } from '../codices/registry.js'
import { VocabularyRegistry } from '../vocabularies/registry.js'
import { syncVocabulariesWithDb } from '../vocabularies/sync.js'
import { HookManager } from '../hooks/HookManager.js'
import { PluginLoader } from '../plugins/PluginLoader.js'
import {
  folioRoutes,
  folioTermsRoutes,
  vocabulariesRoutes,
  authRoutes,
  usersRoutes,
  rolesRoutes,
  pluginsRoutes,
  metaRoutes,
} from '../api/index.js'
import type { PluginContext } from '../plugins/types.js'

export async function createTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })

  const codexRegistry      = new CodexRegistry()
  const vocabularyRegistry = new VocabularyRegistry()
  const hooks              = new HookManager()

  codexRegistry.register({
    name: 'post', label: 'Posts', icon: 'pi-file',
    stages: [
      { name: 'draft',     label: 'Bozza',      initial: true },
      { name: 'published', label: 'Pubblicato' },
      { name: 'trash',     label: 'Cestino',    final: true },
    ],
    blueprint: [
      { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
      { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
      { name: 'content', type: 'richtext', label: 'Contenuto' },
    ],
    displayField: 'title',
  })
  codexRegistry.register({
    name: 'page', label: 'Pages', icon: 'pi-file-text',
    stages: [
      { name: 'draft',     label: 'Bozza',      initial: true },
      { name: 'published', label: 'Pubblicato' },
      { name: 'trash',     label: 'Cestino',    final: true },
    ],
    blueprint: [
      { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
      { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
      { name: 'content', type: 'richtext', label: 'Contenuto' },
    ],
    displayField: 'title',
  })

  vocabularyRegistry.register({ slug: 'category', name: 'Categories', codices: ['post'], hierarchical: true })
  vocabularyRegistry.register({ slug: 'tag',       name: 'Tags',       codices: ['post'], hierarchical: false })

  syncVocabulariesWithDb(vocabularyRegistry, db)

  await registerAuth(fastify)

  const ctx: PluginContext = {
    hooks,
    codices:      codexRegistry,
    vocabularies: vocabularyRegistry,
    postTypes:    codexRegistry,
    taxonomies:   vocabularyRegistry,
    db,
    fastify,
    config: { codices: [], vocabularies: [], plugins: [] },
  }

  const loader = new PluginLoader([], ctx)
  await loader.loadAll()

  await fastify.register(async (app) => {
    await app.register(authRoutes,         { prefix: '/auth' })
    await app.register(usersRoutes,        { prefix: '/users' })
    await app.register(rolesRoutes,        { prefix: '/roles' })
    await app.register(pluginsRoutes,      { prefix: '/plugins',      loader })
    await app.register(vocabulariesRoutes, { prefix: '/vocabularies', vocabularyRegistry })
    await app.register(metaRoutes,         { prefix: '/',             codexRegistry, hooks })
    await app.register(folioTermsRoutes,   { prefix: '/',             vocabularyRegistry })
    await app.register(folioRoutes,        { prefix: '/',             codexRegistry, hooksManager: hooks })
  }, { prefix: '/api/v1' })

  await fastify.ready()
  return fastify
}

/** Esegue il login e restituisce l'access token. */
export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method:  'POST',
    url:     '/api/v1/auth/login',
    payload: { username, password },
  })
  const body = res.json<{ accessToken: string }>()
  return body.accessToken
}
