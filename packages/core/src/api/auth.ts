import type { FastifyPluginAsync } from 'fastify'
import { eq, and, gt } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/client.js'
import { users, roles, refreshTokens } from '../db/schema.js'
import { verifyPassword } from '../auth/password.js'
import type { JwtPayload } from '../auth/jwt.js'
import '../types.js'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function buildRefreshToken(): string {
  return randomBytes(64).toString('hex')
}

const authRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /auth/login ───────────────────────────────────────────────────────
  fastify.post<{ Body: { username: string; password: string } }>('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body

    const user = db
      .select({
        id:           users.id,
        username:     users.username,
        email:        users.email,
        passwordHash: users.passwordHash,
        roleId:       users.roleId,
      })
      .from(users)
      .where(eq(users.username, username))
      .get()

    // Risposta generica per non rivelare se l'utente esiste
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(user.passwordHash, password)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const role = user.roleId
      ? db.select().from(roles).where(eq(roles.id, user.roleId)).get()
      : null

    const capabilities: string[] = role ? JSON.parse(role.capabilities) as string[] : []
    const roleSlug = role?.slug ?? 'subscriber'

    const payload: JwtPayload = {
      sub:          user.id,
      username:     user.username,
      roleSlug,
      capabilities,
    }

    const accessToken = await fastify.jwt.sign(payload)
    const refreshToken = buildRefreshToken()
    const refreshHash = hashToken(refreshToken)
    const now = Math.floor(Date.now() / 1000)

    db.insert(refreshTokens).values({
      userId:    user.id,
      tokenHash: refreshHash,
      expiresAt: now + 60 * 60 * 24 * 7,
      createdAt: now,
    }).run()

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path:     '/',
      maxAge:   60 * 60 * 24 * 7,
    })

    return {
      accessToken,
      user: {
        id:       user.id,
        username: user.username,
        email:    user.email,
        role:     { slug: roleSlug, capabilities },
      },
    }
  })

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  fastify.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies?.['refreshToken']
    if (!rawToken) {
      return reply.status(401).send({ error: 'No refresh token' })
    }

    const tokenHash = hashToken(rawToken)
    const now = Math.floor(Date.now() / 1000)

    const record = db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), gt(refreshTokens.expiresAt, now)))
      .get()

    if (!record) {
      // Cancella il cookie stale: non ha senso tenerlo se il token non è più in DB
      reply.setCookie('refreshToken', '', {
        httpOnly: true,
        secure:   process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        path:     '/',
        maxAge:   0,
      })
      return reply.status(401).send({ error: 'Invalid or expired refresh token' })
    }

    const user = db
      .select({ id: users.id, username: users.username, roleId: users.roleId })
      .from(users)
      .where(eq(users.id, record.userId))
      .get()

    if (!user) {
      return reply.status(401).send({ error: 'User not found' })
    }

    const role = user.roleId
      ? db.select().from(roles).where(eq(roles.id, user.roleId)).get()
      : null

    const capabilities: string[] = role ? JSON.parse(role.capabilities) as string[] : []

    const payload: JwtPayload = {
      sub:          user.id,
      username:     user.username,
      roleSlug:     role?.slug ?? 'subscriber',
      capabilities,
    }

    return { accessToken: await fastify.jwt.sign(payload) }
  })

  // ── POST /auth/logout ──────────────────────────────────────────────────────
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Delete ALL refresh tokens for this user (by userId from JWT), so the
    // session is invalidated even if the cookie was not forwarded by the proxy.
    db.delete(refreshTokens)
      .where(eq(refreshTokens.userId, request.userId))
      .run()

    reply.setCookie('refreshToken', '', {
      httpOnly: true,
      secure:   process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path:     '/',
      maxAge:   0,
    })
    return { success: true }
  })

  // ── GET /auth/me ───────────────────────────────────────────────────────────
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = db
      .select({ id: users.id, username: users.username, email: users.email, roleId: users.roleId })
      .from(users)
      .where(eq(users.id, request.userId))
      .get()

    if (!user) throw new Error('Authenticated user not found in DB')

    const role = user.roleId
      ? db.select().from(roles).where(eq(roles.id, user.roleId)).get()
      : null

    return {
      id:       user.id,
      username: user.username,
      email:    user.email,
      role: {
        slug:         role?.slug         ?? 'subscriber',
        capabilities: role ? JSON.parse(role.capabilities) as string[] : [],
      },
    }
  })
}

export default authRoutes
