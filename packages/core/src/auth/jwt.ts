import jwtPlugin from '@fastify/jwt'
import cookiePlugin from '@fastify/cookie'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { hasCapability } from './capabilities.js'

export interface JwtPayload {
  sub:          number
  username:     string
  roleSlug:     string
  capabilities: string[]
}

export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  const jwtSecret = process.env['JWT_SECRET']
  const refreshSecret = process.env['JWT_REFRESH_SECRET']
  if (!jwtSecret)     throw new Error('JWT_SECRET env variable is required')
  if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET env variable is required')

  await fastify.register(cookiePlugin)

  await fastify.register(jwtPlugin, {
    secret: jwtSecret,
    sign:   { expiresIn: '15m' },
  })

  // Decorator: verifica access token e popola request.userId / request.userCapabilities
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JwtPayload
      request.userId           = payload.sub
      request.userCapabilities = payload.capabilities
      request.userRoleSlug     = payload.roleSlug
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // Decorator factory: verifica una capability specifica dopo authenticate
  fastify.decorate('requireCapability', (capability: string) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const roleSlug = (request.user as JwtPayload | undefined)?.roleSlug ?? request.userRoleSlug ?? ''
      const caps     = request.userCapabilities ?? []
      if (!hasCapability(roleSlug, caps, capability)) {
        reply.status(403).send({ error: 'Forbidden' })
      }
    }
  })
}

export const authPlugin = registerAuth
