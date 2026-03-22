# Gestione Terms (Tassonomie)

La pagina `TermsPage.vue` gestisce i terms di una taxonomy specifica.

---

## Funzionalità

- **Lista terms** in DataTable con colonne: nome, slug, descrizione, numero di post
- Per taxonomy **gerarchiche** (es. Categories): visualizzazione ad albero con indent per livelli, campo parent nella creazione
- **Aggiungi term**: dialog con campi nome, slug (auto-generato), descrizione, parent (se hierarchical)
- **Modifica term**: stessa dialog in edit mode
- **Elimina term**: dialog di conferma; i figli vengono spostati al livello root
- Conteggio post associati (`postCount`) su ogni riga

---

## Navigation

Ogni taxonomy appare nella sidebar dell'admin sotto la sezione **Tassonomie**. Le taxonomy sono caricate dallo store `app` tramite `GET /api/v1/taxonomies`.

---

## API Client (`src/api/taxonomies.ts`)

```ts
import { getTerms, createTerm, updateTerm, deleteTerm } from '@/api/taxonomies.js'

// Lista (con struttura ad albero per hierarchical)
const terms = await getTerms('category')

// Crea
await createTerm('category', { name: 'Tech', description: '...', parentId: null })

// Aggiorna
await updateTerm('category', termId, { name: 'Tecnologia' })

// Elimina
await deleteTerm('category', termId)
```
