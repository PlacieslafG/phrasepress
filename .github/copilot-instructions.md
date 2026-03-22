# PhrasePress — Istruzioni Copilot

PhrasePress è un CMS headless minimale ispirato a WordPress, scritto interamente in **Node.js 22 + TypeScript**. L'obiettivo è replicare le funzionalità core di WP (custom post types, custom taxonomies, plugin system con hook) con uno stack moderno e senza legacy.

## Workflow obbligatorio per ogni task di implementazione

Per qualsiasi richiesta che comporti modifiche al codice, seguire **sempre** questi passi nell'ordine indicato. Non saltare passi, non procedere al passo successivo se quello corrente ha fallito.

### 1. Carica le instruction files rilevanti
Identificare quale/i area/e del codice è coinvolta e **leggere** i file instruction corrispondenti prima di qualsiasi altra azione:

| Area | Instruction file |
|---|---|
| Core Node.js, ESM, bootstrap, post types, slug | `.github/instructions/core.instructions.md` |
| Database, Drizzle ORM, schema, migration, seed | `.github/instructions/database.instructions.md` |
| Route Fastify, JSON Schema, REST API | `.github/instructions/api.instructions.md` |
| Auth, JWT, argon2, capabilities, cookie | `.github/instructions/auth.instructions.md` |
| Admin Vue 3, Pinia, PrimeVue, Tiptap, router | `.github/instructions/admin.instructions.md` |
| Plugin, hook, HookManager, PluginContext | `.github/instructions/plugins.instructions.md` |
| Test Vitest, createTestApp, app.inject | `.github/instructions/testing.instructions.md` |
| phrasepress.config.ts, defineConfig, FieldType | `.github/instructions/config.instructions.md` |

### 2. Leggi tutto il codice coinvolto
Prima di scrivere qualsiasi riga: leggere i file sorgente rilevanti, la struttura directory, i tipi Drizzle inferiti. Non fare assunzioni su implementazioni non lette.

### 3. Implementa le modifiche
Seguendo le regole delle instruction files caricate. Non aggiungere funzionalità extra non richieste.

### 4. Verifica TypeScript
Dopo ogni modifica ai file `.ts`: eseguire il check degli errori TypeScript con `get_errors`. Se ci sono errori, risolverli prima di procedere.

### 5. Scrivi o aggiorna i test
- I test per il core stanno in `packages/core/src/test/`
- **Prima cercare se esiste già un file di test** per l'area modificata — se sì, aggiungere lì i nuovi casi
- Test di route API → `test/integration/` usando `createTestApp()` + `app.inject()`
- Test di logica pura → `test/unit/` senza DB né Fastify

### 6. Esegui i test e correggi finché sono tutti verdi
```bash
cd packages/core && pnpm test --run
```
Se un test fallisce: analizzare l'errore, correggere il codice o il test, ri-eseguire. Non fermarsi finché tutti i test passano.

---

## Stack

- **Runtime:** Node.js 22+ ESM nativo
- **Linguaggio:** TypeScript strict, no `any` impliciti
- **Backend:** Fastify (non Express)
- **Database:** SQLite via `better-sqlite3` + Drizzle ORM
- **Admin UI:** Vue 3 + Vite + PrimeVue + TailwindCSS + Tiptap
- **Auth:** JWT (access token breve) + refresh token httpOnly cookie
- **Package manager:** pnpm con workspaces
- **Monorepo:** `packages/core`, `packages/admin`, `packages/plugins/*`

## Struttura monorepo

```
packages/
  core/src/
    db/          # schema Drizzle, client singleton, migrate, seed
    hooks/       # HookManager (actions + filters)
    post-types/  # PostTypeRegistry, slug utils
    taxonomies/  # TaxonomyRegistry, sync con DB
    plugins/     # PluginLoader, interfacce Plugin
    auth/        # JWT, password argon2, capabilities
    api/         # route Fastify (posts, taxonomies, auth, users, roles, plugins)
    index.ts     # bootstrap: init DB → registri → hook → plugin → Fastify
  admin/src/
    router/      # Vue Router con guard
    stores/      # Pinia: auth, app (post types + taxonomies)
    api/         # client fetch tipizzato con auto-refresh
    layouts/     # AdminLayout con sidebar dinamica
    pages/       # una directory per area funzionale
    components/  # componenti riutilizzabili
config/
  phrasepress.config.ts  # entry point utente: registerPostType, registerTaxonomy, plugins
```

