# Post Types e API Post

## Post type di default

All'avvio del server vengono registrati automaticamente:

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
