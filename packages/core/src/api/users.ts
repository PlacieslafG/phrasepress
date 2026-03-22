import type { FastifyPluginAsync } from 'fastify'
import { eq, ne } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, roles } from '../db/schema.js'
import { hashPassword } from '../auth/password.js'
import '../types.js'

function userWithRole(user: typeof users.$inferSelect, role: typeof roles.$inferSelect | undefined) {
  return {
    id:        user.id,
    username:  user.username,
    email:     user.email,
    roleId:    user.roleId,
    createdAt: user.createdAt,
    role: role
      ? { id: role.id, name: role.name, slug: role.slug, capabilities: JSON.parse(role.capabilities) as string[] }
      : null,
  }
}

const usersRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /users ──────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_users')],
  }, async () => {
    const rows = db
      .select({
        user: users,
        role: roles,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .all()

    return rows.map(r => userWithRole(r.user, r.role ?? undefined))
  })

  // ── GET /users/:id ──────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const targetId = parseInt(request.params.id, 10)

    // Un utente può vedere solo se stesso, a meno che abbia manage_users
    if (targetId !== request.userId && !request.userCapabilities.includes('manage_users')) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const row = db
      .select({ user: users, role: roles })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, targetId))
      .get()

    if (!row) return reply.status(404).send({ error: 'User not found' })
    return userWithRole(row.user, row.role ?? undefined)
  })

  // ── POST /users ─────────────────────────────────────────────────────────────
  fastify.post<{
    Body: { username: string; email: string; password: string; roleSlug?: string }
  }>('/', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_users')],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 60 },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          roleSlug: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { username, email, password, roleSlug } = request.body

    const resolvedRole = roleSlug
      ? db.select({ id: roles.id }).from(roles).where(eq(roles.slug, roleSlug)).get()
      : undefined
    if (roleSlug && !resolvedRole) return reply.status(422).send({ error: 'Role not found', field: 'roleSlug' })
    const roleId = resolvedRole?.id ?? null

    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .get()
    if (existing) return reply.status(422).send({ error: 'Username already taken', field: 'username' })

    const existingEmail = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()
    if (existingEmail) return reply.status(422).send({ error: 'Email already in use', field: 'email' })

    const passwordHash = await hashPassword(password)
    const [inserted] = db.insert(users).values({
      username,
      email,
      passwordHash,
      roleId: roleId ?? null,
      createdAt: Math.floor(Date.now() / 1000),
    }).returning().all()

    const role = inserted.roleId
      ? db.select().from(roles).where(eq(roles.id, inserted.roleId)).get()
      : undefined

    return reply.status(201).send(userWithRole(inserted, role))
  })

  // ── PUT /users/:id ──────────────────────────────────────────────────────────
  fastify.put<{
    Params: { id: string }
    Body: { username?: string; email?: string; password?: string; roleSlug?: string }
  }>('/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 60 },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          roleSlug: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const targetId = parseInt(request.params.id, 10)
    const canManage = request.userCapabilities.includes('manage_users') || request.userRoleSlug === 'administrator'

    if (targetId !== request.userId && !canManage) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    // Solo manage_users può cambiare il ruolo
    if (request.body.roleSlug !== undefined && !canManage) {
      return reply.status(403).send({ error: 'Cannot change role without manage_users capability' })
    }

    const existing = db.select().from(users).where(eq(users.id, targetId)).get()
    if (!existing) return reply.status(404).send({ error: 'User not found' })

    const { username, email, password, roleSlug } = request.body

    let roleId: number | null | undefined = undefined
    if (roleSlug !== undefined) {
      const resolvedRole = roleSlug
        ? db.select({ id: roles.id }).from(roles).where(eq(roles.slug, roleSlug)).get()
        : undefined
      if (roleSlug && !resolvedRole) return reply.status(422).send({ error: 'Role not found', field: 'roleSlug' })
      roleId = resolvedRole?.id ?? null
    }

    if (username !== undefined && username !== existing.username) {
      const taken = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
      if (taken) return reply.status(422).send({ error: 'Username already taken', field: 'username' })
    }

    if (email !== undefined && email !== existing.email) {
      const taken = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()
      if (taken) return reply.status(422).send({ error: 'Email already in use', field: 'email' })
    }

    const passwordHash = password ? await hashPassword(password) : undefined

    const [updated] = db.update(users).set({
      username:     username     ?? existing.username,
      email:        email        ?? existing.email,
      passwordHash: passwordHash ?? existing.passwordHash,
      roleId:       roleId !== undefined ? roleId : existing.roleId,
    }).where(eq(users.id, targetId)).returning().all()

    const role = updated.roleId
      ? db.select().from(roles).where(eq(roles.id, updated.roleId)).get()
      : undefined

    return userWithRole(updated, role)
  })

  // ── DELETE /users/:id ───────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireCapability('manage_users')],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const targetId = parseInt(request.params.id, 10)

    if (targetId === request.userId) {
      return reply.status(422).send({ error: 'Cannot delete your own account' })
    }

    const existing = db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).get()
    if (!existing) return reply.status(404).send({ error: 'User not found' })

    db.delete(users).where(eq(users.id, targetId)).run()
    return reply.status(204).send()
  })
}

export default usersRoutes
