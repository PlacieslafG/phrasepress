import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import staticPlugin from '@fastify/static'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { db } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { seedDatabase } from './db/seed.js'
import { PostTypeRegistry } from './post-types/registry.js'
import { TaxonomyRegistry } from './taxonomies/registry.js'
import { syncTaxonomiesWithDb } from './taxonomies/sync.js'
import { HookManager } from './hooks/HookManager.js'
import { PluginLoader } from './plugins/PluginLoader.js'
import { registerAuth } from './auth/jwt.js'
import {
  postsRoutes,
  taxonomiesRoutes,
  postTermsRoutes,
  authRoutes,
  usersRoutes,
  rolesRoutes,
  pluginsRoutes,
  metaRoutes,
} from './api/index.js'

import type { PhrasePressConfig } from './config.js'
import type { PluginContext } from './plugins/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function createServer(config: PhrasePressConfig) {
  // 1. DB: migration + seed
  runMigrations()
  await seedDatabase()

  // 2. Registri
  const postTypeRegistry  = new PostTypeRegistry()
  const taxonomyRegistry  = new TaxonomyRegistry()
  const hooks             = new HookManager()

  // 3. Post type e taxonomy di default
  postTypeRegistry.register({ name: 'post', label: 'Posts',  icon: 'pi-file-edit' })
  postTypeRegistry.register({ name: 'page', label: 'Pages', icon: 'pi-file-o' })

  taxonomyRegistry.register({ slug: 'category', name: 'Categories', postTypes: ['post'], hierarchical: true })
  taxonomyRegistry.register({ slug: 'tag',      name: 'Tags',       postTypes: ['post'], hierarchical: false })

  // 4. Post type e taxonomy dal config utente
  for (const pt  of config.postTypes)  postTypeRegistry.register(pt)
  for (const tax of config.taxonomies) taxonomyRegistry.register(tax)

  // 5. Sync taxonomies nel DB
  syncTaxonomiesWithDb(taxonomyRegistry, db)

  // 6. Fastify
  const fastify = Fastify({ logger: true })

  await fastify.register(helmet, { contentSecurityPolicy: false })
  const allowedOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow any localhost origin (dev tools, test pages) and configured origins
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || allowedOrigins.includes(origin)) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'), false)
      }
    },
    credentials: true,
  })
  await fastify.register(rateLimit, { max: 200, timeWindow: '1 minute' })
  // 7. Auth plugin (JWT + cookie + decorators)
  await registerAuth(fastify)

  // 8. Context plugin — inizializzato qui perché dipende da fastify
  const ctx: PluginContext = {
    hooks,
    postTypes:  postTypeRegistry,
    taxonomies: taxonomyRegistry,
    db,
    fastify,
    config,
  }

  // 9. Plugin loader
  const loader = new PluginLoader(config.plugins, ctx)
  await loader.loadAll()

  // 10. Route API
  await fastify.register(async (app) => {
    await app.register(authRoutes,       { prefix: '/auth' })
    await app.register(usersRoutes,      { prefix: '/users' })
    await app.register(rolesRoutes,      { prefix: '/roles' })
    await app.register(postsRoutes,      { prefix: '/posts', postTypeRegistry, hooksManager: hooks })
    await app.register(taxonomiesRoutes, { prefix: '/taxonomies', taxonomyRegistry })
    await app.register(postTermsRoutes,  { prefix: '/posts',      taxonomyRegistry })
    await app.register(pluginsRoutes,    { prefix: '/plugins',    loader })
    await app.register(metaRoutes,       { prefix: '/',           postTypeRegistry, hooks })
  }, { prefix: '/api/v1' })

  // 11. Serve admin SPA in produzione
  if (process.env['NODE_ENV'] === 'production') {
    const adminDist = join(__dirname, '../../../dist/admin')
    await fastify.register(staticPlugin, { root: adminDist, prefix: '/' })
    fastify.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html')
    })
  }

  return fastify
}

// Entry point quando eseguito direttamente
const port = parseInt(process.env['PORT'] ?? '3000', 10)

const configPath = new URL('../../../config/phrasepress.config.js', import.meta.url).pathname
const { default: userConfig } = await import(configPath).catch((err: unknown) => {
  console.error('[config] failed to load phrasepress.config:', err)
  return { default: { postTypes: [], taxonomies: [], plugins: [] } }
})

const app = await createServer(userConfig)
await app.listen({ port, host: '0.0.0.0' })
