# Modulo 04 — Taxonomies & Terms

**Dipendenze:** `02-database.md`, `03-post-types.md`  
**Produce:** registro taxonomy, CRUD API per taxonomy e terms, associazioni post/terms

---

## Obiettivo

Creare il sistema di classificazione dei contenuti: taxonomies configurabili e terms gestibili. Permette di filtrare post per categoria, tag o qualsiasi classificazione custom.

---

## TaxonomyRegistry

File: `packages/core/src/taxonomies/registry.ts`

### Interfacce TypeScript

```ts
interface TaxonomyDefinition {
  name:         string       // label plurale, es. 'Genres'
  slug:         string       // identificatore, es. 'genre'
  postTypes:    string[]     // a quali post type si applica, es. ['book', 'movie']
  hierarchical: boolean      // true = categorie annidate, false = tag flat
  icon?:        string
}
```

### Classe `TaxonomyRegistry`
- `register(def: TaxonomyDefinition): void`
- `get(slug: string): TaxonomyDefinition | undefined`
- `getAll(): TaxonomyDefinition[]`
- `getForPostType(postType: string): TaxonomyDefinition[]`

### Taxonomies di default (registrate al boot)
```ts
registry.register({ slug: 'category', name: 'Categories', postTypes: ['post'], hierarchical: true })
registry.register({ slug: 'tag',      name: 'Tags',       postTypes: ['post'], hierarchical: false })
```

---

## Sincronizzazione Registro → DB

Al boot, dopo le migration, il sistema verifica che ogni taxonomy presente nel registro esista nella tabella `taxonomies`. Se non esiste, la inserisce. Le taxonomy removed dal registro restano nel DB (dati storici non eliminati automaticamente).

File: `packages/core/src/taxonomies/sync.ts`
```ts
export async function syncTaxonomiesWithDb(registry, db): Promise<void>
```

---

## API Routes — Taxonomies

Prefisso: `/api/v1`  
File: `packages/core/src/api/taxonomies.ts`

### `GET /api/v1/taxonomies`
Risposta: lista di tutte le taxonomy registrate (da registro, non da DB) con le loro definizioni.

### `GET /api/v1/taxonomies/:taxonomySlug/terms`

Query params:
- `parent` — filtra per parent term ID (usa `0` o assente per root)
- `search` — ricerca per nome
- `page`, `limit`
- `hierarchical` — se `true`, ritorna struttura ad albero annidata

Risposta flat: `{ data: Term[], total }`  
Risposta hierarchical: `{ data: TermTree[] }` dove `TermTree = Term & { children: TermTree[] }`

### `GET /api/v1/taxonomies/:taxonomySlug/terms/:idOrSlug`
Risposta: term singolo.

### `POST /api/v1/taxonomies/:taxonomySlug/terms`
Richiede auth + capability `manage_terms`.

Body:
```ts
{
  name:         string
  slug?:        string    // auto-generato da name se omesso
  description?: string
  parentId?:    number    // per tassonomie gerarchiche
}
```

Validazioni:
- Slug unico nella taxonomy
- Se `parentId` fornito, verificare che il parent appartenga alla stessa taxonomy
- Se taxonomy non è `hierarchical`, rifiutare `parentId`

### `PUT /api/v1/taxonomies/:taxonomySlug/terms/:id`
Richiede auth + capability `manage_terms`.  
Stessa validazioni del POST.  
Impedire di impostare come parent un discendente del termine stesso (ciclo).

### `DELETE /api/v1/taxonomies/:taxonomySlug/terms/:id`
Richiede auth + capability `manage_terms`.

Logica:
- Se il term ha figli: rifiuta (o opzione `?reassignChildren=termId`)
- Elimina associazioni in `post_terms`
- Elimina il term

### `GET /api/v1/posts/:id/terms`
Risposta: tutti i terms associati al post, raggruppati per taxonomy:
```json
{
  "category": [{ "id": 1, "name": "Tech", "slug": "tech" }],
  "tag": [{ "id": 5, "name": "Node.js", "slug": "nodejs" }]
}
```

### `PUT /api/v1/posts/:id/terms`
Richiede auth + capability `edit_posts`.

Body: `{ termIds: number[] }`  
Rimpiazza completamente le associazioni del post.

---

## Struttura file

```
src/taxonomies/
├── registry.ts     # TaxonomyRegistry class
├── sync.ts         # sincronizzazione registro → DB al boot
└── index.ts        # export pubblici

src/api/
├── taxonomies.ts   # route /taxonomies e /posts/:id/terms
```

---

## Checklist

- [ ] Scrivere interfaccia `TaxonomyDefinition`
- [ ] Implementare `TaxonomyRegistry`
- [ ] Registrare taxonomies default (`category`, `tag`) nel bootstrap
- [ ] Implementare `syncTaxonomiesWithDb()` e chiamarla al boot
- [ ] Implementare `GET /taxonomies`
- [ ] Implementare `GET /taxonomies/:slug/terms` (flat + hierarchical)
- [ ] Implementare `GET /taxonomies/:slug/terms/:idOrSlug`
- [ ] Implementare `POST /taxonomies/:slug/terms` con validazioni
- [ ] Implementare `PUT /taxonomies/:slug/terms/:id` con controllo cicli
- [ ] Implementare `DELETE /taxonomies/:slug/terms/:id`
- [ ] Implementare `GET /posts/:id/terms`
- [ ] Implementare `PUT /posts/:id/terms`
- [ ] Testare associazioni molti-a-molti e filtri per term in `GET /posts`
