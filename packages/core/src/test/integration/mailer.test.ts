import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
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

// @ts-ignore — cross-package relative import
import { createTables, ppMailerConfig, ppMailerNotifications } from '../../../../plugins/mailer/src/db.js'
// @ts-ignore
import { registerMailerRoutes } from '../../../../plugins/mailer/src/routes.js'

// Mock sendMail direttamente per evitare invii SMTP reali durante i test
vi.mock('../../../../plugins/mailer/src/mailer.js', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  buildSubmissionHtml: vi.fn().mockReturnValue('<html>test</html>'),
}))

// ─── Setup ────────────────────────────────────────────────────────────────────

async function createMailerTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })
  await registerAuth(fastify)

  const ctx: PluginContext = {
    hooks:        new HookManager(),
    codices:      new CodexRegistry(),
    vocabularies: new VocabularyRegistry(),
    postTypes:    new CodexRegistry(),
    taxonomies:   new VocabularyRegistry(),
    db,
    fastify,
    config: { codices: [], vocabularies: [], plugins: [] },
  }

  createTables(db)

  await fastify.register(async (app) => {
    await app.register(authRoutes, { prefix: '/auth' })
    await app.register(async (mailerApp) => {
      await registerMailerRoutes(mailerApp, ctx)
    }, { prefix: '/plugins/phrasepress-mailer' })
  }, { prefix: '/api/v1' })

  const loader = new PluginLoader([], ctx)
  await loader.loadAll()

  await fastify.ready()
  return fastify
}

let app: FastifyInstance
let adminToken: string

beforeAll(async () => {
  app = await createMailerTestApp()
  adminToken = await loginAs(app, 'admin', 'Test@Password123!')
})

afterAll(async () => { await app.close() })

beforeEach(() => {
  db.delete(ppMailerNotifications).run()
  // Ripristina settings a valori vuoti
  db.update(ppMailerConfig)
    .set({ host: '', port: 587, secure: 0, authUser: '', authPass: '', fromName: '', fromEmail: '' })
    .run()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = '/api/v1/plugins/phrasepress-mailer'

function authHeader() {
  return { authorization: `Bearer ${adminToken}` }
}

async function putSettings(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method:  'PUT',
    url:     `${BASE}/settings`,
    headers: authHeader(),
    payload: {
      host:      'smtp.example.com',
      port:      587,
      secure:    false,
      fromName:  'Test Site',
      fromEmail: 'no-reply@example.com',
      authUser:  'user@example.com',
      ...overrides,
    },
  })
}

async function createNotification(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method:  'POST',
    url:     `${BASE}/notifications`,
    headers: authHeader(),
    payload: {
      formId:  'form-test-id',
      toEmail: 'admin@example.com',
      ...overrides,
    },
  })
}

// ─── GET /settings ────────────────────────────────────────────────────────────

describe('GET /settings', () => {
  it('restituisce le impostazioni mascherate (nessuna password in chiaro)', async () => {
    const res = await app.inject({ method: 'GET', url: `${BASE}/settings`, headers: authHeader() })

    expect(res.statusCode).toBe(200)
    const body = res.json<Record<string, unknown>>()
    expect(body).toHaveProperty('host')
    expect(body).toHaveProperty('hasPassword')
    expect(body).not.toHaveProperty('authPass')
    expect(body.hasPassword).toBe(false)
  })

  it('restituisce 401 senza token', async () => {
    const res = await app.inject({ method: 'GET', url: `${BASE}/settings` })
    expect(res.statusCode).toBe(401)
  })
})

// ─── PUT /settings ────────────────────────────────────────────────────────────

