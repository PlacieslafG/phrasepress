# Modulo 09 — Admin: Lista Post ed Editor

**Dipendenze:** `08-admin-shell.md`, `03-post-types.md`, `04-taxonomies.md`  
**Produce:** pagina lista post e editor completo con Tiptap, custom fields, terms, revisioni

---

## Obiettivo

Implementare le due pagine centrali dell'admin: la lista dei post filtrabili e l'editor completo con rich text, custom fields dinamici, selezione terms e pannello revisioni.

---

## `PostListPage.vue`

Route: `/posts/:type`

### Componenti
- `DataTable` (PrimeVue) con colonne: Titolo, Status, Autore, Data, Azioni
- Filtri in header: status (select), taxonomy terms (multi-select per ogni taxonomy associata)
- Paginazione lato server (page/limit dalla query API)
- Pulsante "Nuovo [tipo]" che naviga a `/posts/:type/new`
- Azioni per riga: Modifica, Cestina, (Elimina definitivamente se in trash)

### Comportamento
- Al cambio di `:type` nella route: ricarica la lista (watch il parametro)
- Il titolo della pagina e il nome del pulsante "Nuovo" usano il `label` del post type (da `appStore`)
- Stato "trash": scheda separata o filtro dedicato

---

## `PostEditorPage.vue`

Route: `/posts/:type/new` e `/posts/:type/:id/edit`

### Layout editor

```
┌──────────────────────────────┬─────────────────────┐
│ ← Back  |  Titolo post       │  [Bozza]  [Pubblica] │
├──────────────────────────────┴─────────────────────┤
│                                                     │
│  [Input: Titolo]                                    │
│  Slug: /my-post-title  [modifica]                   │
│                                                     │
│  ┌─ Rich Text Editor (Tiptap) ──────────────────┐  │
│  │  B  I  U  Link  H1  H2  ul  ol  blockquote   │  │
│  │                                               │  │
│  │  Contenuto...                                 │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ Custom Fields ─────────────────────────────┐   │
│  │  Price:  [number input]                      │   │
│  │  SKU:    [text input]                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Sidebar destra:                                    │
│  ┌─ Status ──────────┐  ┌─ Category ─────────┐     │
│  │ ○ Bozza           │  │ ☑ Tech              │     │
│  │ ● Pubblicato      │  │ ☐ News              │     │
│  └───────────────────┘  └────────────────────┘     │
│  ┌─ Revisioni ───────────────────────────────┐     │
│  │  20/03/2026 14:32 - admin  [Ripristina]   │     │
│  │  20/03/2026 11:10 - admin  [Ripristina]   │     │
│  └───────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

---

## Componenti dell'editor

### `TitleInput.vue`
- `<input>` per il titolo
- Al cambio: genera automaticamente lo slug (`generateSlug(title)`)
- Mostra lo slug sotto il titolo in formato `/my-slug` con pulsante "modifica"

### `SlugEditor.vue`
- In modalità view: mostra `/slug` come testo
- In modalità edit: input testuale + pulsante "Salva" e "Annulla"
- Validazione: solo lowercase, trattini, numeri

### `RichTextEditor.vue`
Wrapper del Tiptap editor:
- Extensions: `StarterKit`, `Link`, `Image` (base, senza upload — per ora URL)
- Toolbar con i comandi principali
- Emette `update:modelValue` con HTML serializzato
- Può ricevere HTML iniziale (per modifica post esistente)

### `CustomFieldsPanel.vue`
- Riceve `fieldDefinitions: FieldDefinition[]` (dallo schema del post type)
- Riceve `modelValue: Record<string, unknown>` (valori attuali)
- Per ogni campo renderizza il componente corretto:

| `type` | Componente |
|---|---|
| `string` | `<InputText>` (PrimeVue) |
| `number` | `<InputNumber>` (PrimeVue) |
| `boolean` | `<ToggleSwitch>` |
| `richtext` | `<RichTextEditor>` (Tiptap) |
| `date` | `<DatePicker>` (PrimeVue) |
| `select` | `<Select>` con `options` dalla definizione |

- Emette `update:modelValue` con i valori aggiornati

### `TaxonomySelector.vue`
- Riceve `taxonomy: TaxonomyDefinition` e i term già selezionati
- Carica i terms via API
- Gerarchico: `<Tree>` (PrimeVue) con checkbox
- Non gerarchico: `<MultiSelect>` con ricerca

### `RevisionsPanel.vue`
- Carica `GET /posts/:id/revisions`
- Lista revisioni con data e autore
- Pulsante "Ripristina" con dialog di conferma: "Questa azione sovrascriverà il contenuto attuale. Vuoi continuare?"

---

## Logica salvataggio

### Nuovo post (`/new`)
1. Click "Bozza" o "Pubblica" → chiama `POST /api/v1/posts`
2. On success: redirect a `/posts/:type/:id/edit` (update URL senza reload)

### Modifica post (`/:id/edit`)
1. Al mount: carica post con `GET /posts/:idOrSlug`, popola tutti i campi
2. Carica revisioni
3. Click "Salva" → chiama `PUT /api/v1/posts/:id`
4. On success: mostra toast "Salvato" e aggiorna la lista revisioni

### Auto-save (opzionale, fase successiva)
Non nell'MVP — esplicito salvataggio manuale per ora.

---

## Gestione errori
- Errori di validazione dalla API (es. slug duplicato): mostrati sotto il campo pertinente
- Errori generici: Toast PrimeVue in alto a destra

---

## Checklist

- [ ] Implementare `PostListPage.vue` con DataTable, filtri, paginazione
- [ ] Implementare `PostEditorPage.vue` con layout a colonne
- [ ] Implementare `TitleInput.vue` + auto-slug
- [ ] Implementare `SlugEditor.vue` con toggle view/edit
- [ ] Implementare `RichTextEditor.vue` con Tiptap + toolbar
- [ ] Implementare `CustomFieldsPanel.vue` con tutti i tipi di campo
- [ ] Implementare `TaxonomySelector.vue` (gerarchico + flat)
- [ ] Implementare `RevisionsPanel.vue` con ripristino
- [ ] Collegare salvataggio nuovo post con redirect
- [ ] Collegare salvataggio modifica con toast feedback
- [ ] Testare con un post type custom con campi numerici queryable
