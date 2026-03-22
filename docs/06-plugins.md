# Modulo 06 — Plugin Loader

**Dipendenze:** `05-hooks.md`, `02-database.md`  
**Produce:** sistema di caricamento e attivazione plugin

---

## Obiettivo

Permettere a codice esterno di estendere PhrasePress senza modificare il core. I plugin si registrano nel file di configurazione, vengono caricati al boot e possono aggiungere post type, taxonomy, route API, hook e pagine admin.

---

## Interfaccia Plugin

File: `packages/core/src/plugins/types.ts`

```ts
interface PluginContext {
  hooks:          HookManager
  postTypes:      PostTypeRegistry
  taxonomies:     TaxonomyRegistry
  db:             DrizzleDb
  fastify:        FastifyInstance
  config:         PhrasePressConfig
}

interface Plugin {
  name:        string             // identificatore univoco, es. 'phrasepress-media'
  version:     string             // semver, es. '1.0.0'
  description?: string
  register(ctx: PluginContext): void | Promise<void>
  onActivate?(ctx: PluginContext):   void | Promise<void>  // chiamato alla prima attivazione
  onDeactivate?(ctx: PluginContext): void | Promise<void>  // chiamato alla disattivazione
}
```

---

## Flusso di boot con plugin

```
1. Caricare config (phrasepress.config.ts)
2. Init DB + migration + seed
3. Init registri (PostTypeRegistry, TaxonomyRegistry)
4. Init HookManager
5. Registrare post type e taxonomy dal config
6. Caricare plugin dal config:
   a. Per ogni plugin: leggere plugin_status dal DB
   b. Se active = true (o prima attivazione): chiamare plugin.register(ctx)
7. Sync taxonomies con DB
8. Avviare Fastify con tutte le route
```

---

## PluginLoader

File: `packages/core/src/plugins/PluginLoader.ts`

### Metodi

```ts
class PluginLoader {
  constructor(plugins: Plugin[], ctx: PluginContext)

  // Carica tutti i plugin attivi (chiamato al boot)
  async loadAll(): Promise<void>

  // Attiva un plugin specifico (chiamato dall'admin)
  async activate(pluginName: string): Promise<void>

  // Disattiva un plugin specifico (chiamato dall'admin)
  async deactivate(pluginName: string): Promise<void>

  // Lista tutti i plugin registrati con il loro stato nel DB
  async getStatus(): Promise<PluginStatus[]>
}
```

### `loadAll()`
1. Per ogni plugin nel config: controlla se `active = true` in `plugin_status`
2. Se il plugin non ha ancora un record in `plugin_status`, lo inserisce come `active = false`
3. Per i plugin attivi: chiama `plugin.register(ctx)`
4. Gli errori di un singolo plugin non devono bloccare il boot degli altri — loggare e continuare

### `activate(name)`
1. Trova il plugin per nome
2. Se il plugin ha `onActivate`: chiamarlo
3. Impostare `active = 1` in `plugin_status`

### `deactivate(name)`
1. Trova il plugin attivo per nome
2. Se il plugin ha `onDeactivate`: chiamarlo
3. Impostare `active = 0` in `plugin_status`
4. **Nota:** la deattivazione non fa "rollback" di hook o post type già registrati. Richiede un riavvio del server per avere effetto completo (comportamento accettabile, come in WP).

---

## API Routes — Plugins

Prefisso: `/api/v1/plugins`  
Richiede auth + capability `manage_plugins`

### `GET /api/v1/plugins`
Risposta: lista di tutti i plugin nel config con il loro stato (active/inactive), nome, versione, descrizione.

### `POST /api/v1/plugins/:name/activate`
Chiama `loader.activate(name)`. Risposta: `{ success: true, requiresRestart: false }`.

### `POST /api/v1/plugins/:name/deactivate`
Chiama `loader.deactivate(name)`. Risposta: `{ success: true, requiresRestart: true }` (la deattivazione richiede restart per pulizia completa).

---

## Esempio plugin completo

```ts
// packages/plugins/custom-fields-ui/src/index.ts
import type { Plugin } from '@phrasepress/core'

const plugin: Plugin = {
  name: 'custom-fields-ui',
  version: '1.0.0',
  description: 'Aggiunge un tipo campo "color picker" al sistema custom fields',

  register({ hooks, postTypes }) {
    // Aggiunge un field type custom all'editor admin
    hooks.addFilter('admin.fieldTypes', (types) => [
      ...types,
      { type: 'color', component: 'ColorPickerField' }
    ])
  }
}

export default plugin
```

---

## Configurazione nel config utente

```ts
// config/phrasepress.config.ts
import mediaPlugin from '@phrasepress/plugin-media'
import myPlugin    from '../packages/plugins/my-plugin/src/index.ts'

export default defineConfig({
  plugins: [
    mediaPlugin,
    myPlugin,
  ]
})
```

---

## Struttura file

```
src/plugins/
├── types.ts        # interfacce Plugin, PluginContext, PluginStatus
├── PluginLoader.ts # caricamento, attivazione, disattivazione
└── index.ts        # export pubblici

src/api/
├── plugins.ts      # route /plugins
```

---

## Checklist

- [ ] Scrivere interfacce `Plugin`, `PluginContext`, `PluginStatus`
- [ ] Implementare `PluginLoader.loadAll()` con error isolation
- [ ] Implementare `PluginLoader.activate()` e `deactivate()`
- [ ] Implementare `PluginLoader.getStatus()`
- [ ] Integrare `PluginLoader` nel bootstrap (dopo registri, prima di Fastify start)
- [ ] Implementare route `GET /plugins`
- [ ] Implementare route `POST /plugins/:name/activate` e `deactivate`
- [ ] Scrivere un plugin di esempio funzionante in `packages/plugins/example/`
- [ ] Testare: registrare plugin, attivarlo, verificare che il suo hook venga eseguito
