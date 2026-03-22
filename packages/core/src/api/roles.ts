import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { roles, users } from '../db/schema.js'
import { ALL_CAPABILITIES, isValidCapability } from '../auth/capabilities.js'
import '../types.js'

function parseRole(role: typeof roles.$inferSelect) {
  return {
    id:           role.id,
    name:         role.name,
    slug:         role.slug,
    capabilities: JSON.parse(role.capabilities) as string[],
  }
}

const rolesRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /roles ──────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_roles')],
  }, async () => {
    return db.select().from(roles).all().map(parseRole)
  })

  // ── POST /roles ─────────────────────────────────────────────────────────────
  fastify.post<{ Body: { name: string; slug: string; capabilities: string[] } }>('/', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_roles')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'slug', 'capabilities'],
        properties: {
          name:         { type: 'string', minLength: 1 },
          slug:         { type: 'string', minLength: 1 },
          capabilities: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { name, slug, capabilities } = request.body

    const invalid = capabilities.filter(c => !isValidCapability(c))
    if (invalid.length > 0) {
      return reply.status(422).send({ error: `Unknown capabilities: ${invalid.join(', ')}`, validCapabilities: ALL_CAPABILITIES })
    }

    const existing = db.select({ id: roles.id }).from(roles).where(eq(roles.slug, slug)).get()
    if (existing) return reply.status(422).send({ error: 'Role slug already exists', field: 'slug' })

    const [inserted] = db.insert(roles).values({
      name,
      slug,
      capabilities: JSON.stringify(capabilities),
    }).returning().all()

    return reply.status(201).send(parseRole(inserted))
  })

  // ── PUT /roles/:id ──────────────────────────────────────────────────────────
  fastify.put<{
    Params: { id: string }
    Body: { name?: string; capabilities?: string[] }
  }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_roles')],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name:         { type: 'string', minLength: 1 },
          capabilities: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const roleId = parseInt(request.params.id, 10)
    const existing = db.select().from(roles).where(eq(roles.id, roleId)).get()
    if (!existing) return reply.status(404).send({ error: 'Role not found' })

    if (existing.slug === 'administrator') {
      return reply.status(422).send({ error: 'Cannot modify the administrator role' })
    }

    const { name, capabilities } = request.body

    if (capabilities !== undefined) {
      const invalid = capabilities.filter(c => !isValidCapability(c))
      if (invalid.length > 0) {
        return reply.status(422).send({ error: `Unknown capabilities: ${invalid.join(', ')}`, validCapabilities: ALL_CAPABILITIES })
      }
    }

    const [updated] = db.update(roles).set({
      name:         name         ?? existing.name,
      capabilities: capabilities !== undefined ? JSON.stringify(capabilities) : existing.capabilities,
    }).where(eq(roles.id, roleId)).returning().all()

    return parseRole(updated)
  })

  // ── DELETE /roles/:id ───────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_roles')],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const roleId = parseInt(request.params.id, 10)
    const existing = db.select({ slug: roles.slug }).from(roles).where(eq(roles.id, roleId)).get()
    if (!existing) return reply.status(404).send({ error: 'Role not found' })

    if (existing.slug === 'administrator') {
      return reply.status(422).send({ error: 'Cannot delete the administrator role' })
    }

    const usersWithRole = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleId, roleId))
      .limit(1)
      .all()

    if (usersWithRole.length > 0) {
      return reply.status(422).send({ error: 'Cannot delete a role that is assigned to users' })
    }

    db.delete(roles).where(eq(roles.id, roleId)).run()
    return reply.status(204).send()
  })
}

export default rolesRoutes
