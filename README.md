# PhrasePress

CMS headless minimalista ispirato a WordPress, scritto interamente in **Node.js 22 + TypeScript**. Nessun legacy, nessun bloat — solo ciò che serve davvero.

## Caratteristiche

- **Codici configurabili (Codices)** con blueprint di campi custom e workflow personalizzabili
- **Vocabolari (Vocabularies)** gerarchici o piatti, associabili a qualunque codex
- **Plugin system** con hook (actions + filters) stile WordPress, con auto-restart del server
- **Revisioni dei folios** con ripristino da admin
- **Sistema di ruoli e capabilities** granulare
- **Admin SPA** in Vue 3 con editor rich text (Tiptap)
- **API REST headless** — il frontend pubblico può essere qualunque cosa (Next.js, Astro, ecc.)
- **SQLite** — zero configurazione database, file unico, backup semplice

## Stack

| Layer | Tecnologia |
|---|---|
| Runtime | Node.js 22+ (ESM nativo) |
| Linguaggio | TypeScript strict |
| Backend | Fastify 5 |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| Admin UI | Vue 3 + Vite + PrimeVue 4 + TailwindCSS 4 |
| Editor | Tiptap |
| Auth | JWT (access token 15m) + refresh token httpOnly cookie (7d) |
| Package manager | pnpm workspaces |

## Struttura monorepo

```
phrasepress/
├── packages/
│   ├── core/          # Kernel: DB, hooks, codices, vocabularies, API Fastify
│   └── admin/         # SPA Vue 3 (Vite)
├── config/
│   └── phrasepress.config.ts   # Entry point utente: codices, vocabularies, plugin
├── deploy/
│   └── nginx.conf.template
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.cjs        # pm2
├── install.sh
└── update.sh
```

## Avvio in sviluppo

**Prerequisiti:** Node.js 22+, pnpm 9+

```bash
# 1. Installa dipendenze
pnpm install

# 2. Crea il file .env
cp .env.example .env
# Modifica almeno JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_PASSWORD

# 3. Avvia il backend (porta 3000)
pnpm dev

# 4. In un secondo terminale, avvia l'admin (porta 5173)
pnpm dev:admin
```

L'admin è raggiungibile su `http://localhost:5173`.  
Credenziali di default: `admin` / valore di `ADMIN_PASSWORD` in `.env`.

## Build per produzione

```bash
pnpm run build
```

Produce:
- `packages/core/dist/` — server Fastify compilato
- `dist/admin/` — SPA Vue buildati (servita staticamente da Fastify in `NODE_ENV=production`)

## Deploy

### Con Docker

```bash
# Crea il .env dalla versione di esempio
cp .env.example .env
# Imposta JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_PASSWORD nel .env

docker compose up --build -d
```

Il server è disponibile su `http://localhost:3000`.

### Su VPS (Ubuntu/Debian)

```bash
git clone <repo> /var/www/phrasepress
cd /var/www/phrasepress

# Lo script installa le dipendenze, builda, configura pm2 e Nginx
./install.sh
```

Per aggiornamenti successivi:

```bash
./update.sh
```

## Variabili d'ambiente

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `DATABASE_PATH` | sì | Path al file SQLite (es. `./data/phrasepress.db`) |
| `JWT_SECRET` | sì | Segreto per access token (min 32 caratteri) |
| `JWT_REFRESH_SECRET` | sì | Segreto per refresh token (diverso da `JWT_SECRET`) |
| `ADMIN_PASSWORD` | sì (primo avvio) | Password utente admin creata al seed |
| `PORT` | no | Porta Fastify (default: `3000`) |
| `NODE_ENV` | no | `development` o `production` |
| `CORS_ORIGIN` | no | Origini CORS (virgola-separate, default: `http://localhost:5173`) |
| `DOMAIN` | no | Dominio pubblico (per la generazione config Nginx) |

Genera segreti sicuri con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Configurazione

Modifica `config/phrasepress.config.ts` per registrare codici, vocabularies e plugin:

```ts
import { defineConfig } from '@phrasepress/core'

export default defineConfig({
  codices: [
    {
      name: 'product',
      label: 'Products',
      icon: 'pi-shopping-cart',
      blueprint: [
        { name: 'price', type: 'number', label: 'Prezzo', queryable: true },
        { name: 'sku',   type: 'string', label: 'SKU',    queryable: true },
      ],
    },
  ],
  vocabularies: [
    { slug: 'brand', name: 'Brands', codices: ['product'], hierarchical: false },
  ],
  plugins: [],
})
```