describe('PUT /settings', () => {
  it('aggiorna le impostazioni SMTP', async () => {
    const res = await putSettings()

    expect(res.statusCode).toBe(200)
    const body = res.json<{ host: string; port: number; hasPassword: boolean }>()
    expect(body.host).toBe('smtp.example.com')
    expect(body.port).toBe(587)
    expect(body.hasPassword).toBe(false)
  })

  it('salva la password quando fornita e hasPassword diventa true', async () => {
    await putSettings({ authPass: 'secretpassword' })
    const res = await app.inject({ method: 'GET', url: `${BASE}/settings`, headers: authHeader() })

    const body = res.json<{ hasPassword: boolean }>()
    expect(body.hasPassword).toBe(true)
  })

  it('mantiene la password esistente se authPass è stringa vuota', async () => {
    // Prima imposta una password
    await putSettings({ authPass: 'originalpassword' })
    // Poi salva senza password
    await putSettings({ authPass: '' })

    const res = await app.inject({ method: 'GET', url: `${BASE}/settings`, headers: authHeader() })
    const body = res.json<{ hasPassword: boolean }>()
    expect(body.hasPassword).toBe(true)
  })

  it('la password non viene mai restituita in chiaro', async () => {
    const res = await putSettings({ authPass: 'noexposo' })
    const body = res.json<Record<string, unknown>>()
    expect(body).not.toHaveProperty('authPass')
    expect(Object.values(body)).not.toContain('noexposo')
  })

  it('restituisce 400 se mancano campi obbligatori', async () => {
    const res = await app.inject({
      method:  'PUT',
      url:     `${BASE}/settings`,
      headers: authHeader(),
      payload: { host: 'smtp.example.com' },     // manca port, secure, fromName, fromEmail, authUser
    })
    expect(res.statusCode).toBe(400)
  })

  it('restituisce 401 senza token', async () => {
    const res = await app.inject({
      method:  'PUT',
      url:     `${BASE}/settings`,
      payload: { host: 'smtp.example.com', port: 587, secure: false, fromName: 'X', fromEmail: 'x@x.com', authUser: 'x' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── POST /notifications ──────────────────────────────────────────────────────

describe('POST /notifications', () => {
  it('crea una regola di notifica', async () => {
    const res = await createNotification()

    expect(res.statusCode).toBe(201)
    const body = res.json<{ id: string; formId: string; toEmail: string; enabled: boolean }>()
    expect(body.id).toBeDefined()
    expect(body.formId).toBe('form-test-id')
    expect(body.toEmail).toBe('admin@example.com')
    expect(body.enabled).toBe(true)
  })

  it('usa l\'oggetto di default se non fornito', async () => {
    const res = await createNotification()
    const body = res.json<{ subjectTemplate: string }>()
    expect(body.subjectTemplate).toBe('Nuova submission: {form_name}')
  })

  it('accetta subjectTemplate personalizzato', async () => {
    const res = await createNotification({ subjectTemplate: 'Contatto da {form_name}' })
    const body = res.json<{ subjectTemplate: string }>()
    expect(body.subjectTemplate).toBe('Contatto da {form_name}')
  })

  it('restituisce 400 se manca formId', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `${BASE}/notifications`,
      headers: authHeader(),
      payload: { toEmail: 'x@x.com' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('restituisce 400 se manca toEmail', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `${BASE}/notifications`,
      headers: authHeader(),
      payload: { formId: 'form-id' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── GET /notifications ───────────────────────────────────────────────────────

describe('GET /notifications', () => {
  it('restituisce lista vuota se non ci sono notifiche', async () => {
    const res = await app.inject({ method: 'GET', url: `${BASE}/notifications`, headers: authHeader() })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('restituisce le notifiche create', async () => {
    await createNotification()
    await createNotification({ formId: 'form-2', toEmail: 'other@example.com' })

    const res = await app.inject({ method: 'GET', url: `${BASE}/notifications`, headers: authHeader() })
    expect(res.json()).toHaveLength(2)
  })
})

// ─── PUT /notifications/:id ───────────────────────────────────────────────────

describe('PUT /notifications/:id', () => {
  it('aggiorna una notifica', async () => {
    const created = (await createNotification()).json<{ id: string }>()

    const res = await app.inject({
      method:  'PUT',
      url:     `${BASE}/notifications/${created.id}`,
      headers: authHeader(),
      payload: { formId: 'form-test-id', toEmail: 'nuovo@example.com', enabled: false },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ toEmail: string; enabled: boolean }>()
    expect(body.toEmail).toBe('nuovo@example.com')
    expect(body.enabled).toBe(false)
  })

  it('restituisce 404 per id inesistente', async () => {
    const res = await app.inject({
      method:  'PUT',
      url:     `${BASE}/notifications/non-existent-id`,
      headers: authHeader(),
      payload: { formId: 'f', toEmail: 't@t.com' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── DELETE /notifications/:id ────────────────────────────────────────────────

describe('DELETE /notifications/:id', () => {
  it('elimina una notifica', async () => {
    const { id } = (await createNotification()).json<{ id: string }>()

    const res = await app.inject({
      method:  'DELETE',
      url:     `${BASE}/notifications/${id}`,
      headers: authHeader(),
    })
    expect(res.statusCode).toBe(204)

    // Verifica che sia stata eliminata
    const list = await app.inject({ method: 'GET', url: `${BASE}/notifications`, headers: authHeader() })
    expect(list.json()).toHaveLength(0)
  })

  it('restituisce 404 per id inesistente', async () => {
    const res = await app.inject({
      method:  'DELETE',
      url:     `${BASE}/notifications/non-existent-id`,
      headers: authHeader(),
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── POST /test ───────────────────────────────────────────────────────────────

describe('POST /test', () => {
  it('invia email di test e restituisce { success: true }', async () => {
    // Prima configura SMTP così c'è un host valido
    await putSettings({ authPass: 'pw' })

    const res = await app.inject({
      method:  'POST',
      url:     `${BASE}/test`,
      headers: authHeader(),
      payload: { toEmail: 'test@example.com' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
  })

  it('restituisce 400 se manca toEmail', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `${BASE}/test`,
      headers: authHeader(),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})
