# Codices e Folios

## Codici di default

Nessun codex è registrato di default. Tutti i codici vengono dichiarati in `config/phrasepress.config.ts`.

Esempio minimale (WordPress-style):
```ts
export default defineConfig({
  codices: [
    { name: 'post', label: 'Posts', icon: 'pi-file-edit' },
    { name: 'page', label: 'Pages', icon: 'pi-file-o' },
  ],
})
```

---

## CodexDefinition

```ts
interface CodexDefinition {
  name:           string            // identificatore univoco, es. 'product'
  label:          string            // etichetta UI, es. 'Products'
  icon?:          string            // icona PrimeIcons, es. 'pi-box'
  displayField?:  string            // campo da mostrare come titolo del folio (default: 'title')
  blueprint?:     FieldDefinition[] // schema dei campi custom
  stages?:        StageDefinition[] // fasi del workflow (default: draft → published → trash)
}
```

### FieldDefinition

```ts
type FieldType =
  | 'string'       // testo breve
  | 'number'       // numero
  | 'boolean'      // vero/falso
  | 'richtext'     // HTML da Tiptap
  | 'date'         // data ISO
  | 'select'       // selezione da lista
  | 'textarea'     // testo lungo
  | 'image'        // ID media (plugin media)
  | 'relationship' // ID di un altro folio
  | 'repeater'     // array di sottocampi

interface FieldDefinition {
  name:          string
  type:          FieldType
  label?:        string
  queryable?:    boolean   // se true, valore duplicato in post_field_index
  required?:     boolean
  options?:      string[]  // per type: 'select'
  fieldOptions?: Record<string, unknown>  // config per 'image', 'relationship'
  default?:      unknown
}
```

### StageDefinition

```ts
interface StageDefinition {
  name:    string    // es. 'draft'
  label:   string    // es. 'Bozza'
  final?:  boolean   // se true, non si può avanzare oltre (es. 'trash')
}
```

Le stages sostituiscono il vecchio enum fisso `draft | published | trash`. Se non specificate, si usa il workflow di default.

I valori dei custom fields sono salvati come JSON blob in `folios.fields`. Per campi con `queryable: true`, il valore è anche scritto in `post_field_index` per query filtrate veloci.

---

## Slug

- **Generazione:** `generateSlug(title)` normalizza, rimuove diacritici, sostituisce spazi con `-`, elimina caratteri speciali.
- **Unicità:** `ensureUniqueSlug(db, codex, slug, excludeId?)` garantisce l'unicità per `(codex, slug)` — se esiste aggiunge `-2`, `-3`, ecc.
- Lo slug è auto-generato dal titolo alla creazione; può essere sovrascritto manualmente.

---

## REST API — Folios

Base path: `/api/v1/:codex`. Tutte le route richiedono autenticazione Bearer token.

### `GET /api/v1/:codex`

Elenca folios con paginazione e filtri.

**Query params:**

| Param | Tipo | Descrizione |
|---|---|---|
| `stage` | string | Filtra per stage (es. `draft`, `published`) |
| `page` | number | Pagina (default `1`) |
| `perPage` | number | Elementi per pagina (default `20`, max `100`) |
| `search` | string | Ricerca full-text su titolo e slug |
| `authorId` | number | Filtra per autore |
| `termSlug` | string | Filtra per term slug del vocabulary |
| `fieldName[op]` | number/string | Filtra su campo queryable: `price[gt]=100`, `sku[eq]=ABC` |

**Risposta:** `{ data: Folio[], total: number, page: number, perPage: number }`

### `GET /api/v1/:codex/:id`

Restituisce un singolo folio con fields parsati e terms raggruppati per vocabulary.

**Risposta:**
```json
{
  "id": 1,
  "codex": "post",
  "title": "Hello World",
  "slug": "hello-world",
  "content": "<p>...</p>",
  "fields": { "price": 99.9 },
  "stage": "published",
  "authorId": 1,
  "createdAt": 1700000000,
  "updatedAt": 1700000000,
  "terms": [
    { "termId": 1, "termName": "Tech", "termSlug": "tech", "vocabularySlug": "category" }
  ]
}
```

### `POST /api/v1/:codex`

Crea un nuovo folio. Richiede `edit_posts`.

**Body:**
```json
{
  "title":   "Titolo",
  "content": "<p>...</p>",
  "slug":    "titolo",
  "stage":   "draft",
  "fields":  {},
  "termIds": [1, 2]
}
```

- `slug` è opzionale: se omesso viene generato dal titolo
- `termIds` è opzionale: array di ID dei terms da associare

**Risposta:** `201 Created` con il folio creato.

### `PUT /api/v1/:codex/:id`

Aggiorna un folio esistente. Prima di aggiornare crea una revisione in `post_revisions`.

Richiede `edit_posts` (o `edit_others_posts` per folios altrui).

**Body:** stessi campi di POST, tutti opzionali.

**Risposta:** `200 OK` con il folio aggiornato.

### `DELETE /api/v1/:codex/:id`

Elimina definitivamente un folio. Richiede `delete_posts` (o `delete_others_posts`).

**Risposta:** `204 No Content`

### `GET /api/v1/:codex/:id/revisions`

Elenca le revisioni di un folio in ordine cronologico decrescente.

**Risposta:** array di oggetti revisione con `id, title, slug, stage, createdAt`.

