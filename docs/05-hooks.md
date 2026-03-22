# Hook System

PhrasePress usa un sistema di hook (ispirato a WordPress) per rendere il core estensibile senza modificarlo. Ci sono due tipi: **actions** (eventi) e **filters** (trasformazioni di valori).

L'oggetto `HookManager` è disponibile nei plugin tramite `ctx.hooks`.

---

## Actions

Le actions sono eventi: il core li emette, i plugin reagiscono.

### Registrare un handler

```ts
ctx.hooks.addAction('form.submitted', async (payload) => {
  // payload è il dato passato da doAction()
}, priority) // priority opzionale, default 10
```

### Rimuovere un handler

```ts
ctx.hooks.removeAction('form.submitted', myHandler)
```

### Emettere un'action (dal core o da un plugin)

```ts
// Asincrono — aspetta tutti gli handler
await ctx.hooks.doAction('form.submitted', { form, submission })

// Sincrono — lancia errore se qualche handler è async
ctx.hooks.doActionSync('my.sync.action', data)
```

Gli handler vengono eseguiti in ordine di **priority** crescente (priorità più bassa = eseguito prima).

---

## Filters

I filters trasformano un valore passandolo attraverso una catena di handler.

### Registrare un filter

```ts
ctx.hooks.addFilter('post_types.meta', (types) => {
  // modifica e restituisce il valore trasformato
  return [...types, { name: 'extra', label: 'Extra' }]
})
```

### Applicare un filter

```ts
// Asincrono
const result = await ctx.hooks.applyFilters('post_types.meta', originalTypes)

// Sincrono
const result = ctx.hooks.applyFiltersSync('my.filter', value)
```

---

## Hook built-in

### Actions

| Hook | Emesso da | Payload |
|---|---|---|
| `form.submitted` | Plugin Forms — `POST /public/submit/:slug` | `{ form: { id, name, fields }, submission: { id, data: string } }` |

### Filters

| Hook | Emesso da | Valore filtrato |
|---|---|---|
| `post_types.meta` | `GET /api/v1/post-types` | Array di `PostTypeDefinition` |

---

## Pattern consigliato nei plugin

```ts
// In Plugin.register():
ctx.hooks.addAction('form.submitted', async (payload) => {
  const { form, submission } = payload as {
    form: { id: string; name: string; fields: FormField[] }
    submission: { data: string }
  }
  const data = JSON.parse(submission.data) as Record<string, unknown>
  // ... logica custom
})
```
