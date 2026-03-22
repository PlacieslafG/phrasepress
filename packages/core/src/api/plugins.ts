import type { FastifyPluginAsync } from 'fastify'
import type { PluginLoader } from '../plugins/PluginLoader.js'
import '../types.js'

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
    return { success: true, requiresRestart: true }
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
    // La deattivazione richiede restart per rimuovere hook/post type già registrati
    return { success: true, requiresRestart: true }
  })
}

export default pluginsRoutes
