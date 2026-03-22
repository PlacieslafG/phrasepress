# Modulo 10 — Admin: Gestione Terms (Taxonomies)

**Dipendenze:** `08-admin-shell.md`, `04-taxonomies.md`  
**Produce:** pagina per creare, modificare ed eliminare terms di una taxonomy

---

## Obiettivo

Interfaccia admin per gestire i terms di ogni taxonomy registrata. Il layout è simile alla pagina "Categorie" / "Tag" di WordPress: form a sinistra + lista a destra.

---

## `TermsPage.vue`

Route: `/taxonomy/:slug`

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Genera / Tag / [Nome Taxonomy]                      │
├───────────────────────┬─────────────────────────────┤
│  Aggiungi nuovo term  │  Lista terms                │
│  ─────────────────    │  ─────────────────────────  │
│  Nome:                │  Nome   Slug   Desc   Post  │
│  [_______________]    │  ─────────────────────────  │
│                       │  Fantasy  fantasy  ...   12 │
│  Slug:                │  Sci-fi   sci-fi   ...    4 │
│  [_______________]    │  ─────────────────────────  │
│  (auto da nome)       │                             │
│                       │                             │
│  Descrizione:         │                             │
│  [_______________]    │                             │
│                       │                             │
│  Genitore:            │  (solo se hierarchical)     │
│  [Select parent]      │                             │
│                       │                             │
│  [Aggiungi Term]      │                             │
└───────────────────────┴─────────────────────────────┘
```

---

## Comportamento

### Caricamento
- Al mount e al cambio di `:slug`: carica taxonomy definition da `appStore` e terms con `GET /taxonomies/:slug/terms`
- Se taxonomy è `hierarchical`: carica tutti i terms flat e costruisce albero lato client per il select "Genitore"

### Form "Aggiungi term"
- Nome: required
- Slug: auto-generato dal nome, editabile manualmente
- Descrizione: facoltativa
- Genitore: visibile solo se taxonomy è `hierarchical`, select con lista terms esistenti flat (esclude il term corrente in modifica)
- On submit: `POST /api/v1/taxonomies/:slug/terms`
- On success: svuota form, aggiunge il nuovo term alla lista senza reload

### Lista terms
- Tabella PrimeVue con colonne: Nome, Slug, Descrizione (troncata), Conteggio post
- Azione per riga: "Modifica" (inline edit nella tabella o form a sinistra si popola), "Elimina"
- Click "Modifica": popola il form a sinistra con i dati del term. Il pulsante diventa "Aggiorna Term". Pulsante "Annulla" per tornare a form vuoto.
- On "Aggiorna": `PUT /api/v1/taxonomies/:slug/terms/:id`
- On "Elimina": dialog di conferma, poi `DELETE /api/v1/taxonomies/:slug/terms/:id`

### Visualizzazione gerarchica
- Se `hierarchical: true`: nella lista mostrare l'indentazione dei terms figli (con prefisso `—`)
- Esempio:
  ```
  Fiction
  — Fantasy
  — — Epic Fantasy
  — Sci-Fi
  Non-Fiction
  ```

---

## Conteggio post per term

La API `GET /taxonomies/:slug/terms` dovrebbe includere il conteggio dei post pubblicati associati a ciascun term. Aggiungere questo al modulo 04 se non già previsto:

```sql
SELECT terms.*, COUNT(post_terms.post_id) as postCount
FROM terms
LEFT JOIN post_terms ON terms.id = post_terms.term_id
GROUP BY terms.id
```

---

## Componenti

### `TermForm.vue`
- Props: `taxonomy`, `editingTerm?` (per modifica), `existingTerms` (per select genitore)
- Emette: `submitted(newTerm)`, `cancelled`
- Gestisce generazione slug automatica

### `TermsTable.vue`
- Props: `terms`, `hierarchical`
- Emette: `edit(term)`, `delete(term)`
- Se `hierarchical`: ordina e indenta la lista

---

## Checklist

- [ ] Implementare `TermsPage.vue` con layout diviso
- [ ] Implementare `TermForm.vue` con auto-slug e select genitore condizionale
- [ ] Implementare `TermsTable.vue` con indentazione gerarchica
- [ ] Collegare form "Aggiungi" con `POST` e aggiornamento lista locale
- [ ] Collegare modifica inline (popola form) con `PUT`
- [ ] Collegare eliminazione con dialog di conferma e `DELETE`
- [ ] Aggiungere conteggio post nella query dei terms (lato core)
- [ ] Testare taxonomy gerarchica (categorie con figli) e flat (tag)
