import type { FastifyRequest, FastifyReply } from 'fastify'

// Estende FastifyInstance con i decorator di auth (implementati in src/auth/)
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireCapability: (capability: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    // Popolato da `authenticate` dopo verifica JWT
    userId:           number
    userCapabilities: string[]
    userRoleSlug:     string
  }
}
