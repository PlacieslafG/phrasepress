# Modulo 07 — Autenticazione, Utenti e Ruoli

**Dipendenze:** `02-database.md`, `05-hooks.md`  
**Produce:** JWT auth, CRUD utenti, CRUD ruoli, controllo accessi via capabilities

---

## Obiettivo

Gestire l'autenticazione degli utenti admin tramite JWT (access + refresh token) e implementare il sistema di ruoli con capabilities granulari per proteggere le API.

---

## Strategia JWT

- **Access token:** durata breve (15 minuti), inviato nell'header `Authorization: Bearer <token>`
- **Refresh token:** durata lunga (7 giorni), inviato come **httpOnly cookie** (non accessibile da JS, protetto da XSS)
- Al login: emette entrambi i token
- L'admin SPA usa l'access token per le chiamate API
- Alla scadenza dell'access token: chiama `POST /auth/refresh` → il server legge il cookie e emette un nuovo access token
- Al logout: invalida il refresh token (blacklist in memoria o tabella DB)

### Refresh token storage
Per semplicità MVP: una tabella `refresh_tokens` nel DB:
```ts
refresh_tokens { id, userId, token (hashed), expiresAt, createdAt }
```
Al refresh: verifica che il token esista nel DB e non sia scaduto. Al logout: elimina il record.

---

## Password Hashing

Libreria: **argon2** (più sicuro di bcrypt, raccomandato OWASP)
- `argon2.hash(password)` al momento della creazione/cambio password
- `argon2.verify(hash, password)` al login
- Mai memorizzare password in chiaro, mai loggarle

---

## Capabilities e controllo accessi

### Capabilities di default (definite in `02-database.md`)

Il sistema verifica le capabilities a livello di route Fastify tramite un decorator:

```ts
// Decorator Fastify
fastify.decorate('requireCapability', (capability: string) => {
  return async (request, reply) => {
    const user = request.user  // impostato da JWT plugin
    if (!hasCapability(user, capability)) {
      reply.status(403).send({ error: 'Forbidden' })
    }
  }
})
```

### `hasCapability(user, capability)`
1. Fetch ruolo dell'utente dal DB (o da cache JWT payload)
2. Parse `capabilities` JSON del ruolo
3. Verifica se la capability richiesta è inclusa

### JWT payload
Il payload dell'access token include:
```ts
{
  sub:          userId,
  username:     string,
  roleSlug:     string,
  capabilities: string[]   // serializzate nel token per evitare DB lookup ad ogni request
}
```
Quando un ruolo viene modificato, i token esistenti diventano obsoleti → l'utente deve fare re-login (accettabile per MVP).

---

## API Routes — Auth

Prefisso: `/api/v1/auth`

### `POST /api/v1/auth/login`
Body: `{ username: string, password: string }`

Logica:
1. Fetch utente per username
2. Verify password con argon2
3. Generare access token (15m) + refresh token (7d)
4. Salvare refresh token hashato in `refresh_tokens`
5. Impostare refresh token come httpOnly cookie
6. Risposta: `{ accessToken, user: { id, username, email, role } }`

### `POST /api/v1/auth/refresh`
Legge il cookie httpOnly `refreshToken`.

Logica:
1. Verifica cookie presente
2. Cerca il token hashato in `refresh_tokens`
3. Verifica scadenza
4. Genera nuovo access token
5. Risposta: `{ accessToken }`

### `POST /api/v1/auth/logout`
Richiede auth.
1. Elimina il record da `refresh_tokens`
2. Cancella il cookie
3. Risposta: `{ success: true }`

### `GET /api/v1/auth/me`
Richiede auth.
Risposta: dati utente corrente (senza passwordHash).

---

## API Routes — Utenti

Prefisso: `/api/v1/users`  
Tutte richiedono auth + capability `manage_users` (eccetto cambio propria password).

### `GET /api/v1/users`
Lista utenti con ruolo. Risposta senza `passwordHash`.

### `GET /api/v1/users/:id`
Singolo utente.

### `POST /api/v1/users`
Body: `{ username, email, password, roleId }`
- Validare unicità username e email
- Hash password con argon2
- Risposta: utente creato (senza hash)

### `PUT /api/v1/users/:id`
Body: `{ username?, email?, password?, roleId? }`
- Se `password` presente: re-hash
- Un utente può modificare solo se stesso (senza `manage_users`) o chiunque (con `manage_users`)

### `DELETE /api/v1/users/:id`
Richiede `manage_users`. Non permettere auto-eliminazione.

---

## API Routes — Ruoli

Prefisso: `/api/v1/roles`  
Richiedono auth + capability `manage_roles`.

### `GET /api/v1/roles`
Lista ruoli con capabilities (array parsato).

### `POST /api/v1/roles`
Body: `{ name, slug, capabilities: string[] }`
- Validare che le capabilities siano tutte nel set riconosciuto

### `PUT /api/v1/roles/:id`
Stessa validazione. Non permettere di modificare `administrator` per evitare lock-out.

### `DELETE /api/v1/roles/:id`
Non permettere di eliminare `administrator`. Rifiutare se ci sono utenti con quel ruolo.

---

## Struttura file

```
src/auth/
├── jwt.ts          # setup @fastify/jwt, decorator requireCapability
├── password.ts     # hash/verify con argon2
├── capabilities.ts # lista capabilities, hasCapability()
└── index.ts

src/api/
├── auth.ts         # route /auth/*
├── users.ts        # route /users/*
└── roles.ts        # route /roles/*
```

---

## Checklist

- [ ] Installare e configurare `@fastify/jwt` e `@fastify/cookie`
- [ ] Creare tabella `refresh_tokens` nello schema Drizzle (→ ri-generare migration)
- [ ] Implementare `password.ts` con argon2 hash/verify
- [ ] Implementare `jwt.ts` con setup Fastify e decorator `requireCapability`
- [ ] Implementare `hasCapability()` con lettura da JWT payload
- [ ] Implementare `POST /auth/login` completo
- [ ] Implementare `POST /auth/refresh` con cookie httpOnly
- [ ] Implementare `POST /auth/logout`
- [ ] Implementare `GET /auth/me`
- [ ] Implementare CRUD `/users`
- [ ] Implementare CRUD `/roles` con protezioni (no delete admin, no delete ruolo in uso)
- [ ] Applicare `requireCapability` a tutte le route protette dei moduli precedenti
- [ ] Testare flow completo: login → chiamata protetta → refresh → logout
