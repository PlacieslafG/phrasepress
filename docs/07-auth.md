# Autenticazione e Autorizzazione

---

## Strategia JWT

PhrasePress usa due token:

- **Access token** — JWT firmato con `JWT_SECRET`, durata **15 minuti**. Inviato nell'header `Authorization: Bearer <token>`. Include nel payload: `sub` (userId), `username`, `roleSlug`, `capabilities[]`.
- **Refresh token** — stringa random 64 byte, durata **7 giorni**. Inviato come **httpOnly cookie** (`refreshToken`). Conservato nel DB come hash SHA-256.

### Flusso di autenticazione

1. `POST /api/v1/auth/login` → restituisce `accessToken` nel body + imposta cookie `refreshToken`
2. L'admin SPA usa `accessToken` nell'header per ogni chiamata API
3. Alla scadenza del token (401): `POST /api/v1/auth/refresh` legge il cookie e emette un nuovo `accessToken`
4. `POST /api/v1/auth/logout` invalida il refresh token nel DB e cancella il cookie

---

## API Auth

### `POST /api/v1/auth/login`

**Rate limit:** 10 req/min (100 in development)

**Body:**
```json
{ "username": "admin", "password": "..." }
```

**Risposta `200`:**
```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": { "slug": "administrator", "capabilities": ["read", "edit_posts", ...] }
  }
}
```

**Cookie impostato:** `refreshToken` (httpOnly, secure in production, sameSite: strict, 7 giorni)

### `POST /api/v1/auth/refresh`

Legge il cookie `refreshToken`, verifica che esista nel DB e non sia scaduto, emette un nuovo access token.

**Risposta `200`:** `{ "accessToken": "eyJ..." }`

### `POST /api/v1/auth/logout`

Richiede autenticazione. Invalida il refresh token corrente nel DB e rimuove il cookie.

**Risposta `200`:** `{ "ok": true }`

### `GET /api/v1/auth/me`

Richiede autenticazione. Restituisce i dati dell'utente corrente con role e capabilities.

---

## Password

Le password sono hashate con **argon2** (non bcrypt). Non vengono mai registrate nei log né restituite dalle API.

---

## Capabilities

Le capabilities sono string identifier che controllano l'accesso alle route. Ogni ruolo ha un array di capabilities.

| Capability | Descrizione |
|---|---|
| `read` | Visualizzare contenuti pubblicati |
| `edit_posts` | Creare e modificare i propri post |
| `edit_others_posts` | Modificare post di altri utenti |
| `publish_posts` | Pubblicare post |
| `delete_posts` | Eliminare i propri post |
| `delete_others_posts` | Eliminare post altrui |
| `manage_terms` | Gestire categories e tags |
| `upload_files` | Caricare file e media |
| `manage_users` | Creare/modificare/eliminare utenti |
| `manage_roles` | Creare/modificare ruoli |
| `manage_plugins` | Attivare/disattivare plugin |
| `manage_options` | Accedere alle impostazioni di sistema |

**Regola speciale:** il ruolo `administrator` ha implicitamente tutte le capabilities, indipendentemente dall'array salvato nel DB.

### Decorator Fastify

```ts
// Verifica il token JWT e popola request.userId, request.userCapabilities, request.userRoleSlug
fastify.authenticate

// Verifica una capability specifica (usare dopo authenticate)
fastify.requireCapability('manage_users')
```

Esempio di route protetta:
```ts
app.get('/my-route', {
  preHandler: [ctx.fastify.authenticate, ctx.fastify.requireCapability('manage_options')],
}, async (req) => { ... })
```

---

## Ruoli di default

| Slug | Capabilities |
|---|---|
| `administrator` | Tutte |
| `editor` | `read`, `edit_posts`, `edit_others_posts`, `publish_posts`, `delete_posts`, `manage_terms` |
| `author` | `read`, `edit_posts`, `publish_posts`, `delete_posts` |

---

## API Utenti

Base path: `/api/v1/users`. Richiedono `manage_users` tranne GET /:id (visibile a se stessi).

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/users` | Lista tutti gli utenti con ruolo |
| GET | `/users/:id` | Dettaglio utente (solo sé stesso o manage_users) |
| POST | `/users` | Crea utente (`username`, `email`, `password`, `roleSlug?`) |
| PUT | `/users/:id` | Aggiorna utente (`email?`, `password?`, `roleSlug?`) |
| DELETE | `/users/:id` | Elimina utente (non se stesso) |

## API Ruoli

Base path: `/api/v1/roles`. Richiedono `manage_roles`.

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/roles` | Lista tutti i ruoli |
| GET | `/roles/:id` | Dettaglio ruolo |
| POST | `/roles` | Crea ruolo (`name`, `slug`, `capabilities[]`) |
| PUT | `/roles/:id` | Aggiorna ruolo (`name?`, `capabilities[]?`) |
| DELETE | `/roles/:id` | Elimina ruolo (non `administrator`) |
