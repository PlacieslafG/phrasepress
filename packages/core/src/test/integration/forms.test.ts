import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { registerAuth } from '../../auth/jwt.js'
import { HookManager } from '../../hooks/HookManager.js'
import { CodexRegistry } from '../../codices/registry.js'
import { VocabularyRegistry } from '../../vocabularies/registry.js'
import { PluginLoader } from '../../plugins/PluginLoader.js'
import { authRoutes } from '../../api/index.js'
import { loginAs } from '../helpers.js'
import type { PluginContext } from '../../plugins/types.js'

// Import dal plugin forms — path relativo fuori dal package core, valido in Vitest con esbuild
// @ts-ignore — cross-package relative import, non nel tsconfig.include di core
import { createTables, ppForms, ppFormSubmissions } from '../../../../plugins/forms/src/db.js'
// @ts-ignore
import { registerAdminRoutes } from '../../../../plugins/forms/src/admin-routes.js'
// @ts-ignore
import { registerPublicRoutes } from '../../../../plugins/forms/src/public-routes.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

async function createFormsTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })

  await registerAuth(fastify)

  const hooks       = new HookManager()
  const codices     = new CodexRegistry()
  const vocabularies = new VocabularyRegistry()

  const ctx: PluginContext = {
    hooks,
    codices,
    vocabularies,
    postTypes:  codices,
    taxonomies: vocabularies,
    db,
    fastify,
    config: { codices: [], vocabularies: [], plugins: [] },
  }

  // Crea le tabelle del plugin (normalmente fatto in onActivate)
  createTables(db)

  await fastify.register(async (app) => {
    // Route auth necessarie per loginAs()
    await app.register(authRoutes, { prefix: '/auth' })
    // Route del plugin forms
    await app.register(async (formsApp) => {
      await registerAdminRoutes(formsApp, ctx)
      await registerPublicRoutes(formsApp, ctx)
    }, { prefix: '/plugins/phrasepress-forms' })
  }, { prefix: '/api/v1' })

  const loader = new PluginLoader([], ctx)
  await loader.loadAll()

  await fastify.ready()
  return fastify
}

let app: FastifyInstance
let adminToken: string

beforeAll(async () => {
  app = await createFormsTestApp()
  adminToken = await loginAs(app, 'admin', 'Test@Password123!')
})

afterAll(async () => { await app.close() })

