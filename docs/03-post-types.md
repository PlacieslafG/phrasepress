# Modulo 03 — Post Types & CRUD Posts

**Dipendenze:** `02-database.md`  
**Produce:** registro post type, slug automatico, CRUD API Fastify per i post

---

## Obiettivo

Creare il registro dei post type e le API REST per creare, leggere, aggiornare ed eliminare i post. La logica dei custom fields (indicizzazione) è gestita qui al momento del salvataggio.

---

## PostTypeRegistry

File: `packages/core/src/post-types/registry.ts`

### Interfacce TypeScript

```ts
type FieldType = 'string' | 'number' | 'boolean' | 'richtext' | 'date' | 'select'

interface FieldDefinition {
  name:       string
  type:       FieldType
  label?:     string
  queryable?: boolean          // default false — se true, scritto in post_field_index
  required?:  boolean
  options?:   string[]         // solo per type: 'select'
  default?:   unknown
}

interface PostTypeDefinition {
  name:     string             // es. 'product'
  label:    string             // es. 'Products'
  icon?:    string             // nome icona PrimeIcons
  fields?:  FieldDefinition[]
}
```

### Classe `PostTypeRegistry`
- `register(def: PostTypeDefinition): void` — aggiunge al registro
- `get(name: string): PostTypeDefinition | undefined`
- `getAll(): PostTypeDefinition[]`
- `exists(name: string): boolean`

### Post type di default
Registrati al boot in `bootstrap.ts`:
```ts
registry.register({ name: 'post',  label: 'Posts',  icon: 'pi-file' })
registry.register({ name: 'page',  label: 'Pages',  icon: 'pi-file-text' })
```

---

## Slug Generation

File: `packages/core/src/post-types/slug.ts`

- `generateSlug(title: string): string` — converte in lowercase, sostituisce spazi con `-`, rimuove caratteri speciali
- `ensureUniqueSlug(db, postType, baseSlug, excludeId?): Promise<string>` — controlla unicità su `(postType, slug)`, appende `-2`, `-3`, ecc. se necessario

---

## API Routes — Posts

Prefisso: `/api/v1/posts`  
File: `packages/core/src/api/posts.ts`

### `GET /api/v1/posts`

Query params:
- `type` (obbligatorio) — post type name
- `status` — `draft` | `published` | `trash` | `any`
- `[termSlug]` — filtra per taxonomy term (es. `?genre=fantasy`)
- `[fieldName][gt|lt|eq]` — filtra per campo queryable (es. `?price[lt]=50`)
- `page`, `limit` — paginazione (default: 20)
- `orderBy`, `order` — campo e direzione ordinamento

Logica query:
1. Query base su `posts` filtrata per `postType` e `status`
2. Se filtri su terms: JOIN `post_terms` → `terms` per taxonomy
3. Se filtri su campi queryable: JOIN `post_field_index` con condizione su colonna tipizzata
4. Paginazione con OFFSET/LIMIT
5. Risposta: `{ data: Post[], total, page, limit }`

### `GET /api/v1/posts/:idOrSlug`
- Accetta sia ID numerico che slug
- Risposta: post completo con `fields` (JSON parsato), lista terms per taxonomy

### `POST /api/v1/posts`
Richiede auth + capability `edit_posts`.

Body:
```ts
{
  postType: string
  title:    string
  slug?:    string       // se omesso, generato da title
  content?: string       // HTML da Tiptap
  fields?:  Record<string, unknown>
  status?:  'draft' | 'published'
  termIds?: number[]
}
```

Logica:
1. Validare che `postType` esista nel registro
2. Validare i `fields` contro lo schema del post type
3. Generare/verificare slug univocità
4. Inserire in `posts`
5. Per ogni campo `queryable: true`: inserire in `post_field_index`
6. Inserire associazioni in `post_terms`
7. Creare revisione in `post_revisions` (snapshot iniziale)
8. Risposta: post creato

### `PUT /api/v1/posts/:id`
Richiede auth + capability `edit_posts` (o `edit_others_posts` se non proprio autore).

Logica:
1. Fetch post esistente
2. Validare modifiche
3. **Creare revisione** dello stato attuale PRIMA di aggiornare
4. Aggiornare `posts`
5. Cancellare e riscrivere le righe `post_field_index` per questo post
6. Aggiornare `post_terms`
7. Risposta: post aggiornato

### `DELETE /api/v1/posts/:id`
Richiede auth + capability `delete_posts`.
- Soft delete: imposta `status = 'trash'`
- Hard delete (con `?force=true`): elimina fisicamente (cascade su `post_field_index`, `post_revisions`, `post_terms`)

### `GET /api/v1/posts/:id/revisions`
Richiede auth.
Risposta: lista revisioni ordinate per data desc.

### `POST /api/v1/posts/:id/revisions/:revId/restore`
Richiede auth + capability `edit_posts`.
Logica:
1. Fetch revisione
2. Creare revisione dello stato attuale (per non perderlo)
3. Sovrascrivere il post con i dati della revisione
4. Riscrivere `post_field_index`

---

## Struttura file

```
src/post-types/
├── registry.ts     # PostTypeRegistry class
├── slug.ts         # generazione e unicità slug
└── index.ts        # export pubblici

src/api/
├── posts.ts        # Fastify plugin con tutte le route /posts
└── index.ts        # registra tutti i route plugin su Fastify
```

---

## Checklist

- [ ] Scrivere interfacce `FieldDefinition`, `PostTypeDefinition`
- [ ] Implementare `PostTypeRegistry`
- [ ] Registrare post type default (`post`, `page`) nel bootstrap
- [ ] Scrivere `generateSlug()` e `ensureUniqueSlug()`
- [ ] Implementare `GET /posts` con tutti i filtri (incluso queryable fields e terms)
- [ ] Implementare `GET /posts/:idOrSlug`
- [ ] Implementare `POST /posts` con validazione campi + scrittura `post_field_index` + revisione
- [ ] Implementare `PUT /posts/:id` con snapshot revisione pre-aggiornamento
- [ ] Implementare `DELETE /posts/:id` (soft + hard)
- [ ] Implementare `GET /posts/:id/revisions`
- [ ] Implementare `POST /posts/:id/revisions/:revId/restore`
- [ ] Testare manualmente con un tool HTTP (curl / httpie / Insomnia)
