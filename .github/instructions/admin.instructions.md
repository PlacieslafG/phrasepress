---
applyTo: "packages/admin/src/**"
description: "Use when working on the Admin UI: Vue 3 components, pages, layouts, Pinia stores, Vue Router, API client, PrimeVue, TailwindCSS, Tiptap editor, post editor, taxonomy management, users/roles UI, plugins page, media manager."
---

# Istruzioni — Admin UI (Vue 3 + PrimeVue)

**Documentazione di riferimento:** `docs/08-admin-shell.md`, `docs/09-admin-folios.md`, `docs/10-admin-vocabularies.md`, `docs/11-admin-users.md`, `docs/12-admin-plugins.md`

## Setup e convenzioni Vue 3

- Usare sempre **Composition API** con `<script setup lang="ts">`. Mai Options API.
- Un componente per file. Nome file `PascalCase.vue`.
- Props tipizzate con `defineProps<{ ... }>()` — non usare il runtime declaration con `{ type: String }`.
- Emits tipizzati con `defineEmits<{ ... }>()`.
- Computed properties per derivare dati, non metodi che calcolano ogni volta.

## State management (Pinia)

- Lo store `auth` gestisce: `user`, `accessToken`, `isLoggedIn`, `login()`, `logout()`, `refreshToken()`, `fetchMe()`, `clearSession()`, `hasCapability()`, `sessionRestored`.
- Lo store `app` gestisce: `codices`, `vocabularies` — caricati una volta dopo il login. Sono disponibili anche gli alias backward-compat `postTypes` (computed da `codices`) e `taxonomies` (computed da `vocabularies`).
- Non duplicare stato tra store e componenti locali — se un dato serve in più posti, sta nel Pinia store.
- `storeToRefs()` per destructurare store con reattività preservata.

## Auth store — dettagli importanti

```ts
// hasCapability() — controlla capability dell'utente corrente
const authStore = useAuthStore()
authStore.hasCapability('manage_users')  // true se è administrator o ha la cap

// clearSession() vs logout()
// - logout() chiama l'API + pulisce lo stato locale
// - clearSession() pulisce SOLO lo stato locale (senza chiamata API)
//   Usare clearSession() solo in apiFetch quando il refresh fallisce,
//   per evitare il loop: refresh-fail → logout → 401 → refresh-fail → ...

// sessionRestored — ref che sopravvive all'HMR di Vite
// Impostato a true dopo fetchMe() in App.vue, resettato solo su page reload
```

## Client API (`api/client.ts`)

- Tutte le chiamate API passano per `apiFetch<T>(path, options?)` — non usare `fetch` direttamente nei componenti.
- Il client gestisce automaticamente: aggiunta header `Authorization`, retry su 401 con refresh, redirect a `/login` se refresh fallisce.
- Le funzioni API sono tipizzate: `getPosts(params: GetPostsParams): Promise<PaginatedResponse<Post>>` ecc.
- `ApiError` — classe per errori HTTP. Usare `instanceof ApiError` per distinguerli da errori di rete:
  ```ts
  try {
    await doSomething()
  } catch (err) {
    if (err instanceof ApiError) {
      toast.add({ severity: 'error', summary: err.message })
    }
  }
  ```
- **Inizializzazione**: `initApiFetch({ getToken, doRefresh, clearSession })` chiamato in `main.ts` per rompere il ciclo di import tra `client.ts` e `stores/auth.ts`.

## PrimeVue — componenti da usare

| Necessità | Componente PrimeVue |
|---|---|
| Tabelle dati | `DataTable` + `Column` |
| Form input testo | `InputText` |
| Form input numero | `InputNumber` |
| Select singolo | `Select` |
| Multi-select | `MultiSelect` |
| Checkbox | `Checkbox` |
| Toggle | `ToggleSwitch` |
| Date picker | `DatePicker` |
| Dialog modale | `Dialog` |
| Conferma azione | `ConfirmDialog` + `useConfirm()` |
| Toast notifiche | `Toast` + `useToast()` |
| Albero gerarchico | `Tree` |
| Badge stato | `Tag` |
| Pulsanti | `Button` |

- Non reinventare componenti UI se PrimeVue ne ha già uno adatto.
- Per i toast: sempre usare `useToast()` — non alert/confirm browser.
- Per le conferme distruttive (elimina, ripristina): sempre `useConfirm()` con dialog.

## TailwindCSS

- Usare Tailwind per layout, spacing, colori custom.
- PrimeVue gestisce i propri componenti via theme — non sovrascrivere gli stili interni dei componenti PrimeVue con Tailwind a meno che non sia necessario.
- Stili globali custom in `src/assets/main.css`.