### `POST /api/v1/:codex/:id/revisions/:revisionId/restore`

Ripristina una revisione: il folio viene aggiornato con i valori della revisione (e viene creata una nuova revisione dello stato corrente prima del ripristino).

**Risposta:** `200 OK` con il folio aggiornato.


| Name | Label | Icon |
|---|---|---|
| `post` | Posts | `pi-file-edit` |
| `page` | Pages | `pi-file-o` |

I post type custom vengono dichiarati in `config/phrasepress.config.ts` (vedi `docs/08-admin-shell.md`).

---

## PostTypeDefinition

```ts
interface PostTypeDefinition {
  name:    string            // identificatore univoco, es. 'product'
  label:   string            // etichetta UI, es. 'Products'
  icon?:   string            // icona PrimeIcons, es. 'pi-box'
  fields?: FieldDefinition[] // campi custom
}
```

### FieldDefinition

```ts
type FieldType =
  | 'string'       // testo breve
  | 'number'       // numero
  | 'boolean'      // vero/falso
  | 'richtext'     // HTML da Tiptap
  | 'date'         // data ISO
  | 'select'       // selezione da lista
  | 'textarea'     // testo lungo
  | 'image'        // ID media (plugin media)
  | 'relationship' // ID di un altro post
  | 'repeater'     // array di sottocampi

interface FieldDefinition {
  name:          string
  type:          FieldType
  label?:        string
  queryable?:    boolean   // se true, valore duplicato in post_field_index
  required?:     boolean
  options?:      string[]  // per type: 'select'
  fieldOptions?: Record<string, unknown>  // config per 'image', 'relationship'
  default?:      unknown
}
```

I valori dei custom fields sono salvati come JSON blob in `posts.fields`. Per campi con `queryable: true`, il valore è anche scritto in `post_field_index` per query filtrate veloci.

---

## Slug

- **Generazione:** `generateSlug(title)` normalizza, rimuove diacritici, sostituisce spazi con `-`, elimina caratteri speciali.
- **Unicità:** `ensureUniqueSlug(db, postType, slug, excludeId?)` garantisce l'unicità per `(postType, slug)` — se esiste aggiunge `-2`, `-3`, ecc.
- Lo slug è auto-generato dal titolo alla creazione; può essere sovrascritto manualmente.

---

## REST API — Posts

Base path: `/api/v1/posts`. Tutte le route richiedono autenticazione Bearer token.

### `GET /api/v1/posts`

Elenca post con paginazione e filtri.

**Query params:**

| Param | Tipo | Descrizione |
|---|---|---|
| `postType` | string | Filtra per post type (obbligatorio in pratica) |
| `status` | string | `draft`, `published`, `trash` |
| `page` | number | Pagina (default `1`) |
| `perPage` | number | Elementi per pagina (default `20`, max `100`) |
| `search` | string | Ricerca full-text su titolo e slug |
| `authorId` | number | Filtra per autore |
| `termSlug` | string | Filtra per term slug della taxonomy |
| `fieldName[op]` | number/string | Filtra su campo queryable: `price[gt]=100`, `sku[eq]=ABC` |

**Risposta:** `{ data: Post[], total: number, page: number, perPage: number }`

### `GET /api/v1/posts/:id`

Restituisce un singolo post con fields parsati e terms raggruppati per taxonomy.

**Risposta:**
```json
{
  "id": 1,
  "postType": "post",
  "title": "Hello World",
  "slug": "hello-world",
  "content": "<p>...</p>",
  "fields": { "price": 99.9 },
  "status": "published",
  "authorId": 1,
  "createdAt": 1700000000,
  "updatedAt": 1700000000,
  "terms": [
    { "termId": 1, "termName": "Tech", "termSlug": "tech", "taxonomySlug": "category" }
  ]
}
```

### `POST /api/v1/posts`

Crea un nuovo post. Richiede `edit_posts`.

**Body:**
```json
{
  "postType": "post",
  "title":    "Titolo",
  "content":  "<p>...</p>",
  "slug":     "titolo",
  "status":   "draft",
  "fields":   {},
  "termIds":  [1, 2]
}
```

- `slug` è opzionale: se omesso viene generato dal titolo
- `termIds` è opzionale: array di ID dei terms da associare

**Risposta:** `201 Created` con il post creato.

### `PUT /api/v1/posts/:id`

Aggiorna un post esistente. Prima di aggiornare crea una revisione in `post_revisions`.

Richiede `edit_posts` (o `edit_others_posts` per post altrui).

**Body:** stessi campi di POST, tutti opzionali.

**Risposta:** `200 OK` con il post aggiornato.

### `DELETE /api/v1/posts/:id`

Elimina definitivamente un post. Richiede `delete_posts` (o `delete_others_posts`).

**Risposta:** `204 No Content`

### `GET /api/v1/posts/:id/revisions`

Elenca le revisioni di un post in ordine cronologico decrescente.

**Risposta:** array di oggetti revisione con `id, title, slug, status, createdAt`.

### `POST /api/v1/posts/:id/revisions/:revisionId/restore`

Ripristina una revisione: il post viene aggiornato con i valori della revisione (e viene creata una nuova revisione dello stato corrente prima del ripristino).

**Risposta:** `200 OK` con il post aggiornato.
