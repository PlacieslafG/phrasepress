# Modulo 08 — Admin Shell (Vue 3)

**Dipendenze:** `01-setup.md`, `07-auth.md`  
**Produce:** SPA Vue 3 funzionante con layout, routing, auth e client API tipizzato

---

## Obiettivo

Creare la struttura base dell'admin: Vite + Vue 3 + Vue Router + Pinia, layout con sidebar dinamica (post type e taxonomies dal server), pagina di login, client API tipizzato.

---

## Setup `packages/admin`

### Dipendenze
```
vue, vue-router, pinia
primevue, @primevue/themes, primeicons
@tiptap/vue-3, @tiptap/starter-kit, @tiptap/extension-link, @tiptap/extension-image
tailwindcss, @tailwindcss/vite
typescript, vue-tsc, vite, @vitejs/plugin-vue
```

### `vite.config.ts`
- Plugin: `@vitejs/plugin-vue`, `@tailwindcss/vite`
- Proxy dev: `/api` → `http://localhost:3000/api` (evita CORS in sviluppo)
- Build output: `../../dist/admin` (servito da Fastify in produzione come static files)

---

## Struttura file

```
packages/admin/src/
├── main.ts                 # entry point: Vue app, PrimeVue, Pinia, Router
├── router/
│   └── index.ts            # Vue Router con route guards
├── stores/
│   ├── auth.ts             # Pinia: utente corrente, token, login/logout
│   └── app.ts              # Pinia: post type e taxonomies caricati dal server
├── api/
│   ├── client.ts           # fetch wrapper con auth header automatico + refresh
│   ├── posts.ts            # funzioni typed per /api/v1/posts
│   ├── taxonomies.ts       # funzioni typed per /api/v1/taxonomies
│   ├── auth.ts             # funzioni typed per /api/v1/auth
│   ├── users.ts            # funzioni typed per /api/v1/users
│   └── plugins.ts          # funzioni typed per /api/v1/plugins
├── layouts/
│   └── AdminLayout.vue     # sidebar + header + <RouterView>
└── pages/
    ├── LoginPage.vue
    └── DashboardPage.vue
```

---

## Router (`router/index.ts`)

### Route
| Path | Component | Guard |
|---|---|---|
| `/login` | `LoginPage` | redirect se già loggato |
| `/` | `DashboardPage` | requireAuth |
| `/posts/:type` | `PostListPage` (modulo 09) | requireAuth |
| `/posts/:type/new` | `PostEditorPage` (modulo 09) | requireAuth |
| `/posts/:type/:id/edit` | `PostEditorPage` (modulo 09) | requireAuth |
| `/taxonomy/:slug` | `TermsPage` (modulo 10) | requireAuth |
| `/users` | `UsersPage` (modulo 11) | requireAuth + capability |
| `/roles` | `RolesPage` (modulo 11) | requireAuth + capability |
| `/plugins` | `PluginsPage` (modulo 12) | requireAuth + capability |

### Navigation guard
```ts
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requireAuth && !auth.isLoggedIn) return '/login'
})
```

---

## Auth Store (`stores/auth.ts`)

```ts
interface AuthState {
  user:        User | null
  accessToken: string | null
}

// Actions
login(username, password): Promise<void>   // chiama /auth/login, salva token
logout(): Promise<void>                    // chiama /auth/logout, pulisce stato
refreshToken(): Promise<void>              // chiama /auth/refresh (usato dal client API)
fetchMe(): Promise<void>                   // chiama /auth/me per hydrate al reload
```

Al mount dell'app: chiama `fetchMe()` per verificare se la sessione è ancora valida (l'access token potrebbe essere in memoria, il refresh cookie nel browser).

---

## App Store (`stores/app.ts`)

```ts
interface AppState {
  postTypes:  PostTypeDefinition[]   // caricati da /api/v1/post-types
  taxonomies: TaxonomyDefinition[]   // caricati da /api/v1/taxonomies
}
```

Caricato una volta dopo il login — popola la sidebar dinamicamente.

> **Nota:** aggiungere `GET /api/v1/post-types` al core (modulo 03) per esporre il registro via API.

---

## API Client (`api/client.ts`)

```ts
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T>
```

- Aggiunge automaticamente `Authorization: Bearer <token>` dall'auth store
- Se la risposta è 401: tenta `refreshToken()` e riprova una volta
- Se il refresh fallisce: redirect a `/login`
- Gestisce errori JSON unificati: `{ error: string, details?: unknown }`

---

## Layout (`AdminLayout.vue`)

```
┌─────────────────────────────────────────┐
│  Header: Logo | Username | Logout       │
├───────────┬─────────────────────────────┤
│ Sidebar   │                             │
│           │   <RouterView />            │
│ Posts ▾   │                             │
│  ↳ Posts  │                             │
│  ↳ Pages  │                             │
│  ↳ [CPT]  │                             │
│           │                             │
│ Taxonomy ▾│                             │
│  ↳ Categ. │                             │
│  ↳ Tags   │                             │
│           │                             │
│ Utenti    │                             │
│ Ruoli     │                             │
│ Plugin    │                             │
└───────────┴─────────────────────────────┘
```

La sidebar è generata dinamicamente da `appStore.postTypes` e `appStore.taxonomies`.

---

## `LoginPage.vue`

- Form: username + password
- On submit: chiama `authStore.login()`
- On success: redirect a `/`
- Mostra errore in caso di credenziali errate

---

## `DashboardPage.vue`

- Chiede `GET /api/v1/stats` (da aggiungere al core): conta post per tipo
- Mostra card per ogni post type con conteggio `published` / `draft`

---

## Aggiornamenti al core necessari

- `GET /api/v1/post-types` — lista post type registrati con schema campi
- `GET /api/v1/stats` — conteggi post per tipo e status

---

## Checklist

- [ ] Setup Vite + Vue 3 + PrimeVue + Tailwind in `packages/admin`
- [ ] Configurare proxy Vite per `/api`
- [ ] Configurare Vue Router con tutte le route e guard
- [ ] Implementare `auth` store con Pinia
- [ ] Implementare `app` store con Pinia
- [ ] Scrivere `api/client.ts` con auto-refresh
- [ ] Scrivere funzioni API typed per auth, post types, taxonomies
- [ ] Implementare `AdminLayout.vue` con sidebar dinamica
- [ ] Implementare `LoginPage.vue`
- [ ] Implementare `DashboardPage.vue` con stats
- [ ] Aggiungere `GET /api/v1/post-types` e `GET /api/v1/stats` al core
- [ ] Testare: login → sidebar carica post type → logout
