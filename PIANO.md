# PhrasePress — Piano di Progetto

> CMS minimale e moderno ispirato a WordPress, scritto in Node.js/TypeScript.
> Nessun legacy, nessun bloat — solo ciò che serve davvero.

---

## 1. Obiettivi

- Gestire **post** e **custom post types** in modo flessibile
- Supportare **custom taxonomies** e **terms** associabili ai post
- Avere un sistema di **plugin** semplice per estendere le funzionalità
- Essere **leggero e moderno**, con tooling attuale
- Avere un'**interfaccia admin** essenziale ma funzionale

---

## 2. Stack Tecnologico

| Layer          | Tecnologia                        | Motivo                                              |
|----------------|-----------------------------------|-----------------------------------------------------|
| Runtime        | **Node.js 22+ (LTS)**             | Stabile, moderno, ESM nativo                        |
| Linguaggio     | **TypeScript**                    | Type safety, DX eccellente                          |
| Framework HTTP | **Fastify**                       | Performante, schema-first, plugin ecosystem solido  |
| Database       | **SQLite** (via `better-sqlite3`) | Zero-config, file unico, perfetto per un CMS        |
| ORM            | **Drizzle ORM**                   | Leggero, type-safe, vicino all'SQL, no magic        |
| Admin UI       | **Vue 3 + Vite**                  | Template syntax intuitiva, Composition API moderna  |
| Stile admin    | **TailwindCSS + PrimeVue**        | Componenti pronti, accessibili, personalizzabili    |
| API            | **REST JSON** (Fastify)           | Semplice, universale, headless-ready                |
| Auth           | **JWT** (access + refresh token)  | Stateless, adatto ad API REST                       |
| Package mgr    | **pnpm**                          | Veloce, efficiente con monorepo                     |
| Monorepo       | **pnpm workspaces**               | Separa `core`, `admin`, `plugins` chiaramente       |

---

## 3. Funzionalità Core (MVP)

### 3.1 Post Types

- Tipo di default: `post`, `page`
- Registrazione di custom post type via codice TypeScript con **schema campi dichiarato**:
  ```ts
  registerPostType('product', {
    label: 'Products',
    fields: [
      { name: 'price',       type: 'number',   queryable: true },
      { name: 'sku',         type: 'string',   queryable: true },
      { name: 'description', type: 'richtext', queryable: false },
    ]
  })
  ```
- Campi base per ogni post: `id`, `postType`, `title`, `slug`, `content`, `status`, `createdAt`, `updatedAt`
- **Slug:** generato automaticamente dal titolo, sovrascrivibile manualmente. Univocità per post type.
- **Custom fields — soluzione al problema WP meta:**
  - I valori dei campi sono salvati come **JSON** nella colonna `posts.fields` → lettura zero JOIN
  - I campi con `queryable: true` vengono **duplicati** in una tabella `post_field_index` con colonne separate per `string_value` e `number_value`, entrambe indicizzate
  - Query su campo queryable: `JOIN post_field_index WHERE field_name = 'price' AND number_value > 100` → usa l'indice, nessun CAST, nessun JOIN multiplo
  - Rispetto a WP (EAV non indicizzato con CAST impliciti): query su campi numerici/testuali ordini di grandezza più veloci

### 3.2 Taxonomies & Terms

- Tassonomia di default: `category`, `tag`
- Registrazione di custom taxonomy via codice:
  ```ts
  registerTaxonomy('genre', { postTypes: ['book'], hierarchical: true })
  ```
- Associazione molti-a-molti tra post e terms
- Terms con: `name`, `slug`, `description`, `parentId`

### 3.3 Plugin System

- Directory `packages/plugins/` con plugin come package pnpm separati
- Ogni plugin esporta un oggetto `Plugin`:
  ```ts
  export default {
    name: 'my-plugin',
    register(app: PhrasePress) {
      app.addAction('post.saved', handler)
      app.registerPostType('event', { ... })
    }
  }
  ```
- Sistema di **hook**: `addAction()`, `addFilter()`, `doAction()`, `applyFilters()`
- Plugin possono registrare endpoint Fastify, nuovi post type, taxonomy, pagine admin

