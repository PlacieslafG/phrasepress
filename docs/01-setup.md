# Modulo 01 — Setup Monorepo

**Dipendenze:** nessuna  
**Produce:** struttura repository funzionante, TypeScript configurato, pnpm workspaces attivo

---

## Obiettivo

Creare la struttura base del monorepo con pnpm workspaces, configurare TypeScript condiviso e inizializzare i package `core` e `admin`.

---

## Struttura directory da creare

```
phrasepress/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── admin/
│   │   ├── src/
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── plugins/
│       └── .gitkeep
├── config/
│   └── phrasepress.config.ts
├── data/                        # SQLite db file (gitignored)
├── package.json                 # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
└── .gitignore
```

---

## File di configurazione chiave

### `pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
  - 'packages/plugins/*'
```

### `tsconfig.base.json` (root)
- `target`: ES2022
- `module`: NodeNext
- `moduleResolution`: NodeNext
- `strict`: true
- `esModuleInterop`: true
- `paths`: mapping `@phrasepress/core` → `packages/core/src/index.ts`

### `packages/core/package.json`
- `name`: `@phrasepress/core`
- `type`: `module`
- Dipendenze prod: `fastify`, `better-sqlite3`, `drizzle-orm`, `argon2`, `@fastify/jwt`, `@fastify/cors`, `@fastify/multipart`
- Dipendenze dev: `drizzle-kit`, `@types/better-sqlite3`, `tsx`, `typescript`

### `packages/admin/package.json`
- `name`: `@phrasepress/admin`
- `type`: `module`
- Dipendenze: `vue`, `vue-router`, `pinia`, `@tiptap/vue-3`, `@tiptap/starter-kit`, `primevue`, `@primevue/themes`, `primeicons`
- Dev: `vite`, `@vitejs/plugin-vue`, `tailwindcss`, `typescript`, `vue-tsc`

### `config/phrasepress.config.ts`
File di configurazione dell'utente — dove si registrano post type, taxonomy e plugin:
```ts
import { defineConfig } from '@phrasepress/core'

export default defineConfig({
  postTypes: [ /* ... */ ],
  taxonomies: [ /* ... */ ],
  plugins: [ /* ... */ ],
})
```

### `.env.example`
```
DATABASE_PATH=./data/phrasepress.db
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
PORT=3000
ADMIN_PATH=/admin
NODE_ENV=development
```

---

## Script root `package.json`

| Script | Comando |
|--------|---------|
| `dev` | Avvia core in watch mode |
| `dev:admin` | Avvia Vite dev server admin |
| `build` | Build core + admin |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `drizzle-kit migrate` |

---

## Checklist

- [ ] Init repo con `pnpm init` root
- [ ] Crea `pnpm-workspace.yaml`
- [ ] Crea `tsconfig.base.json`
- [ ] Init `packages/core` con `package.json` e `tsconfig.json`
- [ ] Init `packages/admin` con `package.json`, `tsconfig.json`, `vite.config.ts`
- [ ] Crea struttura directory (`src/db`, `src/hooks`, `src/post-types`, `src/taxonomies`, `src/api`)
- [ ] Crea `config/phrasepress.config.ts` con `defineConfig()`
- [ ] Crea `.env.example` e `.gitignore` (esclude `data/`, `.env`, `node_modules/`, `dist/`)
- [ ] Verifica `pnpm install` da root funziona
- [ ] Verifica `tsc --noEmit` da core non ha errori
