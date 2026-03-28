import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyPluginAsync } from 'fastify'
import type { PluginLoader } from '../plugins/PluginLoader.js'
import '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Scrive un file in src/ per triggerare il restart di nodemon tramite file-watch
function triggerRestart(): void {
  const triggerFile = join(__dirname, 'restart-trigger.ts')
  writeFileSync(triggerFile, `// restart trigger — auto-generated\nexport const t = ${Date.now()}\n`)
}

interface PluginsRouteOptions {
  loader: PluginLoader
}

const pluginsRoutes: FastifyPluginAsync<PluginsRouteOptions> = async (fastify, opts) => {
  const { loader } = opts

  // ── GET /plugins ─────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_plugins')],
  }, async () => {
    return loader.getStatus()
  })

  // ── POST /plugins/:name/activate ─────────────────────────────────────────────
  fastify.post<{ Params: { name: string } }>('/:name/activate', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_plugins')],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    try {
      await loader.activate(request.params.name)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(422).send({ error: message })
    }
    // Invia la risposta, poi triggera il restart di nodemon via file-watch
    reply.send({ success: true, restarting: true })
    setTimeout(triggerRestart, 300)
    return reply
  })

  // ── POST /plugins/:name/deactivate ────────────────────────────────────────────
  fastify.post<{ Params: { name: string } }>('/:name/deactivate', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_plugins')],
    schema: {
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    try {
      await loader.deactivate(request.params.name)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(422).send({ error: message })
    }
    // Invia la risposta, poi triggera il restart di nodemon via file-watch
    reply.send({ success: true, restarting: true })
    setTimeout(triggerRestart, 300)
    return reply
  })
}

export default pluginsRoutes