### 3.4 Utenti, Ruoli e Permessi

- Sistema di **ruoli** con capabilities granulari, stile WordPress:
  - Ruoli default: `administrator`, `editor`, `author`
  - Ogni ruolo ha un set di **capabilities**: `edit_posts`, `publish_posts`, `manage_options`, `upload_files`, ecc.
  - Registrazione di ruoli custom via codice:
    ```ts
    registerRole('reviewer', { capabilities: ['edit_posts', 'read'] })
    ```
  - Ogni utente ha un ruolo; i permessi sono controllati a livello API
- Schema aggiuntivo:
  ```ts
  roles     { id, name, slug, capabilities: string[] }  // capabilities come JSON
  users     { id, username, passwordHash, email, roleId, createdAt }
  ```

### 3.5 Revisioni dei Post

- Ad ogni salvataggio/aggiornamento di un post viene creata una **revisione** nella tabella `post_revisions`
- La revisione salva uno snapshot di: `title`, `slug`, `content`, `fields`, `status`
- Nell'editor admin: pannello laterale con lista revisioni (data, autore) e possibilità di **ripristinare** una versione precedente

### 3.6 Media Library *(Plugin separato — fuori MVP)*

- Implementata come plugin ufficiale dopo il core
- Upload, storage su disco, thumbnail con `sharp`, media picker nell'editor
- Tabella `media` aggiunta dal plugin al momento dell'attivazione

### 3.7 Interfaccia Admin (SPA Vue 3)

- Autenticazione (JWT)
- Dashboard con statistiche post per tipo
- Lista post per tipo, con filtro per stato e tassonomia
- Editor post:
  - Campo titolo + slug (auto-generato, editabile)
  - **Tiptap** come editor rich text per il campo `content`
  - Pannello custom fields dinamico (renderizzato dallo schema del post type)
  - Selettore tassonomie/terms
  - Pannello revisioni
- Gestione terms per ogni tassonomia
- Gestione utenti e ruoli
- Pagina plugin (attiva/disattiva)

### 3.8 API REST

- Prefisso: `/api/v1`
- Endpoint principali:
  - `GET /posts?type=book&status=published&genre=fantasy&price[gt]=100`
  - `GET /posts/:slug`
  - `POST|PUT|DELETE /posts`
  - `GET /taxonomies/:taxonomy/terms`
  - `GET /posts/:id/revisions` — lista revisioni
  - `POST /posts/:id/revisions/:revId/restore` — ripristino revisione
  - `GET /auth/me`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
  - `GET|POST|PUT|DELETE /users`, `GET|POST|PUT|DELETE /roles`
- Controllo accessi basato su capabilities del ruolo (per-ruolo, non per-utente)
- Supporto headless: il frontend pubblico può essere qualsiasi cosa (Next.js, Astro, etc.)

---

## 4. Struttura Monorepo

```
phrasepress/
├── packages/
│   ├── core/                  # Kernel: DB, hooks, post types, taxonomies, API
│   │   ├── src/
│   │   │   ├── db/            # Schema Drizzle + migrations
│   │   │   ├── hooks/         # Hook system (actions + filters)
│   │   │   ├── post-types/    # Registro post type
│   │   │   ├── taxonomies/    # Registro taxonomy
│   │   │   ├── api/           # Route Fastify
│   │   │   └── index.ts       # Entry point / bootstrap
│   │   └── package.json
│   │
│   ├── admin/                 # SPA Vue 3 (Vite)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   └── api/           # Client API typed
│   │   └── package.json
│   │
│   └── plugins/               # Plugin opzionali
│       └── example-plugin/
│           ├── src/index.ts
│           └── package.json
│
├── config/
│   └── phrasepress.config.ts  # Post type, taxonomy, plugin da caricare
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── PIANO.md
```

---

## 5. Schema Database (Drizzle / SQLite)

