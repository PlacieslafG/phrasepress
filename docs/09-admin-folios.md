# Editor Folio

La pagina `FolioEditorPage.vue` è l'editor principale per creare e modificare folios.

---

## Funzionalità

### Campo titolo + slug
- Il titolo è il campo principale, sempre visibile in cima
- Lo slug viene auto-generato dal titolo; può essere modificato manualmente tramite `SlugEditor.vue`
- Lo slug diventa un link cliccabile verso il frontend quando il folio è pubblicato

### Editor rich text (Tiptap)
- Gestito dal componente `RichTextEditor.vue`
- Formati supportati: grassetto, corsivo, liste, link, heading H1-H6
- Il valore è HTML serializzato

### Custom fields
Il pannello `CustomFieldsPanel.vue` mostra i campi definiti nel `blueprint` del `CodexDefinition`. Ogni tipo di campo ha un componente dedicato:

| FieldType | Componente |
|---|---|
| `string`, `textarea` | `InputText` / `Textarea` |
| `number` | `InputNumber` |
| `boolean` | `ToggleSwitch` |
| `richtext` | `RichTextEditor` |
| `date` | `DatePicker` |
| `select` | `Select` |
| `image` | `ImagePickerField` (plugin media) |
| `relationship` | `RelationshipField` |
| `repeater` | `RepeaterField` |

### Vocabularies
Per ogni vocabulary associato al codex, compare un componente `VocabularySelector.vue` che permette di selezionare o creare terms.

### Stage
Menu a tendina con le stages configurate nel codex. Il salvataggio è distinto dall'azione di pubblicazione.

### Revisioni
Il pannello laterale `RevisionsPanel.vue` mostra la cronologia delle versioni salvate. Cliccando su una revisione è possibile anteprima e ripristino.

---

## Lista folios (FolioListPage.vue)

- Paginazione
- Filtro per stage
- Visualizzazione: titolo, slug, autore, data modifica, stage
- Azioni: modifica, elimina (con conferma)
- Bottone "Nuovo" che porta all'editor vuoto

---

## API Client Folios (`src/api/folios.ts`)

```ts
import { getFolios, getFolio, createFolio, updateFolio, deleteFolio, getRevisions, restoreRevision } from '@/api/folios.js'

// Lista con filtri
const { data, total } = await getFolios('post', { stage: 'published', page: 1 })

// Crea
const folio = await createFolio('post', { title: 'Titolo', content: '<p>...</p>' })

// Aggiorna
const updated = await updateFolio('post', id, { title: 'Nuovo titolo', termIds: [1, 2] })

// Revisioni
const revisions = await getRevisions('post', id)
await restoreRevision('post', id, revisionId)
```


## Funzionalità

### Campo titolo + slug
- Il titolo è il campo principale, sempre visibile in cima
- Lo slug viene auto-generato dal titolo; può essere modificato manualmente tramite `SlugEditor.vue`
- Lo slug diventa un link cliccabile verso il frontend quando il post è pubblicato

### Editor rich text (Tiptap)
- Gestito dal componente `RichTextEditor.vue`
- Formati supportati: grassetto, corsivo, liste, link, heading H1-H6
- Il valore è HTML serializzato

### Custom fields
Il pannello `CustomFieldsPanel.vue` mostra i campi definiti nel `PostTypeDefinition`. Ogni tipo di campo ha un componente dedicato:

| FieldType | Componente |
|---|---|
| `string`, `textarea` | `InputText` / `Textarea` |
| `number` | `InputNumber` |
| `boolean` | `ToggleSwitch` |
| `richtext` | `RichTextEditor` |
| `date` | `DatePicker` |
| `select` | `Select` |
| `image` | `ImagePickerField` (plugin media) |
| `relationship` | `RelationshipField` |
| `repeater` | `RepeaterField` |

### Taxonomy
Per ogni taxonomy associata al post type, compare un componente `TaxonomySelector.vue` che permette di selezionare o creare terms.

### Stato
Menu a tendina con le opzioni: `draft`, `published`, `trash`. Il salvataggio è distinto dall'azione di pubblicazione.

### Revisioni
Il pannello laterale `RevisionsPanel.vue` mostra la cronologia delle versioni salvate. Cliccando su una revisione è possibile anteprima e ripristino.

---

## Lista post (PostListPage.vue)

- Paginazione
- Filtro per status (`draft`, `published`, `trash`)
- Visualizzazione: titolo, slug, autore, data modifica, status
- Azioni: modifica, elimina (con conferma)
- Bottone "Nuovo" che porta all'editor vuoto

---

## API Client Posts (`src/api/posts.ts`)

```ts
import { getPosts, getPost, createPost, updatePost, deletePost, getRevisions, restoreRevision } from '@/api/posts.js'

// Lista con filtri
const { data, total } = await getPosts({ postType: 'post', status: 'published', page: 1 })

// Crea
const post = await createPost({ postType: 'post', title: 'Titolo', content: '<p>...</p>' })

// Aggiorna
const updated = await updatePost(id, { title: 'Nuovo titolo', termIds: [1, 2] })

// Revisioni
const revisions = await getRevisions(id)
await restoreRevision(id, revisionId)
```
