---
applyTo: "packages/core/src/db/**"
description: "Use when working on the database layer: Drizzle ORM schema, SQLite migrations, seed data, DB client, tables for posts, taxonomies, terms, users, roles, revisions, custom field index, media."
---

# Istruzioni — Database (Drizzle + SQLite)

**Documentazione di riferimento:** `docs/02-database.md`

## ORM e client

- Usare sempre **Drizzle ORM** con `better-sqlite3`. Non scrivere SQL raw a meno che Drizzle non lo supporti.
- Il client è un **singleton** esportato da `src/db/client.ts` come `export const db`. Non istanziare nuovi client altrove.
- `better-sqlite3` è **sincrono** — le query non sono Promise. Non usare `await` sulle query Drizzle con questo driver.
- Pragma attivi al boot: `journal_mode = WAL` (performance), `foreign_keys = ON` (integrità referenziale).
- Usare `integer('created_at', { mode: 'timestamp' })` per i campi datetime (Unix timestamp, non stringhe ISO).

## Tipo Tx — transazioni

```ts
// Da src/db/client.ts, usare per tipizzare funzioni helper che accettano sia db che una tx aperta
import type { Tx } from '../db/client.js'

function myHelper(tx: Tx, postId: number) {
  tx.delete(postFieldIndex).where(eq(postFieldIndex.postId, postId)).run()
}

// Usare db.transaction per operazioni atomiche composte
db.transaction(tx => {
  createRevision(tx, existingPost)
  tx.update(posts).set(updatedFields).where(eq(posts.id, id)).run()
  syncFieldIndex(tx, id, fields, fieldDefs)
})
```

## Schema completo — tabelle core (`src/db/schema.ts`)

| Tabella | Descrizione |
|---|---|
| `roles` | Ruoli con `capabilities` come JSON array (`TEXT`) |
| `users` | Utenti con `roleId` FK, `passwordHash` (argon2) |
| `posts` | Post con `postType`, `fields` (JSON blob), `status` |
| `post_field_index` | Indice queryable dei custom fields (DELETE+INSERT su update) |
| `post_revisions` | Snapshot dei post prima di ogni update |
| `taxonomies` | Definizioni taxonomy (sincronizzate dal registry al boot) |
| `terms` | Termini con `parentId` self-referencing (gerarchie) |
| `post_terms` | Associazione N:M post↔term (PK composta) |
| `plugin_status` | Stato attivi/inattivi di ogni plugin |
| `refresh_tokens` | Hash dei refresh token (mai in chiaro) con scadenza |

**Tabelle plugin-managed** (non nel core schema): `media` (gestita dal plugin media), `field_groups` / `field_items` (gestite dal plugin fields). I plugin creano le proprie tabelle in `onActivate()` con `CREATE TABLE IF NOT EXISTS`.

## Schema Drizzle

- Tutti i `sqliteTable()` core sono in `src/db/schema.ts`, importati esplicitamente dove servono.
- Nomi tabelle in `snake_case` (es. `post_field_index`), nomi colonne in `camelCase` nel codice Drizzle.
- Definire sempre i constraint (`notNull()`, `unique()`, `references()`) nello schema, non a mano nelle query.
- Gli indici critici definiti nello schema:
  - `post_field_index`: indice su `(fieldName, stringValue)` e `(fieldName, numberValue)`
  - `posts`: indice unico su `(postType, slug)`
  - `terms`: indice unico su `(taxonomyId, slug)`
  - `refresh_tokens`: indice su `userId`

## Pattern query

- Usare `db.select().from(table).where(...)` stile fluente — non `db.query.*` a meno che non serva il relational.
- Per le query con filtri dinamici (es. `GET /posts` con molti query param opzionali): costruire la lista `where` come array e fare `.where(and(...conditions))`.
- Per aggiornamenti `post_field_index`: sempre **DELETE + INSERT**, non UPDATE:
  ```ts
  tx.delete(postFieldIndex).where(eq(postFieldIndex.postId, id)).run()
  tx.insert(postFieldIndex).values(newRows).run()
  ```

## Migration e seed

- Le migration sono generate con `drizzle-kit generate` e applicate con `drizzle-kit migrate` — mai modificarle a mano.
- Il seed (`src/db/seed.ts`) controlla sempre se i dati esistono già prima di inserirli (idempotente).
- Seed al primo avvio: ruoli default (`administrator`, `editor`, `author`) + utente admin con password da `process.env.ADMIN_PASSWORD`.

## Capabilities (JSON in DB)

- Il campo `capabilities` in `roles` è un JSON array di stringhe, serializzato come `TEXT` in SQLite.
- Sempre parse/stringify esplicito: `JSON.parse(role.capabilities)` e `JSON.stringify(capabilities)`.
- Non fidarsi del tipo raw — validare che sia un array di stringhe dopo il parse.
