---
applyTo: "packages/core/src/**"
description: "Use when working on the core Node.js TypeScript package: ESM imports, TypeScript strict mode, post types, slug generation, custom fields, field index, revisions, bootstrap sequence, Fastify server setup."
---

# Istruzioni — Core TypeScript (Node.js)

**Documentazione di riferimento:** `docs/01-setup.md`, `docs/03-post-types.md`

## Moduli ESM

- Usare sempre import con estensione `.js` anche per file `.ts`:
  ```ts
  import { db } from './db/client.js'       // ✅
  import { db } from './db/client'           // ❌ — Node ESM richiede l'estensione
  ```
- Niente `require()`. Niente `module.exports`. Tutto ESM.
- Il `package.json` di `@phrasepress/core` ha `"type": "module"`.

## TypeScript strict

- `strict: true` abilitato nel `tsconfig.json`. Rispettarlo — niente hack per silenziare errori.
- Niente `any` impliciti. Se un tipo non è noto, usare `unknown` e fare il narrowing esplicito.
- Niente `as Type` casting forzato senza commento che spiega perché è sicuro.
- I tipi delle entità DB sono inferiti da Drizzle (`typeof posts.$inferSelect`) — non ridefinirli a mano.

## Struttura file — distinzione importante

- `src/index.ts` — **Entry point pubblico del package** (`@phrasepress/core`). Esporta solo i tipi e funzioni usati da plugin e `phrasepress.config.ts`. Non contiene logica bootstrap.
- `src/server.ts` — **Bootstrap del server**. La funzione `createServer(config)` esegue migration, registra post types/taxonomies, carica plugin, crea l'istanza Fastify.
- Non importare da `src/server.ts` nei plugin — usare solo i tipi esportati da `src/index.ts`.

## Ordine bootstrap in `src/server.ts`

L'ordine di `createServer(config)` è preciso e non va alterato:
1. `runMigrations()` + `seedDatabase()`
2. Crea `PostTypeRegistry`, `TaxonomyRegistry`, `HookManager`
3. Registra post types e taxonomies **di default** (`post`, `page`, `category`, `tag`)
4. Registra post types e taxonomies dal **config utente**
5. `syncTaxonomiesWithDb(taxonomyRegistry, db)`
6. Crea istanza Fastify + plugin (`helmet`, `cors`, `rateLimit`)
7. `registerAuth(fastify)` — JWT + cookie + decorators
8. Crea `PluginContext` + `PluginLoader` → carica plugin attivi
9. Registra le route API con `fastify.register(...)`
10. `fastify.listen()`

**Non** spostare passaggi — le dipendenze tra moduli dipendono da questo ordine.

## Tipi chiave del pacchetto

```ts
// Tipi field (src/post-types/registry.ts)
type FieldType = 'string' | 'number' | 'boolean' | 'richtext' | 'date'
               | 'select' | 'textarea' | 'image' | 'relationship' | 'repeater'

// Tipo transazione DB (src/db/client.ts)
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
// Usare Tx per tipizzare parametri che accettano sia db che una tx aperta:
function doSomething(tx: Tx, postId: number) { ... }
```

## PostTypeRegistry e TaxonomyRegistry

- Entrambi sono singleton passati nel `PluginContext` — non istanziarli di nuovo altrove.
- I post type si registrano tramite `registry.register()` — non nel DB (la lista è in-memory, ricostruita ad ogni boot).
- `TaxonomyRegistry` ha `getForPostType(postType)` — utile per API che filtrano per post type.

## Gestione errori

- Nei moduli core: `throw new Error('Messaggio descrittivo che spiega cosa è andato storto')`.
- Mai `throw err` nudo senza contesto aggiuntivo.
- Mai silenziare errori con catch vuoti: `catch (_) {}` — almeno loggare.
- L'error handler globale di Fastify gestisce gli errori non catturati nelle route.

## Variabili d'ambiente obbligatorie

| Variabile | Descrizione |
|---|---|
| `DATABASE_PATH` | Path al file SQLite (es. `./data/db.sqlite`) |
| `JWT_SECRET` | Segreto HMAC per access token — se manca, il server non parte |
| `JWT_REFRESH_SECRET` | Segreto per refresh token — se manca, il server non parte |
| `ADMIN_PASSWORD` | Password admin per il seed iniziale |
| `CORS_ORIGIN` | Origini CORS permesse (comma-separated, default `http://localhost:5173`) |
| `MEDIA_STORAGE_PATH` | Directory upload media (plugin media, default `./data/uploads`) |
| `MEDIA_MAX_FILE_SIZE` | Max upload in bytes (plugin media, default `10485760` = 10 MB) |

- Lette **una sola volta** al boot. Mai leggere `process.env` dentro funzioni chiamate frequentemente.
- Non usare valori di default per i segreti JWT. Se mancano, `throw` prima di avviare il server.

## Logging

- Usare il logger integrato di Fastify: `fastify.log.info(...)`, `fastify.log.error(...)`.
- Non usare `console.log` nel codice core (solo per debug temporaneo).
- Non loggare mai: password, token JWT, refresh token, dati sensibili utente.

## Slug generation

- `generateSlug(title: string): string` — lowercase, spazi → trattini, rimuove caratteri non-alfanumerici.
- `ensureUniqueSlug(db, postType, baseSlug, excludeId?): string` — sincrono (better-sqlite3 è sync). Aggiunge suffisso `-2`, `-3`, ecc.
- Chiamare `ensureUniqueSlug` sempre al momento della creazione/modifica slug, anche se arriva già dallo slug manuale dell'utente.
