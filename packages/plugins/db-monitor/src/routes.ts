import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import { analyzeIndexes, getDbStats } from './analyzer.js'
import {
  insertQueryLog,
  listQueryLog,
  getQueryLogStats,
  clearQueryLog,
  type QueryLogSort,
} from './query-tracker.js'

// ─── Schema helpers ───────────────────────────────────────────────────────────

const queryLogBodySchema = {
  type: 'object',
  required: ['url', 'method', 'durationMs'],
  additionalProperties: false,
  properties: {
    url:        { type: 'string', minLength: 1, maxLength: 500 },
    method:     { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
    durationMs: { type: 'integer', minimum: 0, maximum: 300_000 },
    statusCode: { type: 'integer', minimum: 100, maximum: 599 },
  },
} as const

const paginationQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page:  { type: 'integer', minimum: 1,  default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    sort:  { type: 'string',  enum: ['slowest', 'fastest', 'newest', 'oldest'], default: 'newest' },
  },
} as const

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerDbMonitorRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const auth = ctx.fastify.authenticate
  const requireManage = ctx.fastify.requireCapability('manage_options')

  // ── GET /indexes ────────────────────────────────────────────────────────────
  app.get('/indexes', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            tables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  unindexedColumns: { type: 'array', items: { type: 'string' } },
                  columns: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name:      { type: 'string' },
                        type:      { type: 'string' },
                        notNull:   { type: 'boolean' },
                        pk:        { type: 'boolean' },
                        indexed:   { type: 'boolean' },
                        indexName: { type: ['string', 'null'] },
                        unique:    { type: 'boolean' },
                      },
                    },
                  },
                  indexes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name:    { type: 'string' },
                        unique:  { type: 'boolean' },
                        columns: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [auth, requireManage],
  }, (_req: FastifyRequest, _reply: FastifyReply) => {
    return analyzeIndexes(ctx.db)
  })

  // ── GET /table-stats ────────────────────────────────────────────────────────
  app.get('/table-stats', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            pageCount:   { type: 'integer' },
            pageSize:    { type: 'integer' },
            totalSizeKb: { type: 'integer' },
            walMode:     { type: 'boolean' },
            foreignKeys: { type: 'boolean' },
            tables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name:     { type: 'string' },
                  rowCount: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [auth, requireManage],
  }, (_req: FastifyRequest, _reply: FastifyReply) => {
    return getDbStats(ctx.db)
  })

  // ── POST /query-log ─────────────────────────────────────────────────────────
  // Pubblico: usato anche dal frontend pubblico per tracciare le performance.
  // I campi in ingresso sono validati da JSON Schema — nessun dato sensibile esposto.
  app.post('/query-log', {
    schema: {
      body: queryLogBodySchema,
      response: {
        201: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
  }, (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      url: string; method: string; durationMs: number; statusCode?: number
    }

    // userId disponibile solo se il token JWT è valido — opzionale, non blocca
    const userId: number | null = (req as FastifyRequest & { userId?: number }).userId ?? null

    insertQueryLog(ctx.db, {
      url:        body.url,
      method:     body.method,
      durationMs: body.durationMs,
      statusCode: body.statusCode ?? null,
      userAgent:  req.headers['user-agent'] ?? null,
      userId,
    })

    return reply.status(201).send({ ok: true })
  })

  // ── GET /query-log ──────────────────────────────────────────────────────────
  app.get('/query-log', {
    schema: {
      querystring: paginationQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            data:  { type: 'array', items: { type: 'object', additionalProperties: true } },
            stats: {
              type: 'object',
              properties: {
                count:   { type: 'integer' },
                avgMs:   { type: 'integer' },
                p50Ms:   { type: 'integer' },
                p95Ms:   { type: 'integer' },
                maxMs:   { type: 'integer' },
                slowest: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      url:        { type: 'string' },
                      method:     { type: 'string' },
                      durationMs: { type: 'integer' },
                      createdAt:  { type: 'integer' },
                    },
                  },
                },
              },
            },
            total: { type: 'integer' },
            page:  { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    preHandler: [auth, requireManage],
  }, (req: FastifyRequest, _reply: FastifyReply) => {
    const q = req.query as { page?: number; limit?: number; sort?: string }
    const page  = q.page  ?? 1
    const limit = Math.min(q.limit ?? 50, 200)
    const sort  = (q.sort ?? 'newest') as QueryLogSort

    const pageResult = listQueryLog(ctx.db, page, limit, sort)
    const stats      = getQueryLogStats(ctx.db)

    return { ...pageResult, stats }
  })

  // ── DELETE /query-log ───────────────────────────────────────────────────────
  app.delete('/query-log', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            deleted: { type: 'integer' },
          },
        },
      },
    },
    preHandler: [auth, requireManage],
  }, (_req: FastifyRequest, _reply: FastifyReply) => {
    return clearQueryLog(ctx.db)
  })
}
