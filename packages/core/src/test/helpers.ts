import Fastify, { type FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { registerAuth } from '../auth/jwt.js'
import { PostTypeRegistry } from '../post-types/registry.js'
import { TaxonomyRegistry } from '../taxonomies/registry.js'
import { syncTaxonomiesWithDb } from '../taxonomies/sync.js'
import { HookManager } from '../hooks/HookManager.js'
import { PluginLoader } from '../plugins/PluginLoader.js'
import {
  postsRoutes,
  taxonomiesRoutes,
  postTermsRoutes,
  authRoutes,
  usersRoutes,
  rolesRoutes,
  pluginsRoutes,
  metaRoutes,
} from '../api/index.js'
import type { PluginContext } from '../plugins/types.js'

export async function createTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })

  const postTypeRegistry = new PostTypeRegistry()
  const taxonomyRegistry = new TaxonomyRegistry()
  const hooks            = new HookManager()

  postTypeRegistry.register({ name: 'post', label: 'Posts', icon: 'pi-file' })
  postTypeRegistry.register({ name: 'page', label: 'Pages', icon: 'pi-file-text' })

  taxonomyRegistry.register({ slug: 'category', name: 'Categories', postTypes: ['post'], hierarchical: true })
  taxonomyRegistry.register({ slug: 'tag',      name: 'Tags',       postTypes: ['post'], hierarchical: false })

  syncTaxonomiesWithDb(taxonomyRegistry, db)

  await registerAuth(fastify)

  const ctx: PluginContext = {
    hooks,
    postTypes:  postTypeRegistry,
    taxonomies: taxonomyRegistry,
    db,
    fastify,
    config: { postTypes: [], taxonomies: [], plugins: [] },
  }

  const loader = new PluginLoader([], ctx)
  await loader.loadAll()

  await fastify.register(async (app) => {
    await app.register(authRoutes,       { prefix: '/auth' })
    await app.register(usersRoutes,      { prefix: '/users' })
    await app.register(rolesRoutes,      { prefix: '/roles' })
    await app.register(postsRoutes,      { prefix: '/posts', postTypeRegistry })
    await app.register(taxonomiesRoutes, { prefix: '/taxonomies', taxonomyRegistry })
    await app.register(postTermsRoutes,  { prefix: '/posts',      taxonomyRegistry })
    await app.register(pluginsRoutes,    { prefix: '/plugins',    loader })
    await app.register(metaRoutes,       { prefix: '/',           postTypeRegistry })
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
