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

### `posts`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `post_type` | TEXT NOT NULL | Es. `post`, `page`, custom |
| `title` | TEXT NOT NULL | |
| `slug` | TEXT NOT NULL | |
| `content` | TEXT NOT NULL DEFAULT `''` | HTML da Tiptap |
| `fields` | TEXT NOT NULL DEFAULT `'{}'` | JSON blob custom fields |
| `status` | TEXT NOT NULL DEFAULT `'draft'` | `draft`, `published`, `trash` |
| `author_id` | INTEGER FK → `users.id` | |
| `created_at` | INTEGER NOT NULL | Unix timestamp |
| `updated_at` | INTEGER NOT NULL | Unix timestamp |

**Indici:** UNIQUE su `(post_type, slug)`

### `post_field_index`

Indice per query veloci su custom fields con `queryable: true`. Aggiornato ad ogni salvataggio del post (DELETE + INSERT per il post).

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `post_id` | INTEGER FK → `posts.id` ON DELETE CASCADE | |
| `field_name` | TEXT NOT NULL | |
| `string_value` | TEXT | Per campi di tipo string, select, date |
| `number_value` | REAL | Per campi di tipo number |

**Indici:** `(field_name, string_value)`, `(field_name, number_value)`, `(post_id)`

### `post_revisions`

Snapshot del post creato automaticamente **prima** di ogni aggiornamento tramite `PUT /posts/:id`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `post_id` | INTEGER FK → `posts.id` ON DELETE CASCADE | |
| `title` | TEXT NOT NULL | |
| `slug` | TEXT NOT NULL | |
| `content` | TEXT NOT NULL | |
| `fields` | TEXT NOT NULL | JSON snapshot |
| `status` | TEXT NOT NULL | |
| `author_id` | INTEGER FK → `users.id` | |
| `created_at` | INTEGER NOT NULL | Unix timestamp |

### `taxonomies`

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
| `taxonomy_id` | INTEGER FK → `taxonomies.id` ON DELETE CASCADE | |
| `name` | TEXT NOT NULL | |
| `slug` | TEXT NOT NULL | |
| `description` | TEXT NOT NULL DEFAULT `''` | |
| `parent_id` | INTEGER FK → `terms.id` (self-referential) | Null per root |

**Indici:** UNIQUE su `(taxonomy_id, slug)`

### `post_terms`

Tabella di associazione N:M tra post e terms. Nessuna colonna extra.

| Colonna | Tipo |
|---|---|
| `post_id` | INTEGER FK → `posts.id` ON DELETE CASCADE |
| `term_id` | INTEGER FK → `terms.id` ON DELETE CASCADE |

**PK:** `(post_id, term_id)`

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