## API REST

Base URL: `/api/v1`

### Folios (per ogni codex)

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/:codex` | Lista folios (filtri: `stage`, `search`, `page`, `perPage`, `termSlug`, `fieldName[op]`) |
| `GET` | `/:codex/:id` | Singolo folio per ID (include terms per vocabulary) |
| `POST` | `/:codex` | Crea folio |
| `PUT` | `/:codex/:id` | Aggiorna folio (crea revisione automaticamente) |
| `DELETE` | `/:codex/:id` | Elimina folio |
| `GET` | `/:codex/:id/revisions` | Lista revisioni |
| `POST` | `/:codex/:id/revisions/:revId/restore` | Ripristina revisione |

### Vocabularies e Terms

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/vocabularies` | Lista vocabularies registrati |
| `GET` | `/vocabularies/:slug/terms` | Lista terms di un vocabulary |
| `POST` | `/vocabularies/:slug/terms` | Crea term |
| `PUT` | `/vocabularies/:slug/terms/:id` | Aggiorna term |
| `DELETE` | `/vocabularies/:slug/terms/:id` | Elimina term |

### Auth

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `POST` | `/auth/login` | Login → access token + cookie refresh |
| `POST` | `/auth/refresh` | Rinnova access token via cookie |
| `POST` | `/auth/logout` | Logout + invalida refresh token |
| `GET` | `/auth/me` | Utente corrente |

### Utenti e Ruoli

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/users` | Lista utenti |
| `POST` | `/users` | Crea utente |
| `PUT` | `/users/:id` | Aggiorna utente |
| `DELETE` | `/users/:id` | Elimina utente |
| `GET` | `/roles` | Lista ruoli |
| `POST` | `/roles` | Crea ruolo |
| `PUT` | `/roles/:id` | Aggiorna ruolo |
| `DELETE` | `/roles/:id` | Elimina ruolo |

Tutte le route (tranne `POST /auth/login` e `POST /auth/refresh`) richiedono l'header:

```
Authorization: Bearer <accessToken>
```

## Plugin System

Un plugin è un oggetto TypeScript che riceve un `PluginContext`:

```ts
import type { Plugin } from '@phrasepress/core'

const myPlugin: Plugin = {
  name: 'my-plugin',
  async register(ctx) {
    // Aggiunge un hook action
    ctx.hooks.addAction('folio.saved', async (folio) => {
      console.log('Folio salvato:', folio.id)
    })

    // Registra un endpoint Fastify personalizzato
    ctx.fastify.get('/api/v1/my-plugin/hello', async () => {
      return { hello: 'world' }
    })
  },
}

export default myPlugin
```

Aggiungi il plugin in `config/phrasepress.config.ts`:

```ts
import myPlugin from '../packages/plugins/my-plugin/src/index.js'

export default defineConfig({
  plugins: [myPlugin],
})
```

## Documentazione moduli

| Argomento | File |
|---|---|
| Setup monorepo, tsconfig, pnpm | [docs/01-setup.md](docs/01-setup.md) |
| Schema Drizzle, migration, seed | [docs/02-database.md](docs/02-database.md) |
| Codices, slug, CRUD folios, revisioni | [docs/03-codices.md](docs/03-codices.md) |
| Vocabularies, terms, associazioni | [docs/04-vocabularies.md](docs/04-vocabularies.md) |
| Hook system (actions + filters) | [docs/05-hooks.md](docs/05-hooks.md) |
| Plugin loader, interfaccia Plugin | [docs/06-plugins.md](docs/06-plugins.md) |
| Auth JWT, utenti, ruoli, capabilities | [docs/07-auth.md](docs/07-auth.md) |
| Admin shell: Vue Router, Pinia, API client | [docs/08-admin-shell.md](docs/08-admin-shell.md) |
| Admin: lista folios, editor, Tiptap, revisioni | [docs/09-admin-folios.md](docs/09-admin-folios.md) |
| Admin: gestione terms vocabulary | [docs/10-admin-vocabularies.md](docs/10-admin-vocabularies.md) |
| Admin: utenti e ruoli | [docs/11-admin-users.md](docs/11-admin-users.md) |
| Admin: pagina plugin | [docs/12-admin-plugins.md](docs/12-admin-plugins.md) |
| Deploy: Dockerfile, pm2, Nginx, install.sh | [docs/13-deploy.md](docs/13-deploy.md) |
