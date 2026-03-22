---
applyTo: "packages/core/src/test/**,packages/core/vitest.config.ts"
description: "Use when writing tests, unit tests, integration tests, vitest setup, test helpers, mocking, or running the test suite for the core package."
---

# Istruzioni — Test (Vitest)

**Framework:** Vitest con globals abilitati (`describe`, `it`, `expect`, `vi`, `beforeAll`, `afterAll`, `beforeEach` disponibili senza import esplicito — ma importarli esplicitamente per chiarezza).

## Struttura cartelle

```
packages/core/src/test/
  setup.ts           # Eseguito prima di ogni worker: runMigrations() + seedDatabase()
  helpers.ts         # createTestApp(), loginAs()
  unit/              # Test senza database o Fastify
  integration/       # Test che usano l'app Fastify completa via inject()
```

## Configurazione Vitest (`vitest.config.ts`)

```ts
// Variabili d'ambiente iniettate per i test:
{
  DATABASE_PATH:       ':memory:',           // SQLite in-memory, reset ad ogni run
  JWT_SECRET:          'test-jwt-secret-at-least-32-chars!!',
  JWT_REFRESH_SECRET:  'test-refresh-secret-atleast-32chars!',
  ADMIN_PASSWORD:      'Test@Password123!',
  NODE_ENV:            'test',
}
```

Non impostare queste variabili manualmente nei test — sono già disponibili.

## Setup (`src/test/setup.ts`)

Eseguito automaticamente prima di ogni test worker. Applica migration e seed sul DB in-memory. I test di integrazione partono sempre con il DB inizializzato (utente admin + ruoli default).

## Helper principali (`src/test/helpers.ts`)

```ts
// Crea un'istanza Fastify completa per i test di integrazione
const app = await createTestApp()

// Ottiene un access token per un utente esistente (usa app.inject internamente)
const token = await loginAs(app, 'admin', 'Test@Password123!')

// Cleanup in afterAll
afterAll(async () => { await app.close() })
```

## Pattern test di integrazione

```ts
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
  // Pulisce i dati creati dai test precedenti (il DB è condiviso tra test nella stessa suite)
  db.delete(posts).where(eq(posts.postType, 'post')).run()
})

it('esempio route test', async () => {
  const res = await app.inject({
    method:  'POST',
    url:     '/api/v1/posts',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { postType: 'post', title: 'Test Post', status: 'draft' },
  })

  expect(res.statusCode).toBe(201)
  const body = res.json<{ id: number; slug: string }>()
  expect(body.slug).toBe('test-post')
})
```

## Pattern test unitari

```ts
import { describe, it, expect, vi } from 'vitest'
import { HookManager } from '../../hooks/HookManager.js'

describe('MyModule', () => {
  it('fa qualcosa di corretto', () => {
    const hooks = new HookManager()
    const spy = vi.fn()
    hooks.addAction('test', spy)
    await hooks.doAction('test', 'arg')
    expect(spy).toHaveBeenCalledWith('arg')
  })
})
```

## Regole

- I test unitari non devono mai fare query DB — usare istanze isolate o mock.
- I test di integrazione usano `app.inject()` (Fastify built-in) — non fare chiamate HTTP reali.
- `beforeEach` pulisce i dati rilevanti per la suite corrente — non fare `DELETE` di tutto in modo indiscriminato.
- Il DB in-memory è condiviso tra tutti i test dello stesso worker. Isolarlo con `beforeEach` cleanup.
- Usare `vi.fn()` per mock di funzioni, `vi.spyOn()` per spy su moduli/oggetti.
- Errori async: `await expect(promise).rejects.toThrow('messaggio')`.
- Non usare `setTimeout` nei test — usare `vi.useFakeTimers()` se necessario.

## Eseguire i test

```bash
cd packages/core
pnpm test          # run & watch
pnpm test --run    # run once (CI)
pnpm test --run --reporter=verbose
```
