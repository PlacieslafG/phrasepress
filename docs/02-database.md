# Schema Database

PhrasePress usa **SQLite** via `better-sqlite3`, con **Drizzle ORM** per la type-safety dello schema e le migration. Il file di database è in `data/phrasepress.db` per default.

Il client database è un singleton: `packages/core/src/db/client.ts`. Le migration vengono applicate automaticamente all'avvio del server.

---

## Tabelle

### `roles`

Ruoli utente con capabilities JSON.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `name` | TEXT NOT NULL | Es. `Administrator` |
| `slug` | TEXT NOT NULL UNIQUE | Es. `administrator` |
| `capabilities` | TEXT NOT NULL DEFAULT `'[]'` | JSON `string[]` |

### `users`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `username` | TEXT NOT NULL UNIQUE | |
| `email` | TEXT NOT NULL UNIQUE | |
| `password_hash` | TEXT NOT NULL | Hash argon2 |
| `role_id` | INTEGER FK → `roles.id` | |
| `created_at` | INTEGER NOT NULL | Unix timestamp |

### `folios`

Ogni Folio è un'istanza di un Codex. Tutti i dati del contenuto (titolo, slug, content, campi custom) sono nel blob JSON `fields`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `codex` | TEXT NOT NULL | Nome del codex, es. `post`, `page`, custom |
| `stage` | TEXT NOT NULL DEFAULT `'draft'` | Fase del workflow, es. `draft`, `published`, `trash` |
| `fields` | TEXT NOT NULL DEFAULT `'{}'` | JSON blob: title, slug, content + campi custom |
| `author_id` | INTEGER FK → `users.id` | |
| `created_at` | INTEGER NOT NULL | Unix timestamp |
| `updated_at` | INTEGER NOT NULL | Unix timestamp |

**Indici:** `(codex, stage)`, `(codex, created_at)`

> **Nota:** non ci sono colonne separate per `title`, `slug`, `content`. Sono tutti campi nel blob `fields`. Questo consente blueprint completamente arbitrari per ogni Codex.

### `folio_field_index`

Indice per query filtrate veloci su campi con `queryable: true`. Aggiornato ad ogni salvataggio del folio (DELETE + INSERT per il folio).

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `folio_id` | INTEGER FK → `folios.id` ON DELETE CASCADE | |
| `field_name` | TEXT NOT NULL | |
| `string_value` | TEXT | Per campi di tipo string, select, date |
| `number_value` | REAL | Per campi di tipo number |

**Indici:** `(field_name, string_value)`, `(field_name, number_value)`, `(folio_id)`

### `folio_revisions`

Snapshot del folio creato automaticamente **prima** di ogni aggiornamento tramite `PUT /:codex/:id`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `folio_id` | INTEGER FK → `folios.id` ON DELETE CASCADE | |
| `stage` | TEXT NOT NULL | |
| `fields` | TEXT NOT NULL | JSON snapshot completo dei fields |
| `author_id` | INTEGER FK → `users.id` | |
| `created_at` | INTEGER NOT NULL | Unix timestamp |

### `folio_links`

Relazioni tipizzate tra folios (rimpiazza il tipo di campo `relationship` nel blob JSON).

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `from_folio_id` | INTEGER FK → `folios.id` ON DELETE CASCADE | |
| `from_field` | TEXT NOT NULL | Nome del campo Link nel Blueprint |
| `to_folio_id` | INTEGER FK → `folios.id` ON DELETE CASCADE | |
| `to_codex` | TEXT NOT NULL | Denormalizzato per query senza JOIN |
| `sort_order` | INTEGER NOT NULL DEFAULT `0` | |

### `vocabularies`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `name` | TEXT NOT NULL | Es. `Categories` |
| `slug` | TEXT NOT NULL UNIQUE | Es. `category` |
| `hierarchical` | INTEGER NOT NULL DEFAULT `0` | `0` = flat, `1` = hierarchical |

### `terms`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `vocabulary_id` | INTEGER FK → `vocabularies.id` ON DELETE CASCADE | |
| `name` | TEXT NOT NULL | |
| `slug` | TEXT NOT NULL | |
| `description` | TEXT NOT NULL DEFAULT `''` | |
| `parent_id` | INTEGER FK → `terms.id` (self-referential) | Null per root |

**Indici:** UNIQUE su `(vocabulary_id, slug)`

### `folio_terms`

Tabella di associazione N:M tra folios e terms. Nessuna colonna extra.

| Colonna | Tipo |
|---|---|
| `folio_id` | INTEGER FK → `folios.id` ON DELETE CASCADE |
| `term_id` | INTEGER FK → `terms.id` ON DELETE CASCADE |

**PK:** `(folio_id, term_id)`

### `plugin_status`

Stato di attivazione dei plugin.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `plugin_name` | TEXT NOT NULL UNIQUE | Es. `phrasepress-media` |
| `active` | INTEGER NOT NULL DEFAULT `0` | `0` = inattivo, `1` = attivo |
| `activated_at` | INTEGER | Unix timestamp ultima attivazione |

### `refresh_tokens`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `user_id` | INTEGER FK → `users.id` ON DELETE CASCADE | |
| `token_hash` | TEXT NOT NULL UNIQUE | SHA-256 del token raw |
| `expires_at` | INTEGER NOT NULL | Unix timestamp |
| `created_at` | INTEGER NOT NULL | Unix timestamp |

---

## Seed iniziale

Al primo avvio (se non esiste nessun utente), `seedDatabase()` inserisce:
- 3 ruoli di default: `administrator`, `editor`, `author`
- 1 utente `admin` con password da `ADMIN_PASSWORD` env var

---

## Migration

Le migration sono file SQL in `packages/core/src/db/migrations/`. Drizzle Kit le genera automaticamente dal diff dello schema:

```bash
cd packages/core && pnpm db:generate   # genera file .sql da modifiche a schema.ts
cd packages/core && pnpm db:migrate    # applica le migration in sospeso
```

Il server applica automaticamente le migration in sospeso all'avvio in produzione.
