import type { FastifyInstance } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import type { FieldGroupRow, FieldItemRow } from './db.js'
import {
  dbListGroups, dbGetGroup, dbCreateGroup, dbUpdateGroup, dbDeleteGroup,
  dbListItems, dbCreateItem, dbUpdateItem, dbDeleteItem, dbReorderItems,
} from './db.js'

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeItem(item: FieldItemRow) {
  return {
    id:           item.id,
    groupId:      item.groupId,
    name:         item.name,
    label:        item.label,
    type:         item.type,
    required:     item.required === 1,
    queryable:    item.queryable === 1,
    translatable: item.translatable === 1,
    options:      JSON.parse(item.options) as string[],
    fieldOptions: JSON.parse(item.fieldOptions) as Record<string, unknown>,
    defaultValue: item.defaultValue != null ? JSON.parse(item.defaultValue) as unknown : null,
    sortOrder:    item.sortOrder,
  }
}

function serializeGroup(group: FieldGroupRow, items: FieldItemRow[]) {
  return {
    id:          group.id,
    name:        group.name,
    description: group.description,
    codices:     JSON.parse(group.codices) as string[],
    sortOrder:   group.sortOrder,
    createdAt:   group.createdAt,
    fields:      items.map(serializeItem),
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

type GroupBody = { name: string; description?: string; codices?: string[] }
type FieldBody = {
  name: string; label?: string; type: string
  required?: boolean; queryable?: boolean; translatable?: boolean; options?: string[]
  fieldOptions?: Record<string, unknown>; defaultValue?: unknown
}

const groupBodySchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name:        { type: 'string', minLength: 1 },
    description: { type: 'string' },
    codices:     { type: 'array', items: { type: 'string' } },
  },
}

const fieldBodySchema = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name:         { type: 'string', minLength: 1 },
    label:        { type: 'string' },
    type:         { type: 'string' },
    required:     { type: 'boolean' },
    queryable:    { type: 'boolean' },
    translatable: { type: 'boolean' },
    options:      { type: 'array', items: { type: 'string' } },
    fieldOptions: { type: 'object' },
    defaultValue: {},
  },
}

export async function registerFieldRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const auth = [ctx.fastify.authenticate, ctx.fastify.requireCapability('manage_plugins')]

  // ── Groups ────────────────────────────────────────────────────────────────

  app.get('/groups', { preHandler: auth }, async () => {
    const groups = dbListGroups(ctx.db)
    return groups.map(g => serializeGroup(g, dbListItems(ctx.db, g.id)))
  })

  app.post<{ Body: GroupBody }>('/groups', {
    preHandler: auth,
    schema: { body: groupBodySchema },
  }, async (req, reply) => {
    const group = dbCreateGroup(ctx.db, {
      name:        req.body.name,
      description: req.body.description ?? '',
      codices:     req.body.codices ?? [],
    })
    return reply.status(201).send(serializeGroup(group, []))
  })

  app.get<{ Params: { id: string } }>('/groups/:id', {
    preHandler: auth,
  }, async (req, reply) => {
    const group = dbGetGroup(ctx.db, req.params.id)
    if (!group) return reply.status(404).send({ error: 'Field group not found' })
    return serializeGroup(group, dbListItems(ctx.db, group.id))
  })

  app.put<{ Params: { id: string }; Body: GroupBody }>('/groups/:id', {
    preHandler: auth,
    schema: { body: groupBodySchema },
  }, async (req, reply) => {
    const exists = dbGetGroup(ctx.db, req.params.id)
    if (!exists) return reply.status(404).send({ error: 'Field group not found' })
    const updated = dbUpdateGroup(ctx.db, req.params.id, {
      name:        req.body.name,
      description: req.body.description ?? '',
      codices:     req.body.codices ?? [],
    })
    return serializeGroup(updated!, dbListItems(ctx.db, req.params.id))
  })

  app.delete<{ Params: { id: string } }>('/groups/:id', {
    preHandler: auth,
  }, async (req, reply) => {
    const exists = dbGetGroup(ctx.db, req.params.id)
    if (!exists) return reply.status(404).send({ error: 'Field group not found' })
    dbDeleteGroup(ctx.db, req.params.id)
    return reply.status(204).send()
  })

  // ── Fields ─────────────────────────────────────────────────────────────────

  app.post<{ Params: { id: string }; Body: FieldBody }>('/groups/:id/fields', {
    preHandler: auth,
    schema: { body: fieldBodySchema },
  }, async (req, reply) => {
    const group = dbGetGroup(ctx.db, req.params.id)
    if (!group) return reply.status(404).send({ error: 'Field group not found' })
    const item = dbCreateItem(ctx.db, req.params.id, req.body)
    return reply.status(201).send(serializeItem(item))
  })

  app.put<{ Params: { id: string; fieldId: string }; Body: FieldBody }>('/groups/:id/fields/:fieldId', {
    preHandler: auth,
    schema: { body: fieldBodySchema },
  }, async (req, reply) => {
    const item = dbUpdateItem(ctx.db, req.params.fieldId, req.body)
    if (!item) return reply.status(404).send({ error: 'Field not found' })
    return serializeItem(item)
  })

  app.delete<{ Params: { id: string; fieldId: string } }>('/groups/:id/fields/:fieldId', {
    preHandler: auth,
  }, async (req, reply) => {
    dbDeleteItem(ctx.db, req.params.fieldId)
    return reply.status(204).send()
  })

  // ── Reorder ────────────────────────────────────────────────────────────────

  app.put<{
    Params: { id: string }
    Body: { order: { id: string; order: number }[] }
  }>('/groups/:id/reorder', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        required: ['order'],
        properties: {
          order: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'order'],
              properties: { id: { type: 'string' }, order: { type: 'number' } },
            },
          },
        },
      },
    },
  }, async (req) => {
    dbReorderItems(ctx.db, req.body.order)
    return { success: true }
  })
}
