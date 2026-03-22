# Plugin System

I plugin sono il meccanismo di estensione principale di PhrasePress. Possono aggiungere route API, tabelle DB, hook, e UI nell'admin.

---

## Interfaccia Plugin

```ts
interface Plugin {
  name:         string     // identificatore univoco, es. 'phrasepress-media'
  version:      string     // semver, es. '1.0.0'
  description?: string

  // Chiamato ogni volta che il plugin è attivo all'avvio del server
  register(ctx: PluginContext): void | Promise<void>

  // Chiamato la prima volta che il plugin viene attivato (setup una-tantum)
  onActivate?(ctx: PluginContext): void | Promise<void>

  // Chiamato quando il plugin viene disattivato
  onDeactivate?(ctx: PluginContext): void | Promise<void>
}
```

### PluginContext

Oggetto passato a tutti i lifecycle hooks del plugin. Contiene tutto il necessario senza import diretti dal core.

```ts
interface PluginContext {
  hooks:      HookManager        // aggiungi actions e filters
  postTypes:  PostTypeRegistry   // registra custom post types
  taxonomies: TaxonomyRegistry   // registra custom taxonomies
  db:         Db                 // accesso diretto a better-sqlite3 + Drizzle
  fastify:    FastifyInstance    // monta nuove route
  config:     PhrasePressConfig  // config utente
}
```

---

## PluginLoader

Il `PluginLoader` gestisce il ciclo di vita dei plugin:

1. `loadAll()` — eseguito all'avvio del server. Per ogni plugin con status `active = 1` nel DB, chiama `plugin.register(ctx)`.
2. `activate(pluginName)` — chiama `onActivate()` e imposta `active = 1` nel DB. Non chiama `register()` (il plugin sarà attivo al prossimo boot).
3. `deactivate(pluginName)` — chiama `onDeactivate()` e imposta `active = 0`.

**Isolation**: se `register()` lancia un errore, il plugin viene saltato senza bloccare il boot degli altri.

---

## Registrare un plugin

In `config/phrasepress.config.ts`:

```ts
import { defineConfig } from '../packages/core/src/config.js'

export default defineConfig({
  plugins: [
    (await import('../packages/plugins/media/src/index.js')).default,
    (await import('../packages/plugins/fields/src/index.js')).default,
    // plugin custom
    (await import('../packages/my-plugin/src/index.js')).default,
  ],
})
```

---

## Creare un plugin

### Struttura directory

```
packages/plugins/my-plugin/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts      # entry point — esporta l'oggetto Plugin
    ├── db.ts         # schema Drizzle + CRUD (se usa DB)
    └── routes.ts     # route Fastify (se espone API)
```

### package.json

```json
{
  "name": "@phrasepress/plugin-my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@phrasepress/core": "workspace:*"
  }
}
```

### Esempio minimo

```ts
// src/index.ts
import type { Plugin, PluginContext } from '@phrasepress/core'

const myPlugin: Plugin = {
  name:        'my-plugin',
  version:     '1.0.0',
  description: 'Il mio plugin custom',

  async onActivate(ctx: PluginContext) {
    // Crea tabelle DB, seed iniziale, etc.
    // Eseguito solo alla prima attivazione
    const client = (ctx.db as any).$client
    client.exec(`
      CREATE TABLE IF NOT EXISTS my_plugin_data (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL
      )
    `)
  },

  async register(ctx: PluginContext) {
    // Monta route API
    await ctx.fastify.register(async (app) => {
      app.get('/hello', { preHandler: [ctx.fastify.authenticate] }, async () => {
        return { message: 'Hello from my plugin!' }
      })
    }, { prefix: '/api/v1/plugins/my-plugin' })

    // Aggancia hook
    ctx.hooks.addAction('form.submitted', async (payload) => {
      console.log('Form submitted:', payload)
    })
  },
}

export default myPlugin
```

---

## API REST — Plugins

Base path: `/api/v1/plugins`. Richiedono `manage_plugins`.

### `GET /api/v1/plugins`

Elenca tutti i plugin registrati in config con il loro status.

**Risposta:**
```json
[
  {
    "name": "phrasepress-media",
    "version": "1.0.0",
    "description": "...",
    "active": true,
    "activatedAt": 1700000000
  }
]
```

### `POST /api/v1/plugins/:name/activate`

Attiva un plugin (chiama `onActivate` se prima volta).

### `POST /api/v1/plugins/:name/deactivate`

Disattiva un plugin (chiama `onDeactivate`).
