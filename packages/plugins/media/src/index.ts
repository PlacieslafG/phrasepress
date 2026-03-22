import { mkdirSync, unlinkSync, existsSync, createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { desc, eq, like, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import type { Plugin, PluginContext } from '@phrasepress/core'

// ─── Schema tabella media (gestita dal plugin, non dal core) ─────────────────

const media = sqliteTable('media', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  filename:     text('filename').notNull(),        // nome file su disco (UUID-based)
  originalName: text('original_name').notNull(),   // nome file originale
  mimeType:     text('mime_type').notNull(),
  size:         integer('size').notNull(),          // bytes
  path:         text('path').notNull(),             // percorso relativo alla storage dir
  alt:          text('alt').notNull().default(''),
  caption:      text('caption').notNull().default(''),
  uploadedBy:   integer('uploaded_by'),
  createdAt:    integer('created_at').notNull(),
})

// ─── Configurazione ───────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
])

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/gif':       'gif',
  'image/webp':      'webp',
  'image/svg+xml':   'svg',
  'application/pdf': 'pdf',
}

const MAX_FILE_SIZE = parseInt(process.env['MEDIA_MAX_FILE_SIZE'] ?? '10485760', 10)

function getStorageDir(): string {
  return resolve(process.env['MEDIA_STORAGE_PATH'] ?? './data/uploads')
}

// ─── Route builder ────────────────────────────────────────────────────────────

async function registerRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const multipart = await import('@fastify/multipart')
  await app.register(multipart.default, {
    limits: { fileSize: MAX_FILE_SIZE },
  })

  // ── POST /upload ────────────────────────────────────────────────────────────
  app.post('/upload', {
    preHandler: [ctx.fastify.authenticate, ctx.fastify.requireCapability('upload_files')],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const mReq = req as FastifyRequest & { file(): Promise<MultipartFile | undefined> }
    const data = await mReq.file()

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      return reply.status(422).send({
        error:        'File type not allowed',
        allowedTypes: [...ALLOWED_MIME_TYPES],
      })
    }

    const ext      = MIME_TO_EXT[data.mimetype] ?? (extname(data.filename).slice(1) || 'bin')
    const uuid     = randomUUID()
    const filename = `${uuid}.${ext}`
    const storagePath = getStorageDir()

    mkdirSync(storagePath, { recursive: true })

    const buffer   = await data.toBuffer()
    const filePath = join(storagePath, filename)
    await writeFile(filePath, buffer)

    const now    = Math.floor(Date.now() / 1000)
    const userId = (req as FastifyRequest & { userId: number }).userId

    const [inserted] = ctx.db
      .insert(media)
      .values({
        filename,
        originalName: data.filename,
        mimeType:     data.mimetype,
        size:         buffer.length,
        path:         filename,
        uploadedBy:   userId,
        createdAt:    now,
      })
      .returning()
      .all()

    return reply.status(201).send(inserted)
  })

  // ── GET / — lista media ─────────────────────────────────────────────────────
  app.get<{
    Querystring: { page?: string; limit?: string; search?: string }
  }>('/', {
    preHandler: [ctx.fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page:   { type: 'string' },
          limit:  { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const q      = request.query
    const page   = Math.max(1, parseInt(q.page  ?? '1',  10))
    const limit  = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10)))
    const offset = (page - 1) * limit
    const where  = q.search ? like(media.originalName, `%${q.search}%`) : undefined

    const [countRow] = ctx.db
      .select({ total: sql<number>`count(*)` })
      .from(media)
      .where(where)
      .all()

    const total = countRow?.total ?? 0

    const items = ctx.db
      .select()
      .from(media)
      .where(where)
      .orderBy(desc(media.createdAt))
      .limit(limit)
      .offset(offset)
      .all()

    return { data: items, total, page, limit }
  })

  // ── GET /:id ────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [ctx.fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const id   = parseInt(request.params.id, 10)
    const item = ctx.db.select().from(media).where(eq(media.id, id)).get()

    if (!item) return reply.status(404).send({ error: 'Media not found' })
    return item
  })

  // ── PUT /:id — aggiorna alt e caption ───────────────────────────────────────
  app.put<{
    Params: { id: string }
    Body:   { alt?: string; caption?: string }
  }>('/:id', {
    preHandler: [ctx.fastify.authenticate, ctx.fastify.requireCapability('upload_files')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          alt:     { type: 'string' },
          caption: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const id       = parseInt(request.params.id, 10)
    const existing = ctx.db.select().from(media).where(eq(media.id, id)).get()

    if (!existing) return reply.status(404).send({ error: 'Media not found' })

    const { alt, caption } = request.body
    const updates: Partial<{ alt: string; caption: string }> = {}
    if (alt     !== undefined) updates.alt     = alt
    if (caption !== undefined) updates.caption = caption

    if (Object.keys(updates).length === 0) return existing

    ctx.db.update(media).set(updates).where(eq(media.id, id)).run()
    return ctx.db.select().from(media).where(eq(media.id, id)).get()
  })

  // ── DELETE /:id ─────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [ctx.fastify.authenticate, ctx.fastify.requireCapability('upload_files')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const id       = parseInt(request.params.id, 10)
    const existing = ctx.db.select().from(media).where(eq(media.id, id)).get()

    if (!existing) return reply.status(404).send({ error: 'Media not found' })

    const filePath = join(getStorageDir(), existing.path)
    if (existsSync(filePath)) unlinkSync(filePath)

    ctx.db.delete(media).where(eq(media.id, id)).run()
    return reply.status(204).send()
  })

  // ── GET /files/:filename — serve file pubblicamente ────────────────────────
  app.get<{ Params: { filename: string } }>('/files/:filename', {}, async (request, reply) => {
    const { filename } = request.params
    // Sanitizzazione: solo caratteri sicuri, nessun path traversal
    if (!/^[a-zA-Z0-9\-_.]+$/.test(filename)) {
      return reply.status(400).send({ error: 'Invalid filename' })
    }

    const filePath = join(getStorageDir(), filename)
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'File not found' })

    const extMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif',  webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf',
    }
    const ext      = extname(filename).slice(1).toLowerCase()
    const mimeType = extMap[ext] ?? 'application/octet-stream'

    reply.header('Content-Type', mimeType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return reply.send(createReadStream(filePath))
  })
}

// ─── Plugin export ────────────────────────────────────────────────────────────

const mediaPlugin: Plugin = {
  name:        'phrasepress-media',
  version:     '1.0.0',
  description: 'Media library: upload e gestione di immagini e file',

  onActivate(ctx: PluginContext): void {
    ctx.db.$client.exec(`
      CREATE TABLE IF NOT EXISTS media (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        filename      TEXT    NOT NULL,
        original_name TEXT    NOT NULL,
        mime_type     TEXT    NOT NULL,
        size          INTEGER NOT NULL,
        path          TEXT    NOT NULL,
        alt           TEXT    NOT NULL DEFAULT '',
        caption       TEXT    NOT NULL DEFAULT '',
        uploaded_by   INTEGER REFERENCES users(id),
        created_at    INTEGER NOT NULL
      )
    `)

    mkdirSync(getStorageDir(), { recursive: true })
  },

  async register(ctx: PluginContext): Promise<void> {
    try {
      await ctx.fastify.register(
        (app: FastifyInstance, _opts: Record<never, never>, done: (err?: Error) => void) => {
          void registerRoutes(app, ctx).then(() => done()).catch(done)
        },
        { prefix: '/api/v1/plugins/media' },
      )
    } catch {
      // Server già avviato: le route saranno disponibili al prossimo riavvio
    }
  },
}

export default mediaPlugin

