---
applyTo: "config/**"
description: "Use when working on phrasepress.config.ts, defining custom post types, custom taxonomies, registering plugins, or using defineConfig, PostTypeDefinition, TaxonomyDefinition, FieldDefinition APIs."
---

# Istruzioni — Configurazione utente (`phrasepress.config.ts`)

**Documentazione di riferimento:** `docs/03-post-types.md`, `docs/04-taxonomies.md`, `docs/06-plugins.md`

## Struttura base

```ts
// config/phrasepress.config.ts
import { defineConfig } from '../packages/core/src/config.js'

export default defineConfig({
  postTypes:  [...],
  taxonomies: [...],
  plugins:    [...],
})
```

`defineConfig` è l'unico punto di ingresso — non esportare oggetti raw. Il file è caricato dinamicamente al boot di `createServer()`.

## Custom Post Types

```ts
import type { PostTypeDefinition } from '../packages/core/src/post-types/registry.js'

{
  name:   'product',        // identificatore (snake_case) — usato nelle URL e nel DB
  label:  'Products',       // label plurale mostrata nell'admin
  icon?:  'pi-box',         // nome icona PrimeIcons (opzionale)
  fields?: [                // custom fields (opzionale)
    {
      name:      'price',
      type:      'number',
      label:     'Price',
      queryable: true,      // se true, indicizzato in post_field_index per filtri API
      required:  false,
    },
    {
      name:    'status_custom',
      type:    'select',
      label:   'Availability',
      options: ['in-stock', 'out-of-stock', 'pre-order'],
    },
  ],
}
```

### Tipi di campo disponibili (`FieldType`)

| Tipo | Descrizione | Note |
|---|---|---|
| `string` | Testo breve | Input text |
| `number` | Numero | Input numerico |
| `boolean` | Sì/No | Toggle |
| `richtext` | HTML arricchito | Editor Tiptap |
| `date` | Data | DatePicker |
| `select` | Selezione singola | Richiede `options: string[]` |
| `textarea` | Testo lungo | Textarea piana |
| `image` | Immagine da media library | Richiede plugin media attivo |
| `relationship` | Riferimento ad altro post | Richiede `fieldOptions.postType` |
| `repeater` | Lista di sottocampi | Richiede `fieldOptions.fields` |

## Custom Taxonomies

```ts
{
  slug:         'genre',      // identificatore (kebab-case) — usato nelle URL
  name:         'Genres',     // label plurale mostrata nell'admin
  postTypes:    ['product'],  // post type a cui si applica (array)
  hierarchical: true,         // true = categorie (con parent), false = tag
  icon?:        'pi-tags',    // icona PrimeIcons (opzionale)
}
```

- Le taxonomies vengono sincronizzate nel DB al boot tramite `syncTaxonomiesWithDb()`.
- Post types built-in (`post`, `page`) hanno già `category` e `tag` registrate di default.
- Non registrare taxonomy con lo stesso `slug` dei built-in — lancerebbe un errore.

## Plugin

```ts
plugins: [
  // Dynamic import necessario — il file config è caricato con top-level await
  (await import('../packages/plugins/media/src/index.js')).default,
  (await import('../packages/plugins/fields/src/index.js')).default,
]
```

- L'ordine dei plugin è l'ordine di registrazione — mettere prima i plugin con dipendenze.
- Plugin di terze parti: installare il package e importarlo allo stesso modo.
- Per plugin custom locali: creare in `packages/plugins/my-plugin/` seguendo la struttura degli esistenti.

## registerFieldGroup — gruppi di field da config (senza UI)

Per aggiungere field groups programmaticamente (senza passare dall'admin UI):

```ts
import { registerFieldGroup } from '../packages/plugins/fields/src/index.js'

// Chiamare PRIMA di defineConfig
registerFieldGroup({
  name:      'Product Details',
  postTypes: ['product'],
  fields:    [
    { name: 'price',       type: 'number', label: 'Price',       queryable: true },
    { name: 'sku',         type: 'string', label: 'SKU',         queryable: true },
    { name: 'description', type: 'richtext', label: 'Full Description' },
  ],
})

export default defineConfig({ ... })
```

Richiede che il plugin `fields` sia attivo.

## Post types built-in

Già registrati dal core — non ridefinirli nel config:

| name | label | Taxonomies |
|---|---|---|
| `post` | Posts | `category`, `tag` |
| `page` | Pages | — |
