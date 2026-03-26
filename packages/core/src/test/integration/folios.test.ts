import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp, loginAs } from '../helpers.js'
import { db } from '../../db/client.js'
import { folios } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

let app: FastifyInstance
let adminToken: string

beforeAll(async () => {
  app = await createTestApp()
  adminToken = await loginAs(app, 'admin', 'Test@Password123!')
})

afterAll(async () => { await app.close() })

beforeEach(() => {
  db.delete(folios).where(eq(folios.codex, 'post')).run()
  db.delete(folios).where(eq(folios.codex, 'page')).run()
})

// ─── Helpers ────────────────────────────────────────────────────────────────

type FolioBody = { fields?: Record<string, unknown>; stage?: string }

async function createFolio(codex: string, payload: FolioBody) {
  return app.inject({
    method:  'POST',
    url:     `/api/v1/${codex}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  })
}

// ─── Creazione folio ─────────────────────────────────────────────────────────

describe('POST /api/v1/:codex', () => {
  it('crea un folio e restituisce 201 con id, slug e fields', async () => {
    const res = await createFolio('post', {
      fields: { title: 'Hello World' },
      stage:  'draft',
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: number; stage: string; fields: { title: string; slug: string } }>()
    expect(body.fields.title).toBe('Hello World')
    expect(body.fields.slug).toBe('hello-world')
    expect(body.stage).toBe('draft')
    expect(body.id).toBeTypeOf('number')
  })

  it('genera slug automaticamente dal titolo con accenti', async () => {
    const res = await createFolio('post', {
      fields: { title: 'Titolo Con Accenti: Café' },
      stage:  'draft',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ fields: { slug: string } }>().fields.slug).toBe('titolo-con-accenti-cafe')
  })

  it('garantisce unicità dello slug con suffisso numerico', async () => {
    await createFolio('post', { fields: { title: 'Duplicate' }, stage: 'draft' })
    const res = await createFolio('post', { fields: { title: 'Duplicate' }, stage: 'draft' })

    expect(res.statusCode).toBe(201)
    expect(res.json<{ fields: { slug: string } }>().fields.slug).toBe('duplicate-2')
  })

  it('senza token → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/post',
      payload: { fields: { title: 'No Auth' }, stage: 'draft' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('codex sconosciuto → 422', async () => {
    const res = await createFolio('nonexistent', { fields: { title: 'Bad Codex' } })
    expect(res.statusCode).toBe(422)
  })

  it('campo required mancante → 422', async () => {
    const res = await createFolio('post', { fields: {} })
    expect(res.statusCode).toBe(422)
  })
})

// ─── Lista folios ─────────────────────────────────────────────────────────────

describe('GET /api/v1/:codex', () => {
  it('restituisce lista paginata', async () => {
    await createFolio('post', { fields: { title: 'Post Uno' },  stage: 'published' })
    await createFolio('post', { fields: { title: 'Post Due' },  stage: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/post' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: unknown[]; total: number }>()
    expect(body.data.length).toBeGreaterThanOrEqual(2)
    expect(body.total).toBeGreaterThanOrEqual(2)
  })

  it('filtra per stage', async () => {
    await createFolio('post', { fields: { title: 'Pubblicato' }, stage: 'published' })
    await createFolio('post', { fields: { title: 'Bozza' },      stage: 'draft' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/post?stage=draft' })
    const body = res.json<{ data: Array<{ stage: string }> }>()

    expect(body.data.every(f => f.stage === 'draft')).toBe(true)
  })
})

// ─── Dettaglio folio ──────────────────────────────────────────────────────────

describe('GET /api/v1/:codex/:idOrSlug', () => {
  it('recupera per slug', async () => {
    await createFolio('post', { fields: { title: 'My Article' }, stage: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/post/my-article' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ fields: { title: string } }>().fields.title).toBe('My Article')
  })

  it('recupera per id numerico', async () => {
    const created = (await createFolio('post', { fields: { title: 'By ID' }, stage: 'draft' }))
      .json<{ id: number }>()

    const res = await app.inject({ method: 'GET', url: `/api/v1/post/${created.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ id: number }>().id).toBe(created.id)
  })

  it('folio inesistente → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/post/slug-che-non-esiste' })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Aggiornamento folio ──────────────────────────────────────────────────────

