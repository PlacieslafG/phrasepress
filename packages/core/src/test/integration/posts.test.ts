import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp, loginAs } from '../helpers.js'
import { db } from '../../db/client.js'
import { posts } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

let app: FastifyInstance
let adminToken: string

beforeAll(async () => {
  app = await createTestApp()
  adminToken = await loginAs(app, 'admin', 'Test@Password123!')
})

afterAll(async () => { await app.close() })

beforeEach(() => {
  // Pulisce i post creati dai test precedenti
  db.delete(posts).where(eq(posts.postType, 'post')).run()
  db.delete(posts).where(eq(posts.postType, 'page')).run()
})

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createPost(payload: Record<string, unknown>) {
  return app.inject({
    method:  'POST',
    url:     '/api/v1/posts',
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  })
}

// ─── Creazione post ──────────────────────────────────────────────────────────

describe('POST /api/v1/posts', () => {
  it('crea un post e restituisce 201 con id e slug', async () => {
    const res = await createPost({ postType: 'post', title: 'Hello World', status: 'draft' })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: number; slug: string; title: string }>()
    expect(body.title).toBe('Hello World')
    expect(body.slug).toBe('hello-world')
    expect(body.id).toBeTypeOf('number')
  })

  it('genera slug automaticamente dal titolo', async () => {
    const res = await createPost({ postType: 'post', title: 'Titolo Con Accenti: Café', status: 'draft' })
    expect(res.statusCode).toBe(201)
    expect(res.json<{ slug: string }>().slug).toBe('titolo-con-accenti-cafe')
  })

  it('garantisce unicità dello slug con suffisso numerico', async () => {
    await createPost({ postType: 'post', title: 'Duplicate', status: 'draft' })
    const res = await createPost({ postType: 'post', title: 'Duplicate', status: 'draft' })

    expect(res.statusCode).toBe(201)
    expect(res.json<{ slug: string }>().slug).toBe('duplicate-2')
  })

  it('senza token → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/posts',
      payload: { postType: 'post', title: 'No Auth', status: 'draft' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('postType sconosciuto → 422', async () => {
    const res = await createPost({ postType: 'nonexistent', title: 'Bad Type', status: 'draft' })
    expect(res.statusCode).toBe(422)
  })
})

// ─── Lista post ──────────────────────────────────────────────────────────────

describe('GET /api/v1/posts', () => {
  it('restituisce lista paginata', async () => {
    await createPost({ postType: 'post', title: 'Post Uno', status: 'published' })
    await createPost({ postType: 'post', title: 'Post Due', status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: unknown[]; total: number }>()
    expect(body.data.length).toBeGreaterThanOrEqual(2)
    expect(body.total).toBeGreaterThanOrEqual(2)
  })

  it('filtra per status', async () => {
    await createPost({ postType: 'post', title: 'Pubblicato', status: 'published' })
    await createPost({ postType: 'post', title: 'Bozza',      status: 'draft' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post&status=draft' })
    const body = res.json<{ data: Array<{ status: string }> }>()

    expect(body.data.every(p => p.status === 'draft')).toBe(true)
  })
})

// ─── Dettaglio post ──────────────────────────────────────────────────────────

describe('GET /api/v1/posts/:idOrSlug', () => {
  it('recupera per slug', async () => {
    await createPost({ postType: 'post', title: 'My Article', status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts/my-article' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ title: string }>().title).toBe('My Article')
  })

  it('recupera per id numerico', async () => {
    const created = (await createPost({ postType: 'post', title: 'By ID', status: 'draft' }))
      .json<{ id: number }>()

    const res = await app.inject({ method: 'GET', url: `/api/v1/posts/${created.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ id: number }>().id).toBe(created.id)
  })

  it('post inesistente → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/posts/slug-che-non-esiste' })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Aggiornamento post ──────────────────────────────────────────────────────

describe('PUT /api/v1/posts/:id', () => {
  it('aggiorna titolo e crea una revisione', async () => {
    const created = (await createPost({ postType: 'post', title: 'Original', status: 'draft' }))
      .json<{ id: number }>()

    const updateRes = await app.inject({
      method:  'PUT',
      url:     `/api/v1/posts/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: 'Updated' },
    })
    expect(updateRes.statusCode).toBe(200)
    expect(updateRes.json<{ title: string }>().title).toBe('Updated')

    // Verifica che sia stata creata una revisione
    const revisionsRes = await app.inject({
      method:  'GET',
      url:     `/api/v1/posts/${created.id}/revisions`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(revisionsRes.statusCode).toBe(200)
    const revisions = revisionsRes.json<Array<{ title: string }>>()
    expect(revisions.length).toBeGreaterThanOrEqual(1)
    expect(revisions[0]?.title).toBe('Original')
  })

  it('senza token → 401', async () => {
    const created = (await createPost({ postType: 'post', title: 'To Update', status: 'draft' }))
      .json<{ id: number }>()

    const res = await app.inject({
      method:  'PUT',
      url:     `/api/v1/posts/${created.id}`,
      payload: { title: 'Hack' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Eliminazione post ───────────────────────────────────────────────────────

describe('DELETE /api/v1/posts/:id', () => {
  it('soft delete: sposta in trash', async () => {
    const created = (await createPost({ postType: 'post', title: 'To Delete', status: 'published' }))
      .json<{ id: number }>()

    const delRes = await app.inject({
      method:  'DELETE',
      url:     `/api/v1/posts/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(delRes.statusCode).toBe(204)

    // Il post è ora in trash, non più in lista risultati normali
    const getRes = await app.inject({ method: 'GET', url: `/api/v1/posts/${created.id}` })
    // Il post nel trash non è più accessibile come post normale
    expect([404, 200]).toContain(getRes.statusCode)
    if (getRes.statusCode === 200) {
      expect(getRes.json<{ status: string }>().status).toBe('trash')
    }
  })

  it('senza token → 401', async () => {
    const created = (await createPost({ postType: 'post', title: 'Protected', status: 'draft' }))
      .json<{ id: number }>()

    const res = await app.inject({
      method: 'DELETE',
      url:    `/api/v1/posts/${created.id}`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Filtri avanzati lista post ──────────────────────────────────────────────

describe('GET /api/v1/posts — ricerca e filtri avanzati', () => {
  it('cerca nel titolo', async () => {
    await createPost({ postType: 'post', title: 'Articolo sul clima', status: 'published' })
    await createPost({ postType: 'post', title: 'Note varie',        status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post&search=clima' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ title: string }> }>()
    expect(body.data.length).toBe(1)
    expect(body.data[0]?.title).toBe('Articolo sul clima')
  })

  it('cerca nel contenuto', async () => {
    await createPost({ postType: 'post', title: 'Post A', content: 'Testo che parla di ecologia', status: 'published' })
    await createPost({ postType: 'post', title: 'Post B', content: 'Contenuto generico',          status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post&search=ecologia' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ title: string }> }>()
    expect(body.data.length).toBe(1)
    expect(body.data[0]?.title).toBe('Post A')
  })

  it('filtra per authorId', async () => {
    // Crea un post con l'admin — ottieni il suo userId dal post creato
    const created = (await createPost({ postType: 'post', title: 'Admin Post', status: 'published' }))
      .json<{ id: number; authorId: number }>()

    const adminId = created.authorId

    const res = await app.inject({ method: 'GET', url: `/api/v1/posts?type=post&authorId=${adminId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ authorId: number }> }>()
    expect(body.data.every(p => p.authorId === adminId)).toBe(true)
  })

  it('filtra per authorId inesistente restituisce lista vuota', async () => {
    await createPost({ postType: 'post', title: 'Qualcosa', status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post&authorId=99999' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ data: unknown[] }>().data.length).toBe(0)
  })

  it('filtra per dateFrom', async () => {
    const testStart = Math.floor(Date.now() / 1000)
    const past      = testStart - 10000

    // Inocula un post con timestamp passato direttamente nel DB
    db.insert(posts).values({
      postType:  'post',
      title:     'Post Vecchio',
      slug:      'post-vecchio',
      content:   '',
      fields:    '{}',
      status:    'published',
      authorId:  null,
      createdAt: past,
      updatedAt: past,
    }).run()
    // Post Recente viene creato dopo testStart → createdAt >= testStart
    await createPost({ postType: 'post', title: 'Post Recente', status: 'published' })

    // Filtra dalla soglia testStart - 1 (include Post Recente, esclude Post Vecchio)
    const dateFrom = testStart - 1
    const res = await app.inject({ method: 'GET', url: `/api/v1/posts?type=post&status=any&dateFrom=${dateFrom}` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Array<{ title: string; createdAt: number }> }>()
    expect(body.data.every(p => p.createdAt >= dateFrom)).toBe(true)
    expect(body.data.some(p => p.title === 'Post Recente')).toBe(true)
    expect(body.data.some(p => p.title === 'Post Vecchio')).toBe(false)
  })

  it('ordina per titolo asc', async () => {
    await createPost({ postType: 'post', title: 'Zebra', status: 'published' })
    await createPost({ postType: 'post', title: 'Alfa',  status: 'published' })
    await createPost({ postType: 'post', title: 'Mela',  status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post&orderBy=title&order=asc' })
    expect(res.statusCode).toBe(200)
    const titles = res.json<{ data: Array<{ title: string }> }>().data.map(p => p.title)
    expect(titles).toEqual([...titles].sort())
  })

  it('ordina per titolo desc', async () => {
    await createPost({ postType: 'post', title: 'Zebra', status: 'published' })
    await createPost({ postType: 'post', title: 'Alfa',  status: 'published' })

    const res = await app.inject({ method: 'GET', url: '/api/v1/posts?type=post&orderBy=title&order=desc' })
    expect(res.statusCode).toBe(200)
    const titles = res.json<{ data: Array<{ title: string }> }>().data.map(p => p.title)
    expect(titles).toEqual([...titles].sort().reverse())
  })
})