beforeEach(() => {
  // Pulisce i dati del plugin tra un test e l'altro
  db.delete(ppFormSubmissions).run()
  db.delete(ppForms).run()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FormPayload = {
  name:         string
  slug:         string
  description?: string
  fields?:      unknown[]
  status?:      string
}

async function createForm(payload: FormPayload) {
  return app.inject({
    method:  'POST',
    url:     '/api/v1/plugins/phrasepress-forms/forms',
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  })
}

// ─── Admin routes — CRUD form ─────────────────────────────────────────────────

describe('POST /api/v1/plugins/phrasepress-forms/forms', () => {
  it('crea un form e restituisce 201', async () => {
    const res = await createForm({ name: 'Contattaci', slug: 'contattaci' })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: string; name: string; slug: string; status: string; fields: [] }>()
    expect(body.name).toBe('Contattaci')
    expect(body.slug).toBe('contattaci')
    expect(body.status).toBe('active')
    expect(body.fields).toEqual([])
  })

  it('crea un form con campi', async () => {
    const fields = [
      { id: 'f1', name: 'email', label: 'Email', type: 'email', required: true, sortOrder: 0 },
      { id: 'f2', name: 'messaggio', label: 'Messaggio', type: 'textarea', required: false, sortOrder: 1 },
    ]
    const res = await createForm({ name: 'Form con campi', slug: 'form-con-campi', fields })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ fields: typeof fields }>()
    expect(body.fields).toHaveLength(2)
    expect(body.fields[0]!.name).toBe('email')
  })

  it('rifiuta un form senza nome (400)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/forms',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { slug: 'senza-nome' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('restituisce 401 senza autenticazione', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/forms',
      payload: { name: 'Test', slug: 'test' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/v1/plugins/phrasepress-forms/forms', () => {
  it('restituisce lista vuota se non ci sono form', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/plugins/phrasepress-forms/forms',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('restituisce i form creati', async () => {
    await createForm({ name: 'Form A', slug: 'form-a' })
    await createForm({ name: 'Form B', slug: 'form-b' })

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/plugins/phrasepress-forms/forms',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(2)
  })
})

describe('GET /api/v1/plugins/phrasepress-forms/forms/:id', () => {
  it('restituisce il form per ID', async () => {
    const created = (await createForm({ name: 'Dettaglio', slug: 'dettaglio' })).json<{ id: string }>()

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/plugins/phrasepress-forms/forms/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ name: string }>().name).toBe('Dettaglio')
  })

  it('restituisce 404 per ID inesistente', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/plugins/phrasepress-forms/forms/non-esiste',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PUT /api/v1/plugins/phrasepress-forms/forms/:id', () => {
  it('aggiorna un form esistente', async () => {
    const created = (await createForm({ name: 'Originale', slug: 'originale' })).json<{ id: string }>()

    const res = await app.inject({
      method:  'PUT',
      url:     `/api/v1/plugins/phrasepress-forms/forms/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Aggiornato', slug: 'aggiornato', status: 'inactive' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ name: string; status: string }>()
    expect(body.name).toBe('Aggiornato')
    expect(body.status).toBe('inactive')
  })
})

describe('DELETE /api/v1/plugins/phrasepress-forms/forms/:id', () => {
  it('elimina un form e restituisce 204', async () => {
    const created = (await createForm({ name: 'Da eliminare', slug: 'da-eliminare' })).json<{ id: string }>()

    const del = await app.inject({
      method:  'DELETE',
      url:     `/api/v1/plugins/phrasepress-forms/forms/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(204)

    const get = await app.inject({
      method:  'GET',
      url:     `/api/v1/plugins/phrasepress-forms/forms/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(get.statusCode).toBe(404)
  })
})

// ─── Submissions admin ────────────────────────────────────────────────────────

describe('GET /api/v1/plugins/phrasepress-forms/forms/:id/submissions', () => {
  it('restituisce lista vuota inizialmente con paginazione', async () => {
    const form = (await createForm({ name: 'Con submission', slug: 'con-submission' })).json<{ id: string }>()

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/plugins/phrasepress-forms/forms/${form.id}/submissions`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: []; total: number; page: number; limit: number }>()
    expect(body.data).toEqual([])
    expect(body.total).toBe(0)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })
})

// ─── Route pubbliche ──────────────────────────────────────────────────────────

describe('GET /api/v1/plugins/phrasepress-forms/public/forms/:slug', () => {
  it('restituisce definizione pubblica del form', async () => {
    await createForm({ name: 'Pubblico', slug: 'pubblico' })

    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/plugins/phrasepress-forms/public/forms/pubblico',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ name: string; slug: string }>()
    expect(body.name).toBe('Pubblico')
    expect(body.slug).toBe('pubblico')
  })

  it('restituisce 404 per form inattivo', async () => {
    await createForm({ name: 'Inattivo', slug: 'inattivo', status: 'inactive' })

    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/plugins/phrasepress-forms/public/forms/inattivo',
    })
    expect(res.statusCode).toBe(404)
  })

  it('restituisce 404 per slug inesistente', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/plugins/phrasepress-forms/public/forms/non-esiste',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/v1/plugins/phrasepress-forms/public/submit/:slug', () => {
  const fields = [
    { id: 'f1', name: 'nome', label: 'Nome', type: 'text',  required: true,  sortOrder: 0 },
    { id: 'f2', name: 'email', label: 'Email', type: 'email', required: true, sortOrder: 1 },
    { id: 'f3', name: 'messaggio', label: 'Messaggio', type: 'textarea', required: false, sortOrder: 2 },
  ]

  beforeEach(async () => {
    await createForm({ name: 'Contatto', slug: 'contatto', fields })
  })

  it('accetta una submission valida e restituisce 201', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/public/submit/contatto',
      payload: { nome: 'Mario', email: 'mario@example.com', messaggio: 'Ciao!' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: string; message: string }>()
    expect(body.id).toBeTruthy()
    expect(body.message).toBe('Form submitted successfully')
  })

  it('rifiuta submission con campo required mancante (422)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/public/submit/contatto',
      payload: { nome: 'Mario' }, // email mancante
    })
    expect(res.statusCode).toBe(422)
    const body = res.json<{ errors: Array<{ field: string }> }>()
    expect(body.errors.some(e => e.field === 'email')).toBe(true)
  })

  it('rifiuta submission con email non valida (422)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/public/submit/contatto',
      payload: { nome: 'Mario', email: 'non-una-email' },
    })
    expect(res.statusCode).toBe(422)
    const body = res.json<{ errors: Array<{ field: string }> }>()
    expect(body.errors.some(e => e.field === 'email')).toBe(true)
  })

  it('ignora campi extra non definiti nel form', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/public/submit/contatto',
      payload: { nome: 'Mario', email: 'mario@example.com', campoExtra: 'valore' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('restituisce 404 per slug inesistente', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/public/submit/non-esiste',
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/v1/plugins/phrasepress-forms/submissions/:id', () => {
  it('elimina una submission esistente', async () => {
    // Crea il form e invia una submission
    await createForm({
      name:   'Del Sub',
      slug:   'del-sub',
      fields: [{ id: 'f1', name: 'nome', label: 'Nome', type: 'text', required: true, sortOrder: 0 }],
    })
    const submitRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/plugins/phrasepress-forms/public/submit/del-sub',
      payload: { nome: 'Test' },
    })
    const { id } = submitRes.json<{ id: string }>()

    const res = await app.inject({
      method:  'DELETE',
      url:     `/api/v1/plugins/phrasepress-forms/submissions/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(204)
  })
})