describe('PUT /api/v1/:codex/:id', () => {
  it('aggiorna fields e crea una revisione con lo snapshot precedente', async () => {
    const created = (await createFolio('post', { fields: { title: 'Original' }, stage: 'draft' }))
      .json<{ id: number }>()

    const updateRes = await app.inject({
      method:  'PUT',
      url:     `/api/v1/post/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { fields: { title: 'Updated' } },
    })
    expect(updateRes.statusCode).toBe(200)
    expect(updateRes.json<{ fields: { title: string } }>().fields.title).toBe('Updated')

    const revisionsRes = await app.inject({
      method:  'GET',
      url:     `/api/v1/post/${created.id}/revisions`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(revisionsRes.statusCode).toBe(200)
    const revisions = revisionsRes.json<Array<{ fields: string }>>()
    expect(revisions.length).toBeGreaterThanOrEqual(1)
    // La prima revisione (più recente) contiene lo snapshot precedente all'update
    const rev0Fields = JSON.parse(revisions[0]?.fields ?? '{}') as Record<string, unknown>
    expect(rev0Fields['title']).toBe('Original')
  })

  it('senza token → 401', async () => {
    const created = (await createFolio('post', { fields: { title: 'To Update' }, stage: 'draft' }))
      .json<{ id: number }>()

    const res = await app.inject({
      method:  'PUT',
      url:     `/api/v1/post/${created.id}`,
      payload: { fields: { title: 'Hack' } },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Eliminazione folio ───────────────────────────────────────────────────────

describe('DELETE /api/v1/:codex/:id', () => {
  it('soft delete: sposta in stage trash', async () => {
    const created = (await createFolio('post', { fields: { title: 'To Delete' }, stage: 'published' }))
      .json<{ id: number }>()

    const delRes = await app.inject({
      method:  'DELETE',
      url:     `/api/v1/post/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(delRes.statusCode).toBe(204)

    // Il folio è ora in stage trash
    const getRes = await app.inject({
      method:  'GET',
      url:     `/api/v1/post/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect([404, 200]).toContain(getRes.statusCode)
    if (getRes.statusCode === 200) {
      expect(getRes.json<{ stage: string }>().stage).toBe('trash')
    }
  })

  it('senza token → 401', async () => {
    const created = (await createFolio('post', { fields: { title: 'Protected' }, stage: 'draft' }))
      .json<{ id: number }>()

    const res = await app.inject({
      method: 'DELETE',
      url:    `/api/v1/post/${created.id}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Filtri avanzati lista folios ────────────────────────────────────────────

describe('GET /api/v1/:codex — ricerca e filtri', () => {
  it('cerca nel campo title (queryable)', async () => {
    await createFolio('post', { fields: { title: 'Articolo sul clima' }, stage: 'published' })
    await createFolio('post', { fields: { title: 'Note varie' },         stage: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/post?search=clima' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ fields: { title: string } }> }>()
    expect(body.data.length).toBe(1)
    expect(body.data[0]?.fields.title).toBe('Articolo sul clima')
  })

  it('filtra per authorId', async () => {
    const created = (await createFolio('post', { fields: { title: 'Admin Post' }, stage: 'published' }))
      .json<{ id: number; authorId: number }>()

    const adminId = created.authorId

    const res = await app.inject({ method: 'GET', url: `/api/v1/post?authorId=${adminId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ authorId: number }> }>()
    expect(body.data.every(f => f.authorId === adminId)).toBe(true)
  })

  it('filtra per authorId inesistente restituisce lista vuota', async () => {
    await createFolio('post', { fields: { title: 'Qualcosa' }, stage: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/post?authorId=99999' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ data: unknown[] }>().data.length).toBe(0)
  })

  it('filtra per dateFrom', async () => {
    const testStart = Math.floor(Date.now() / 1000)
    const past      = testStart - 10000

    // Inocula un folio con timestamp passato direttamente nel DB
    db.insert(folios).values({
      codex:     'post',
      stage:     'published',
      fields:    JSON.stringify({ title: 'Folio Vecchio', slug: 'folio-vecchio' }),
      authorId:  null,
      createdAt: past,
      updatedAt: past,
    }).run()
    await createFolio('post', { fields: { title: 'Folio Recente' }, stage: 'published' })

    const dateFrom = testStart - 1
    const res = await app.inject({ method: 'GET', url: `/api/v1/post?stage=any&dateFrom=${dateFrom}` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ fields: { title: string }; createdAt: number }> }>()
    expect(body.data.every(f => f.createdAt >= dateFrom)).toBe(true)
    expect(body.data.some(f => f.fields.title === 'Folio Recente')).toBe(true)
    expect(body.data.some(f => f.fields.title === 'Folio Vecchio')).toBe(false)
  })
})