## Regole generali

- **TypeScript strict sempre.** Niente `any`, niente `as unknown as X` a meno di motivazione esplicita.
- **ESM ovunque.** Import con estensione `.js` nei file core (Node ESM richiede), niente `require()`.
- **Niente over-engineering.** Non creare astrazioni per un solo caso d'uso. La soluzione più semplice che funziona.
- **Niente commenti ovvi.** Commenta solo logica non evidente (es. perché si fa una cosa, non cosa fa).
- **Errori espliciti.** Usare `throw new Error('messaggio descrittivo')` con messaggi utili. Mai `throw err` silenzioso.
- **Niente dipendenze superflue.** Prima di aggiungere un package, valutare se la stdlib o il codice inline non bastano.

## Convenzioni di nomenclatura

- File: `kebab-case.ts`
- Classi: `PascalCase`
- Funzioni e variabili: `camelCase`
- Costanti globali: `UPPER_SNAKE_CASE`
- Tabelle DB (Drizzle): `camelCase` nel codice, `snake_case` nel DB
- Route API: `/api/v1/kebab-case`
- Vue components: `PascalCase.vue`

## Pattern architetturali da seguire

### Hook system
Il `HookManager` è il meccanismo di estensione centrale. Prima di aggiungere logica "condizionale" nel core, valutare se è meglio esporre un hook.

### Plugin context
I plugin ricevono un oggetto `PluginContext` con tutto il necessario. Non usare import diretti dal core nei plugin — tutto passa dal context.

### Slug
Sempre generato da `generateSlug(title)` e reso unico con `ensureUniqueSlug(db, postType, slug)`. Unicità a livello di `(postType, slug)` per i post, `(taxonomyId, slug)` per i terms.

### Custom fields performance
- I valori dei custom fields sono salvati come JSON blob in `posts.fields` (zero JOIN per lettura)
- I campi con `queryable: true` sono duplicati in `post_field_index` con colonne `stringValue` e `numberValue` indicizzate
- Quando si aggiorna un post: DELETE + INSERT su `post_field_index` per quel post (non UPDATE individuali)

### Revisioni
Ad ogni `PUT /posts/:id` creare una riga in `post_revisions` PRIMA di aggiornare il post. Non dopo.

## Sicurezza

- Password hash con **argon2** (non bcrypt, non MD5, non SHA)
- Refresh token salvati **hashati** nel DB, mai in chiaro
- Refresh token inviati come **httpOnly cookie** (non nel body JSON)
- Capability check su ogni route protetta tramite decorator Fastify `requireCapability`
- Mai loggare password, token o dati sensibili
- Input utente validato con gli schema JSON di Fastify (non a mano)

## Riferimenti documentazione

- Architettura completa: `PIANO.md`
- Dettaglio per modulo (consultare il file pertinente prima di implementare):

| Modulo | File |
|---|---|
| Setup monorepo, tsconfig, pnpm | `docs/01-setup.md` |
| Schema Drizzle, migration, seed | `docs/02-database.md` |
| Post types, slug, CRUD posts, revisioni | `docs/03-post-types.md` |
| Taxonomies, terms, associazioni | `docs/04-taxonomies.md` |
| Hook system (actions + filters) | `docs/05-hooks.md` |
| Plugin loader, interfaccia Plugin | `docs/06-plugins.md` |
| Auth JWT, utenti, ruoli, capabilities | `docs/07-auth.md` |
| Admin shell: Vue Router, Pinia, API client | `docs/08-admin-shell.md` |
| Admin: lista post, editor, Tiptap, revisioni | `docs/09-admin-posts.md` |
| Admin: gestione terms taxonomy | `docs/10-admin-taxonomies.md` |
| Admin: utenti e ruoli | `docs/11-admin-users.md` |
| Admin: pagina plugin | `docs/12-admin-plugins.md` |
| Deploy: Dockerfile, pm2, Nginx, install.sh | `docs/13-deploy.md` |