## Editor rich text (Tiptap)

- Il componente `RichTextEditor.vue` wrappa Tiptap con `useEditor()`.
- Extensions usate: `StarterKit`, `Link`, `Placeholder`.
- Il valore è sempre HTML serializzato (`editor.getHTML()`).
- Il componente funziona come `v-model`: riceve `modelValue: string` e emette `update:modelValue`.
- Non aggiungere extensions Tiptap non necessarie — ogni extension ha un peso.

## Entità principali — terminologia

| Vecchio (deprecato) | Nuovo | Significato |
|---|---|---|
| `postTypes` | `codices` | Tipi di contenuto registrati |
| `taxonomies` | `vocabularies` | Tassonomie registrate |
| `Post` | `Folio` | Singolo contenuto |
| `status` (draft/published) | `stage` | Fase del workflow |
| `postType` (param route) | `codex` (param route) | Nome del tipo di contenuto |
| `/posts/:type` | `/folios/:codex` | Route lista contenuti |
| `/taxonomy/:slug` | `/vocabulary/:slug` | Route gestione terms |

## API client (`api/folios.ts`)

- **Usare `foliosApi`** da `@/api/folios.js` per tutte le operazioni CRUD sui contenuti.
- **Non usare** il vecchio `postsApi` da `api/posts.js` — file eliminato. Usare `foliosApi` da `api/folios.js`.
- `foliosApi.list(codex, params)` — lista folii con filtri (stage, search, ecc.)
- `foliosApi.get(codex, id)` — singolo folio
- `foliosApi.create(codex, data)` — crea folio
- `foliosApi.update(codex, id, data)` — aggiorna folio
- `foliosApi.delete(codex, id)` — elimina/cestina
- Il **`Folio`** ha: `id`, `codex`, `stage`, `fields: Record<string,unknown>`, `terms: TermSummary[]`
- I campi strutturati (`title`, `slug`, `content`) vivono dentro `folio.fields.title` ecc.
- Il termine di una vocabulary è in `term.vocabularySlug` (non `taxonomySlug`)

## Store `app.ts` — interfacce chiave

```ts
export interface CodexDefinition { name, label, icon?, stages?, blueprint?, displayField? }
export interface StageDefinition  { name, label, initial?, final?, color? }
export interface VocabularyDefinition { slug, name, codices, hierarchical, icon? }
export interface FieldDefinition  { name, label, type: FieldType, required?, options?, fieldOptions?, queryable? }

// Uso nello store
const appStore = useAppStore()
appStore.codices      // CodexDefinition[]
appStore.vocabularies // VocabularyDefinition[]
appStore.postTypes    // alias → appStore.codices (backward-compat)
appStore.taxonomies   // alias → appStore.vocabularies (backward-compat)
```

## Router — route names aggiornate

| Route name | Path | Descrizione |
|---|---|---|
| `folio-list` | `/folios/:codex` | Lista folii per codex |
| `folio-new` | `/folios/:codex/new` | Nuovo folio |
| `folio-edit` | `/folios/:codex/:id/edit` | Modifica folio |
| `terms` | `/vocabulary/:slug` | Gestione terms |

## Router e navigazione

- Le route sono definite in `router/index.ts` con `meta: { requireAuth: true }` per le pagine protette.
- Il guard controlla `authStore.isLoggedIn` — se false, redirect a `/login`.
- Per route con capability richiesta: `meta: { requireCapability: 'manage_users' }`. Il guard chiama `authStore.hasCapability(cap)`.
- Tutte le pagine sotto `AdminLayout` hanno implicitamente `requireAuth: true` (ereditato dalla route padre).
- Usare `<RouterLink>` per i link interni — mai `window.location.href`.
- Lazy loading route: `component: () => import('@/pages/MyPage.vue')` — non importare staticamente le pagine.

## Gestione errori nei componenti

- Ogni chiamata API in un `try/catch`. On catch: mostrare toast errore.
- Errori di validazione dalla API (422): mappare `field` dell'errore al campo del form per mostrare il messaggio inline.
- Non mostrare mai errori tecnici/stack trace all'utente — messaggi human-readable.

## Performance

- `v-if` vs `v-show`: usare `v-if` quando il componente non serve quasi mai, `v-show` quando viene nascosto/mostrato frequentemente.
- Liste con `v-for`: sempre specificare `:key` con un ID stabile (non l'indice dell'array).
- Lazy loading delle pagine via route-level `component: () => import(...)`.
