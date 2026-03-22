# Modulo 02 — Schema Database

**Dipendenze:** `01-setup.md`  
**Produce:** schema Drizzle completo, migration iniziale, DB client singleton

---

## Obiettivo

Definire tutte le tabelle con Drizzle ORM su SQLite, generare la prima migration e creare il client DB da usare nel resto del core.

---

## Tabelle

### `posts`
```ts
{
  id:          integer (PK, autoincrement)
  postType:    text     NOT NULL          // 'post' | 'page' | custom
  title:       text     NOT NULL
  slug:        text     NOT NULL
  content:     text     DEFAULT ''        // rich text HTML (da Tiptap)
  fields:      text     DEFAULT '{}'      // JSON blob dei custom fields
  status:      text     DEFAULT 'draft'   // 'draft' | 'published' | 'trash'
  authorId:    integer  REFERENCES users(id)
  createdAt:   integer  NOT NULL          // Unix timestamp
  updatedAt:   integer  NOT NULL
}
// UNIQUE INDEX su (postType, slug)
```

### `post_field_index`
Tabella per query veloci su custom fields con `queryable: true`.
```ts
{
  id:           integer (PK, autoincrement)
  postId:       integer  NOT NULL  REFERENCES posts(id) ON DELETE CASCADE
  fieldName:    text     NOT NULL
  stringValue:  text               // usato per type: string | select | date
  numberValue:  real               // usato per type: number
}
// INDEX su (fieldName, stringValue)
// INDEX su (fieldName, numberValue)
// INDEX su (postId)
```

### `post_revisions`
```ts
{
  id:        integer (PK, autoincrement)
  postId:    integer  NOT NULL  REFERENCES posts(id) ON DELETE CASCADE
  title:     text     NOT NULL
  slug:      text     NOT NULL
  content:   text     NOT NULL
  fields:    text     NOT NULL   // JSON snapshot
  status:    text     NOT NULL
  authorId:  integer  REFERENCES users(id)
  createdAt: integer  NOT NULL
}
// INDEX su (postId)
```

### `taxonomies`
```ts
{
  id:           integer (PK, autoincrement)
  name:         text  NOT NULL
  slug:         text  NOT NULL  UNIQUE
  hierarchical: integer DEFAULT 0  // 0 = false, 1 = true (SQLite non ha boolean)
}
```

### `terms`
```ts
{
  id:           integer (PK, autoincrement)
  taxonomyId:   integer NOT NULL  REFERENCES taxonomies(id) ON DELETE CASCADE
  name:         text    NOT NULL
  slug:         text    NOT NULL
  description:  text    DEFAULT ''
  parentId:     integer REFERENCES terms(id)
}
// UNIQUE INDEX su (taxonomyId, slug)
```

### `post_terms`
```ts
{
  postId:  integer  NOT NULL  REFERENCES posts(id) ON DELETE CASCADE
  termId:  integer  NOT NULL  REFERENCES terms(id) ON DELETE CASCADE
}
// PRIMARY KEY (postId, termId)
```

### `roles`
```ts
{
  id:           integer (PK, autoincrement)
  name:         text  NOT NULL
  slug:         text  NOT NULL  UNIQUE
  capabilities: text  NOT NULL  DEFAULT '[]'  // JSON array: ['edit_posts', ...]
}
```

### `users`
```ts
{
  id:           integer (PK, autoincrement)
  username:     text  NOT NULL  UNIQUE
  email:        text  NOT NULL  UNIQUE
  passwordHash: text  NOT NULL
  roleId:       integer  REFERENCES roles(id)
  createdAt:    integer  NOT NULL
}
```

### `plugin_status`
```ts
{
  id:          integer (PK, autoincrement)
  pluginName:  text     NOT NULL  UNIQUE
  active:      integer  DEFAULT 0   // 0 | 1
  activatedAt: integer
}
```

---

## Capabilities di default

```ts
// Capabilities disponibili nel sistema
const CAPABILITIES = [
  'read',
  'edit_posts',
  'edit_others_posts',
  'publish_posts',
  'delete_posts',
  'delete_others_posts',
  'manage_terms',        // crea/modifica/elimina terms
  'manage_users',        // crea/modifica/elimina utenti
  'manage_roles',        // crea/modifica/elimina ruoli
  'manage_plugins',      // attiva/disattiva plugin
  'manage_options',      // impostazioni generali
  'upload_files',        // (usato dal plugin media)
] as const
```

### Ruoli di default
| Ruolo | Capabilities |
|---|---|
| `administrator` | tutte |
| `editor` | `read`, `edit_posts`, `edit_others_posts`, `publish_posts`, `delete_posts`, `manage_terms` |
| `author` | `read`, `edit_posts`, `publish_posts`, `delete_posts` |

---

## Struttura file in `packages/core/src/db/`

```
db/
├── client.ts       # crea e restituisce il singleton DB (better-sqlite3)
├── schema.ts       # tutti i sqliteTable() di Drizzle
├── migrate.ts      # esegue le migration al boot
└── seed.ts         # inserisce ruoli e utente admin di default al primo avvio
```

### `client.ts`
- Legge `DATABASE_PATH` da env
- Crea il file SQLite se non esiste
- Abilita `PRAGMA foreign_keys = ON`
- Restituisce il client Drizzle wrappato su better-sqlite3
- Export come singleton: `export const db = ...`

### `migrate.ts`
- Chiamato nel bootstrap del server
- Usa `drizzle-kit migrate` per applicare le migration pendenti
- Stampa log delle migration applicate

### `seed.ts`
- Controlla se esiste già almeno un utente
- Se no: inserisce i ruoli default + un utente `admin` con password dall'env (`ADMIN_PASSWORD`)
- Eseguito una volta sola dopo le migration

---

## Checklist

- [ ] Scrivere `schema.ts` con tutte le tabelle Drizzle
- [ ] Aggiungere tutti gli indici critici (`post_field_index`, slug, etc.)
- [ ] Scrivere `client.ts` con singleton e PRAGMA foreign keys
- [ ] Configurare `drizzle.config.ts` (punta a `schema.ts`, output `./migrations`)
- [ ] Eseguire `pnpm db:generate` per generare la prima migration SQL
- [ ] Scrivere `migrate.ts` da chiamare al boot
- [ ] Scrivere `seed.ts` con ruoli default e utente admin
- [ ] Testare: cancellare `data/`, riavviare → DB ricreato con migration + seed