```ts
// posts — fields come JSON blob (zero JOIN per lettura)
{ id, postType, title, slug, content, fields, status, createdAt, updatedAt, authorId }

// post_field_index — solo campi queryable: true, con colonne tipizzate e indicizzate
{ id, postId, fieldName, stringValue, numberValue }
// INDEX su (fieldName, stringValue) e (fieldName, numberValue)

// post_revisions — snapshot ad ogni salvataggio
{ id, postId, title, slug, content, fields, status, createdAt, authorId }

// taxonomies
{ id, name, slug, hierarchical }

// terms
{ id, taxonomyId, name, slug, description, parentId }

// post_terms (many-to-many)
{ postId, termId }

// roles
{ id, name, slug, capabilities }  // capabilities: JSON array di stringhe

// users
{ id, username, passwordHash, email, roleId, createdAt }

// plugin_status — tiene traccia di plugin attivi/inattivi
{ id, pluginName, active, activatedAt }
```

---

## 6. Deploy (come WordPress su VPS/hosting)

WordPress gira su Apache + PHP (processo stateless). Node.js richiede un **processo persistente**.
La soluzione è identica a come si gestisce qualsiasi app Node.js in produzione:

```
[Browser] → Nginx (porta 80/443) → reverse proxy → Node.js / Fastify (porta 3000)
```

- **pm2** gestisce il processo Node.js (auto-restart, log, cluster mode) — equivalente a PHP-FPM
- **Nginx** fa da reverse proxy e serve i file statici dell'admin
- **Certbot** per HTTPS (Let's Encrypt), come con qualsiasi sito su VPS
- Script `install.sh` che automatizza: `pnpm install` → build admin → migrate DB → avvia pm2

**Compatibilità hosting:**

| Tipo hosting         | Supporto           | Note                                      |
|----------------------|--------------------|-------------------------------------------|
| VPS (es. DigitalOcean, Hetzner) | ✅ Ottimo | Setup consigliato: pm2 + Nginx           |
| Hosting Node.js gestito (Railway, Render, Fly.io) | ✅ Ottimo | Zero config server, deploy via git       |
| Shared hosting tradizionale | ⚠️ Dipende | Solo se il provider supporta Node.js     |
| Docker              | ✅ Ottimo           | `Dockerfile` incluso nel progetto        |

---

## 7. Roadmap (fasi)

| Fase | Contenuto                                              | Stato      |
|------|--------------------------------------------------------|------------|
| 1    | Setup monorepo pnpm + TypeScript + configurazione base | Da fare    |
| 2    | Schema DB con Drizzle + migrations                     | Da fare    |
| 3    | CRUD post con custom post type (API Fastify)           | Da fare    |
| 4    | CRUD taxonomies, terms + associazioni post/terms       | Da fare    |
| 5    | Sistema hook (actions + filters)                       | Da fare    |
| 6    | Plugin loader                                          | Da fare    |
| 7    | Autenticazione JWT + sistema ruoli/capabilities        | Da fare    |
| 8    | Media library (upload, storage, thumbnail)             | Da fare    |
| 9    | Admin SPA Vue 3 (lista post, editor, terms, media)     | Da fare    |
| 10   | Gestione utenti e ruoli nell'admin                     | Da fare    |
| 11   | Script deploy + Dockerfile + configurazione Nginx      | Da fare    |

---

## 8. Decisioni Prese

- [x] **Node.js + TypeScript** — nessun PHP, stack moderno end-to-end
- [x] **SQLite** — zero-config, file unico; SQLite limit scritture concorrenti accettabile per CMS
- [x] **REST API headless** — il frontend pubblico è deciso dall'utente finale
- [x] **Fastify** — più performante e moderno di Express
- [x] **Drizzle ORM** — vicino all'SQL, type-safe, niente over-magic
- [x] **pnpm workspaces** — separazione netta tra core, admin, plugin
- [x] **Vue 3 + Vite + Tiptap** per l'admin — template intuitivo + rich text editor moderno
- [x] **Multi-utente con ruoli e capabilities per-ruolo** — no override per-utente nell'MVP
- [x] **Custom fields con schema tipizzato + post_field_index** — risolve il problema WP meta query
- [x] **Slug automatico dal titolo + override manuale** — univocità per post type
- [x] **Revisioni dei post** — snapshot ad ogni salvataggio, ripristino dall'admin
- [x] **Media library come plugin ufficiale** — fuori dall'MVP core
- [x] **Deploy: pm2 + Nginx su VPS, + Dockerfile** — identico a WP su VPS
