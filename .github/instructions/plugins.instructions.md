---
applyTo: "packages/plugins/**,packages/core/src/plugins/**,packages/core/src/hooks/**"
description: "Use when working on plugins, hooks, or the extension system: HookManager, actions, filters, PluginLoader, PluginContext, custom plugin development, fields plugin, media plugin, hook registration."
---

# Istruzioni — Plugin System e Hook

**Documentazione di riferimento:** `docs/05-hooks.md`, `docs/06-plugins.md`

## Hook system (HookManager)

- Il singleton `hooks` è esportato da `packages/core/src/hooks/index.ts`.
- **Actions** = notifiche (side effects). Il valore di ritorno dei listener è ignorato.
- **Filters** = trasformazioni. Il listener riceve un valore, lo restituisce modificato. La catena passa il risultato al successivo.
- I listener sono eseguiti in ordine di `priority` crescente (10 = default, 1 = prima, 100 = dopo).
- `doAction` / `applyFilters` sono **async**. `doActionSync` / `applyFiltersSync` solo per contesti sincroni — lanciano errore se un listener è async.
- Nel core: chiamare sempre `applyFilters` PRIMA di scrivere in DB (per permettere ai plugin di modificare i dati).
- Nel core: chiamare sempre `doAction` DOPO l'operazione DB (per notificare i plugin dell'evento avvenuto).
- `removeAction(hook, handler)` e `removeFilter(hook, handler)` rimuovono per riferimento alla funzione — usare la stessa reference usata in `addAction/addFilter`.

## Interfaccia Plugin

```ts
import type { Plugin } from '@phrasepress/core'

const myPlugin: Plugin = {
  name:        'my-plugin',
  version:     '1.0.0',
  description: 'Descrizione del plugin',  // opzionale
  register(ctx) { ... },                  // chiamato ad ogni boot se il plugin è attivo
  onActivate?(ctx)   { ... },             // chiamato solo alla prima attivazione
  onDeactivate?(ctx) { ... },             // chiamato alla disattivazione
}
export default myPlugin
```

- **Tutto** ciò che serve al plugin viene dal `PluginContext`. Non importare da `@phrasepress/core` moduli interni (db, registry, ecc.) direttamente.
- `register()` viene chiamato ad ogni boot.  `onActivate()` solo alla prima attivazione (usato per creare tabelle).

## PluginContext

```ts
{
  hooks,       // HookManager — addAction/addFilter/removeAction/removeFilter
  postTypes,   // PostTypeRegistry — register(), get(), getAll(), getForPostType()
  taxonomies,  // TaxonomyRegistry — register(), get(), getAll(), getForPostType()
  db,          // Drizzle client (Db) — operazioni DB custom
  fastify,     // FastifyInstance — per registrare nuove route
  config,      // PhrasePressConfig — impostazioni globali
}
```

## Plugin-managed tables

I plugin che necessitano tabelle proprie le creano in `onActivate()` — non nel core schema:
```ts
onActivate(ctx) {
  ctx.db.run(sql`CREATE TABLE IF NOT EXISTS my_plugin_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ...
  )`)
}
```
Non usare la migration di Drizzle per le tabelle dei plugin — usare `CREATE TABLE IF NOT EXISTS` inline.

## Fields plugin (`packages/plugins/fields`)

- Aggiunge gruppi di custom fields configurabili dall'admin UI.
- `registerFieldGroup(def: FieldGroupDef)` — API per registrare gruppi di field programmaticamente in `phrasepress.config.ts` (senza passare dall'UI):
  ```ts
  import { registerFieldGroup } from '../packages/plugins/fields/src/index.js'
  registerFieldGroup({
    name:      'Product Details',
    postTypes: ['product'],
    fields:   [{ name: 'price', type: 'number', label: 'Price', queryable: true }],
  })
  ```
- I gruppi registrati via `registerFieldGroup` e quelli salvati nel DB vengono uniti al momento della richiesta `GET /post-types` tramite il filter hook `post_types.meta`.

## Media plugin (`packages/plugins/media`)

- Gestisce upload file e tabella `media` (schema definito inline nel plugin).
- Variabili d'ambiente: `MEDIA_STORAGE_PATH` (directory upload, default `./data/uploads`), `MEDIA_MAX_FILE_SIZE` (max bytes, default 10 MB).
- Tipi MIME permessi: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`, `application/pdf`.
- I file vengono salvati con nome UUID-based per evitare conflitti. Il nome originale è in `media.originalName`.
- Routes registrate sotto `/api/v1/plugins/phrasepress-media/`: `POST /upload`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`.

## Regole per la scrittura di plugin

- Un plugin **non deve mai** avere effetti distruttivi in `onDeactivate` sui dati esistenti. Può disabilitare funzionalità, non eliminare dati.
- Le route Fastify registrate da un plugin usano il prefisso `/api/v1/plugins/:pluginName/` per evitare conflitti.
- Errori nel `register()` devono essere loggati ma non devono bloccare il boot degli altri plugin — il PluginLoader isola gli errori per plugin.
- Non usare variabili globali nei plugin — tutta la state va nel `PluginContext` o in closure.

## Hook built-in disponibili (riferimento rapido)

| Hook | Tipo | Quando usarlo |
|---|---|---|
| `post.beforeCreate` | filter | Modificare dati post prima dell'inserimento |
| `post.created` | action | Side effects dopo creazione (es. notifiche) |
| `post.beforeUpdate` | filter | Modificare dati prima dell'aggiornamento |
| `post.updated` | action | Side effects dopo update |
| `post.deleted` | action | Pulizia risorse collegate |
| `post.statusChanged` | action | Logica legata a pubblicazione/bozza |
| `term.created` | action | Side effects creazione term |
| `term.deleted` | action | Pulizia |
| `user.login` | action | Log, notifiche sicurezza |
| `user.created` | action | Onboarding, email di benvenuto |
| `post_types.meta` | filter | Arricchire/modificare la lista dei post type (usato dal fields plugin) |
| `api.response` | filter | Modificare/arricchire le risposte API |
