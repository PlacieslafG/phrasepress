# Vocabularies e Terms

## Vocabularies di default

Nessun vocabulary è registrato di default. Tutti i vocabularies vengono dichiarati in `config/phrasepress.config.ts`.

Esempio:
```ts
export default defineConfig({
  vocabularies: [
    { slug: 'category', name: 'Categories', codices: ['post'], hierarchical: true },
    { slug: 'tag',      name: 'Tags',       codices: ['post'], hierarchical: false },
  ],
})
```

---

## VocabularyDefinition

```ts
interface VocabularyDefinition {
  slug:         string     // identificatore, es. 'genre'
  name:         string     // etichetta plurale, es. 'Genres'
  codices:      string[]   // codici a cui si applica (nome del codex)
  hierarchical: boolean    // true = struttura ad albero (come categorie)
  icon?:        string     // icona PrimeIcons
}
```

I vocabularies vengono sincronizzati con il DB all'avvio (`syncVocabulariesWithDb`): crea il record se non esiste, non elimina vocabularies rimossi dalla config (per preservare i terms).

---

## REST API — Vocabularies

Base path: `/api/v1/vocabularies`. Tutte le route richiedono autenticazione.

### `GET /api/v1/vocabularies`

Restituisce la lista di tutti i vocabularies registrati (dal registro in memoria).

**Risposta:**
```json
[
  { "slug": "category", "name": "Categories", "codices": ["post"], "hierarchical": true }
]
```

### `GET /api/v1/vocabularies/:vocabularySlug/terms`

Elenca i terms di un vocabulary, con `postCount` per ciascuno.

Per vocabularies gerarchici, i terms sono restituiti come albero annidato (`children: []`).

**Query params:**

| Param | Tipo | Descrizione |
|---|---|---|
| `search` | string | Filtra per nome |
| `parentId` | number | Solo figli di un parent specifico |

**Risposta (flat):**
```json
[
  { "id": 1, "name": "Tech", "slug": "tech", "parentId": null, "postCount": 5 }
]
```

**Risposta (hierarchical):**
```json
[
  {
    "id": 1, "name": "Tech", "slug": "tech", "postCount": 5,
    "children": [
      { "id": 2, "name": "AI", "slug": "ai", "parentId": 1, "postCount": 2, "children": [] }
    ]
  }
]
```

### `POST /api/v1/vocabularies/:vocabularySlug/terms`

Crea un nuovo term. Richiede `manage_terms`.

**Body:**
```json
{
  "name":        "Tecnologia",
  "slug":        "tecnologia",
  "description": "...",
  "parentId":    null
}
```

`slug` è opzionale (generato da `name`). `parentId` è opzionale (solo per vocabularies gerarchici).

**Risposta:** `201 Created`

### `PUT /api/v1/vocabularies/:vocabularySlug/terms/:id`

Aggiorna un term. Richiede `manage_terms`.

Previene cicli gerarchici: non è possibile impostare come `parentId` un discendente del term stesso.

**Risposta:** `200 OK`

### `DELETE /api/v1/vocabularies/:vocabularySlug/terms/:id`

Elimina un term e tutte le sue associazioni con i folios. Richiede `manage_terms`.

Per vocabularies gerarchici, i figli del term eliminato vengono spostati al livello root (il loro `parentId` diventa `null`).

**Risposta:** `204 No Content`

---

## Associazione folio ↔ terms

Quando si crea o aggiorna un folio, il campo `termIds` nell'API gestisce le associazioni:

```json
{ "termIds": [1, 3, 7] }
```

Le associazioni vengono completamente rimpiazzate ad ogni aggiornamento (DELETE + INSERT su `post_terms`).

Per filtrare i folios per term, usare il query param `termSlug` sull'API dei folios.


| Slug | Name | Post types | Hierarchical |
|---|---|---|---|
| `category` | Categories | `post` | ✅ |
| `tag` | Tags | `post` | ❌ |

Le taxonomy custom si dichiarano in `config/phrasepress.config.ts`.

---

## TaxonomyDefinition

```ts
interface TaxonomyDefinition {
  slug:         string     // identificatore, es. 'genre'
  name:         string     // etichetta plurale, es. 'Genres'
  postTypes:    string[]   // post type a cui si applica
  hierarchical: boolean    // true = struttura ad albero (come categorie)
  icon?:        string     // icona PrimeIcons
}
```

Le taxonomy vengono sincronizzate con il DB all'avvio (`syncTaxonomiesWithDb`): crea il record se non esiste, non elimina taxonomy rimosse dalla config (per preservare i terms).

---

## REST API — Taxonomies

Base path: `/api/v1/taxonomies`. Tutte le route richiedono autenticazione.

### `GET /api/v1/taxonomies`

Restituisce la lista di tutte le taxonomy registrate (dal registro in memoria).

**Risposta:**
```json
[
  { "slug": "category", "name": "Categories", "postTypes": ["post"], "hierarchical": true }
]
```

### `GET /api/v1/taxonomies/:taxonomySlug/terms`

Elenca i terms di una taxonomy, con `postCount` per ciascuno.

Per taxonomy gerarchiche, i terms sono restituiti come albero annidato (`children: []`).

**Query params:**

| Param | Tipo | Descrizione |
|---|---|---|
| `search` | string | Filtra per nome |
| `parentId` | number | Solo figli di un parent specifico |

**Risposta (flat):**
```json
[
  { "id": 1, "name": "Tech", "slug": "tech", "parentId": null, "postCount": 5 }
]
```

**Risposta (hierarchical):**
```json
[
  {
    "id": 1, "name": "Tech", "slug": "tech", "postCount": 5,
    "children": [
      { "id": 2, "name": "AI", "slug": "ai", "parentId": 1, "postCount": 2, "children": [] }
    ]
  }
]
```

### `POST /api/v1/taxonomies/:taxonomySlug/terms`

Crea un nuovo term. Richiede `manage_terms`.

**Body:**
```json
{
  "name":        "Tecnologia",
  "slug":        "tecnologia",
  "description": "...",
  "parentId":    null
}
```

`slug` è opzionale (generato da `name`). `parentId` è opzionale (solo per taxonomy gerarchiche).

**Risposta:** `201 Created`

### `PUT /api/v1/taxonomies/:taxonomySlug/terms/:id`

Aggiorna un term. Richiede `manage_terms`.

Previene cicli gerarchici: non è possibile impostare come `parentId` un discendente del term stesso.

**Risposta:** `200 OK`

### `DELETE /api/v1/taxonomies/:taxonomySlug/terms/:id`

Elimina un term e tutte le sue associazioni con i post. Richiede `manage_terms`.

Per taxonomy gerarchiche, i figli del term eliminato vengono spostati al livello root (il loro `parentId` diventa `null`).

**Risposta:** `204 No Content`

---

## Associazione post ↔ terms

Quando si crea o aggiorna un post, il campo `termIds` nell'API post gestisce le associazioni:

```json
{ "termIds": [1, 3, 7] }
```

Le associazioni vengono completamente rimpiazzate ad ogni aggiornamento (DELETE + INSERT su `post_terms`).

Per filtrare i post per term, usare il query param `termSlug` sull'API dei post.
