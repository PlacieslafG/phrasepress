# Admin UI — Panoramica

Il pannello di amministrazione è una SPA Vue 3 in `packages/admin/`.

---

## Tecnologie

- **Vue 3** con Composition API e `<script setup>`
- **Vue Router** con lazy loading delle pagine
- **Pinia** per lo state management
- **PrimeVue** per i componenti UI
- **TailwindCSS** per il layout
- **Tiptap** per l'editor rich text

---

## Avvio

```bash
pnpm --filter @phrasepress/admin dev   # dev: http://localhost:5173
pnpm --filter @phrasepress/admin build # produzione: dist/
```

Il dev server si aspetta che il core giri su `http://localhost:3000`. Le chiamate API passano tutte per `apiFetch()` in `src/api/client.ts`.

---

## Struttura src/

```
src/
├── main.ts              # inizializzazione Vue app + PrimeVue + Pinia
├── App.vue              # root component, gestisce il session restore
├── api/
│   ├── client.ts        # apiFetch con auto-refresh JWT
│   ├── auth.ts          # login, logout, me
│   ├── posts.ts         # CRUD post
│   ├── taxonomies.ts    # CRUD terms
│   ├── users.ts         # CRUD users + roles
│   ├── media.ts         # upload, list, delete media
│   ├── fields.ts        # field groups (plugin fields)
│   ├── forms.ts         # form builder (plugin forms)
│   ├── mailer.ts        # SMTP config + notifiche (plugin mailer)
│   └── plugins.ts       # lista + attivazione plugin
├── stores/
│   ├── auth.ts          # utente corrente, token, capabilities
│   ├── app.ts           # post types, taxonomies, plugin attivi
│   └── theme.ts         # dark/light mode
├── layouts/
│   └── AdminLayout.vue  # shell con header, sidebar e <RouterView>
├── pages/               # una pagina per route (lazy loaded)
└── components/          # componenti riutilizzabili
```

---

## Navigazione e route

Il router è in `src/router/index.ts`. Tutte le pagine sotto `AdminLayout` richiedono autenticazione. La sidebar mostra solo le voci pertinenti alle capability dell'utente e ai plugin attivi.

| Path | Componente | Capability richiesta |
|---|---|---|
| `/` | DashboardPage | — |
| `/posts/:type` | PostListPage | — |
| `/posts/:type/new` | PostEditorPage | — |
| `/posts/:type/:id/edit` | PostEditorPage | — |
| `/taxonomy/:slug` | TermsPage | — |
| `/media` | MediaPage | `upload_files` |
| `/users` | UsersPage | `manage_users` |
| `/roles` | RolesPage | `manage_roles` |
| `/plugins` | PluginsPage | `manage_plugins` |
| `/field-groups` | FieldGroupsPage | `manage_plugins` |
| `/field-groups/:id` | FieldGroupEditorPage | `manage_plugins` |
| `/forms` | FormsPage | `manage_plugins` |
| `/forms/:id/edit` | FormEditorPage | `manage_plugins` |
| `/forms/:id/submissions` | FormSubmissionsPage | `manage_plugins` |
| `/mailer-settings` | MailerSettingsPage | `manage_options` |
| `/settings` | SettingsPage | — |
| `/profile` | ProfilePage | — |

---

## Stores Pinia

### `auth` store

```ts
const authStore = useAuthStore()

authStore.user            // utente corrente o null
authStore.accessToken     // JWT corrente
authStore.isLoggedIn      // boolean
authStore.sessionRestored // true dopo fetchMe() al boot
authStore.hasCapability('manage_users')  // controlla una capability
authStore.login({ username, password })
authStore.logout()
authStore.fetchMe()
```

### `app` store

```ts
const appStore = useAppStore()

appStore.postTypes           // PostTypeDefinition[]
appStore.taxonomies          // TaxonomyDefinition[]
appStore.isPluginActive('phrasepress-media')  // boolean
appStore.load()              // carica post types e taxonomie dall'API
```

---

## API Client

Tutte le chiamate passano per `apiFetch<T>(path, options?)`:

```ts
import { apiFetch } from '@/api/client.js'

const data = await apiFetch<MyType>('/api/v1/something', {
  method: 'POST',
  body:   JSON.stringify(payload),
})
```

- Aggiunge automaticamente l'header `Authorization: Bearer <token>`
- In caso di `401`: tenta refresh → se fallisce, redirect a `/login`
- Lancia `ApiError` in caso di risposta HTTP non-ok

---

## Configurazione PhrasePress

Il file `config/phrasepress.config.ts` è l'entry point per personalizzare il sito:

```ts
import { defineConfig } from '../packages/core/src/config.js'

export default defineConfig({
  postTypes: [
    {
      name:  'product',
      label: 'Products',
      icon:  'pi-box',
      fields: [
        { name: 'price', type: 'number', label: 'Price', queryable: true },
        { name: 'sku',   type: 'string', label: 'SKU',   queryable: true },
      ],
    },
  ],
  taxonomies: [
    {
      slug:         'genre',
      name:         'Genres',
      postTypes:    ['product'],
      hierarchical: false,
    },
  ],
  plugins: [
    (await import('../packages/plugins/media/src/index.js')).default,
    (await import('../packages/plugins/fields/src/index.js')).default,
    (await import('../packages/plugins/forms/src/index.js')).default,
    (await import('../packages/plugins/mailer/src/index.js')).default,
  ],
})
```
