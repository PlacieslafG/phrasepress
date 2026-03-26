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
import { CodexRegistry } from './codices/registry.js'
import { VocabularyRegistry } from './vocabularies/registry.js'
import { syncVocabulariesWithDb } from './vocabularies/sync.js'
import { HookManager } from './hooks/HookManager.js'
import { PluginLoader } from './plugins/PluginLoader.js'
import { registerAuth } from './auth/jwt.js'
import {
  folioRoutes,
  folioTermsRoutes,
  vocabulariesRoutes,
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
  const codexRegistry      = new CodexRegistry()
  const vocabularyRegistry = new VocabularyRegistry()
  const hooks              = new HookManager()

  // 3. Codici e vocabolari dal config utente
  for (const cx  of config.codices)      codexRegistry.register(cx)
  for (const voc of config.vocabularies) vocabularyRegistry.register(voc)

  // 4. Sync vocabolari nel DB
  syncVocabulariesWithDb(vocabularyRegistry, db)

  // 5. Fastify
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
  // 6. Auth plugin (JWT + cookie + decorators)
  await registerAuth(fastify)

  // 7. PluginContext
  const ctx: PluginContext = {
    hooks,
    codices:      codexRegistry,
    vocabularies: vocabularyRegistry,
    // backward-compat aliases
    postTypes:  codexRegistry,
    taxonomies: vocabularyRegistry,
    db,
    fastify,
    config,
  }

  // 8. Plugin loader
  const loader = new PluginLoader(config.plugins, ctx)
  await loader.loadAll()

  // 9. Route API — ordine importante: statiche prima di quelle parametriche (/:codex)
  await fastify.register(async (app) => {
    await app.register(authRoutes,         { prefix: '/auth' })
    await app.register(usersRoutes,        { prefix: '/users' })
    await app.register(rolesRoutes,        { prefix: '/roles' })
    await app.register(pluginsRoutes,      { prefix: '/plugins',      loader })
    await app.register(vocabulariesRoutes, { prefix: '/vocabularies', vocabularyRegistry })
    await app.register(metaRoutes,         { prefix: '/',             codexRegistry, hooks })
    // Rotte parametriche /:codex registrate per ultime
    await app.register(folioTermsRoutes,   { prefix: '/',             vocabularyRegistry })
    await app.register(folioRoutes,        { prefix: '/',             codexRegistry, hooksManager: hooks })
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
  return { default: { codices: [], vocabularies: [], plugins: [] } }
})

const app = await createServer(userConfig)
await app.listen({ port, host: '0.0.0.0' })
