# Modulo 05 — Hook System

**Dipendenze:** `01-setup.md`  
**Produce:** sistema actions + filters usabile da core e plugin

---

## Obiettivo

Implementare un sistema di hook (actions e filters) ispirato a WordPress. È il meccanismo che permette ai plugin di agganciarsi al comportamento del core senza modificarlo.

---

## Concetti

- **Action:** notifica che qualcosa è avvenuto. Il listener esegue side effects (log, email, ecc.). Non restituisce valori.
- **Filter:** trasforma un valore. Il listener riceve il valore, lo modifica e lo restituisce. Il core usa il valore modificato.

```ts
// Action: notifica che un post è stato salvato
doAction('post.saved', { postId: 1, postType: 'book' })

// Filter: modifica il titolo prima di salvarlo
const finalTitle = applyFilters('post.title', rawTitle, { postType: 'book' })
```

---

## Interfacce TypeScript

```ts
type ActionHandler  = (...args: unknown[]) => void | Promise<void>
type FilterHandler  = (value: unknown, ...args: unknown[]) => unknown | Promise<unknown>

interface HookEntry {
  handler:  ActionHandler | FilterHandler
  priority: number    // default 10, ordine di esecuzione basso = prima
}
```

---

## Classe `HookManager`

File: `packages/core/src/hooks/HookManager.ts`

```ts
class HookManager {
  // Actions
  addAction(hook: string, handler: ActionHandler, priority?: number): void
  removeAction(hook: string, handler: ActionHandler): void
  doAction(hook: string, ...args: unknown[]): Promise<void>
  doActionSync(hook: string, ...args: unknown[]): void

  // Filters
  addFilter(hook: string, handler: FilterHandler, priority?: number): void
  removeFilter(hook: string, handler: FilterHandler): void
  applyFilters(hook: string, value: unknown, ...args: unknown[]): Promise<unknown>
  applyFiltersSync(hook: string, value: unknown, ...args: unknown[]): unknown
}
```

### Dettagli implementativi
- I listener sono ordinati per `priority` (ascendente) al momento dell'esecuzione
- `doAction` esegue i listener in sequenza (non in parallelo) per garantire ordine deterministico
- `applyFilters` passa il valore di ritorno di ogni listener al successivo (catena)
- Le versioni `*Sync` sono disponibili per contesti sincroni (es. bootstrap), ma se un listener è async in un contesto sync → errore esplicito

---

## Hook built-in del core

### Post hooks
| Hook | Tipo | Args | Quando |
|---|---|---|---|
| `post.beforeCreate` | filter | `(postData)` | Prima di inserire in DB |
| `post.created` | action | `(post)` | Dopo la creazione |
| `post.beforeUpdate` | filter | `(postData, existingPost)` | Prima di aggiornare |
| `post.updated` | action | `(post, previousPost)` | Dopo l'aggiornamento |
| `post.beforeDelete` | action | `(post)` | Prima dell'eliminazione |
| `post.deleted` | action | `(postId, postType)` | Dopo l'eliminazione |
| `post.statusChanged` | action | `(post, oldStatus, newStatus)` | Cambio status |

### Term hooks
| Hook | Tipo | Args |
|---|---|---|
| `term.created` | action | `(term, taxonomySlug)` |
| `term.updated` | action | `(term, previousTerm)` |
| `term.deleted` | action | `(termId, taxonomySlug)` |

### Auth hooks
| Hook | Tipo | Args |
|---|---|---|
| `user.login` | action | `(user)` |
| `user.logout` | action | `(userId)` |
| `user.created` | action | `(user)` |

### API hooks
| Hook | Tipo | Args |
|---|---|---|
| `api.response` | filter | `(responseData, request)` | Prima di ogni risposta |

---

## Esposizione pubblica

Il `HookManager` viene istanziato una volta nel bootstrap e passato al contesto dell'app. Le funzioni helper sono esportate come shortcut:

```ts
// packages/core/src/hooks/index.ts
export const hooks = new HookManager()
export const addAction    = hooks.addAction.bind(hooks)
export const doAction     = hooks.doAction.bind(hooks)
export const addFilter    = hooks.addFilter.bind(hooks)
export const applyFilters = hooks.applyFilters.bind(hooks)
```

---

## Struttura file

```
src/hooks/
├── HookManager.ts   # implementazione
└── index.ts         # singleton + export helper functions
```

---

## Checklist

- [ ] Scrivere `HookManager` con actions e filters
- [ ] Garantire ordinamento per priority
- [ ] Implementare versioni async (default) e sync
- [ ] Aggiungere `doAction` e `applyFilters` nelle route posts (es. `post.created`, `post.beforeCreate`)
- [ ] Aggiungere hook nei term e auth (moduli successivi)
- [ ] Esportare il singleton e le funzioni helper
- [ ] Testare: registrare un action listener, chiamare doAction, verificare esecuzione
- [ ] Testare: registrare due filter con priority diversa, verificare ordine applicazione
