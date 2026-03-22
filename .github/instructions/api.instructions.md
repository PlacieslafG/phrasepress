---
applyTo: "packages/core/src/api/**"
description: "Use when writing or modifying Fastify API routes: REST endpoints, JSON Schema validation, request/response types, route registration, error handling, middleware, posts API, taxonomies API, users API, roles API, auth routes, plugins API."
---

# Istruzioni — API Routes (Fastify)

**Documentazione di riferimento:** `docs/03-post-types.md`, `docs/04-taxonomies.md`, `docs/07-auth.md`

## Struttura route

- Ogni area funzionale ha il suo file Fastify plugin: `posts.ts`, `taxonomies.ts`, `auth.ts`, `users.ts`, `roles.ts`, `plugins.ts`, `meta.ts`.
- I plugin Fastify sono registrati in `src/api/index.ts` con prefisso `/api/v1`.
- Usare `fastify.register(plugin, { prefix: '/posts' })` — non concatenare prefissi a mano nelle route.

## Route meta disponibili (`src/api/meta.ts`)

| Route | Descrizione |
|---|---|
| `GET /api/v1/post-types` | Lista dei post type registrati (filtrata da hook `post_types.meta`) |
| `GET /api/v1/stats` | Conteggi post per tipo e stato (`{ [postType]: { published, draft, trash, total } }`) |

Entrambe richiedono `authenticate`. Le route meta non richiedono capability specifica — sono accessibili a qualsiasi utente autenticato.

## Schema validazione

- **Sempre** definire `schema: { body: ..., querystring: ..., params: ..., response: ... }` con JSON Schema per ogni route.
- Non validare input a mano con `if/throw` — usare lo schema Fastify. La validazione avviene automaticamente.
- Per i response schema: definire almeno lo schema `200`. Gli errori 4xx/5xx sono gestiti dall'error handler globale.
- Esempio pattern:
  ```ts
  fastify.post('/posts', {
    schema: {
      body: {
        type: 'object',
        required: ['postType', 'title'],
        properties: {
          postType: { type: 'string' },
          title:    { type: 'string', minLength: 1 },
          slug:     { type: 'string' },
          content:  { type: 'string' },
          status:   { type: 'string', enum: ['draft', 'published'] },
        }
      }
    }
  }, handler)
  ```

## Autenticazione e autorizzazione

- Usare il decorator `fastify.authenticate` (da `@fastify/jwt`) per verificare il token JWT.
- Usare il decorator `fastify.requireCapability('capability_name')` per il controllo permessi.
- Applicare entrambi come `preHandler` nella definizione della route:
  ```ts
  {
    preHandler: [fastify.authenticate, fastify.requireCapability('edit_posts')]
  }
  ```
- Non controllare i permessi within il handler — la logica di auth deve stare nel preHandler.

## Capabilities disponibili

`read`, `edit_posts`, `edit_others_posts`, `publish_posts`, `delete_posts`, `delete_others_posts`, `manage_terms`, `manage_users`, `manage_roles`, `manage_plugins`, `manage_options`, `upload_files`

## Risposta errori

- Usare `reply.status(404).send({ error: 'Post not found' })` per errori specifici.
- Non fare `throw new Error()` nei handler — Fastify lo gestisce, ma il messaggio potrebbe leakarsi in produzione.
- Per errori di validazione custom (es. slug duplicato): `reply.status(422).send({ error: 'Slug already exists', field: 'slug' })`.

## Transazioni DB nelle route

Per operazioni che coinvolgono più tabelle in modo atomico, usare `db.transaction()`:
```ts
db.transaction(tx => {
  createRevision(tx, existingPost, request.userId)  // PRIMA dell'update
  tx.update(posts).set(updated).where(eq(posts.id, id)).run()
  syncFieldIndex(tx, id, fields, fieldDefs)          // DELETE+INSERT
})
```
La `Tx` è importata da `'../db/client.js'` e tipizza il callback della transazione.

## Paginazione

- Pattern standard: `?page=1&limit=20` (default limit: 20, max: 100).
- Risposta paginata sempre in formato:
  ```ts
  { data: T[], total: number, page: number, limit: number }
  ```
- Usare `LIMIT` e `OFFSET` in SQLite: `offset = (page - 1) * limit`.

## Query filtri dinamici per i post

- I filtri su custom fields queryable usano la sintassi `?fieldName[op]=value` (es. `?price[lt]=50`).
- I filtri su taxonomy terms usano `?taxonomySlug=termSlug` (es. `?genre=fantasy`).
- Costruire le condizioni WHERE come array e combinarle con `and(...)` di Drizzle.
- JOIN con `post_field_index` solo quando il filtro è presente — non sempre.

## CORS e headers

- `@fastify/cors` configurato per accettare: qualsiasi `localhost` origine (dev) + origini da `CORS_ORIGIN` env (comma-separated).
- In produzione: impostare `CORS_ORIGIN` al dominio dell'admin.
- Il cookie refresh token deve avere: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in produzione.
- Rate limit globale: 200 richieste/minuto. La route `/api/v1/auth/login` ha un rate limit più restrittivo configurato separatamente.
