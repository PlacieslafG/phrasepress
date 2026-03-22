---
applyTo: "packages/core/src/auth/**"
description: "Use when working on authentication, authorization, security: JWT access tokens, refresh tokens, httpOnly cookies, argon2 password hashing, capabilities, requireCapability decorator, user login/logout, roles and permissions."
---

# Istruzioni — Autenticazione e Sicurezza

**Documentazione di riferimento:** `docs/07-auth.md`

## Password

- Hash con **argon2** tramite il package `argon2`. Non bcrypt, non scrypt, non SHA-*.
- `argon2.hash(password)` per creare l'hash. `argon2.verify(hash, password)` per verificare.
- Mai loggare password, nemmeno in errori di debug.
- Lunghezza minima password: 8 caratteri (validato nello schema Fastify, non nel codice).

## JWT — payload e struttura

```ts
// src/auth/jwt.ts — JwtPayload
interface JwtPayload {
  sub:          number    // userId
  username:     string
  roleSlug:     string
  capabilities: string[]
}
```

- **Access token:** durata 15 minuti. Contiene tutto il payload sopra.
- **Refresh token:** durata 7 giorni. Inviato come **httpOnly cookie** (non nel body JSON).
- I refresh token vengono salvati nel DB come **hash argon2** nella tabella `refresh_tokens`. Mai in chiaro.
- Al logout: DELETE del record `refresh_tokens` + clear cookie.
- Segreti JWT da `process.env.JWT_SECRET` e `process.env.JWT_REFRESH_SECRET`. Se mancano → errore al boot.

## Cookie refresh token

```ts
reply.setCookie('refreshToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth/refresh',   // cookie inviato SOLO a questa route
  maxAge: 60 * 60 * 24 * 7,      // 7 giorni in secondi
})
```

## Decorator Fastify

I decorator sono registrati in `src/auth/jwt.ts` tramite `registerAuth(fastify)`:

- `fastify.authenticate` — verifica il Bearer token, popola `request.userId`, `request.userCapabilities`, `request.userRoleSlug`.
- `fastify.requireCapability(cap)` — factory che restituisce un preHandler. Legge capabilities dal JWT payload (zero query DB).

```ts
// src/types.ts — augmentation di FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    userId:           number
    userCapabilities: string[]
    userRoleSlug:     string
  }
}
```

## Capabilities e autorizzazione

- Il decorator `requireCapability(cap)` legge le capabilities dal JWT payload — **nessuna query DB** per ogni request.
- Administrator ha implicitamente tutte le capabilities — verificato per `roleSlug === 'administrator'`, non per lista.
- Le capabilities nel token riflettono il ruolo al momento del login. Se il ruolo cambia, il vecchio token resta valido fino alla scadenza (15 min — accettabile).
- Lista completa capabilities: `read`, `edit_posts`, `edit_others_posts`, `publish_posts`, `delete_posts`, `delete_others_posts`, `manage_terms`, `manage_users`, `manage_roles`, `manage_plugins`, `manage_options`, `upload_files`.
- Helper: `hasCapability(roleSlug, capabilities, required): boolean` — usato dai decorator, non chiamarlo direttamente nelle route.

## Tabella refresh_tokens

```ts
// Struttura
{ id, userId, tokenHash, expiresAt, createdAt }
// tokenHash è l'hash argon2 del token raw inviato nel cookie
// Al refresh: cerca per userId, poi argon2.verify() su ogni record trovato
// Al logout: DELETE WHERE userId = X AND tokenHash matches
```

## Input validation

- Mai fare sanitizzazione/escaping HTML manuale — non servono XSS protections lato API JSON.
- La validazione degli input avviene tramite JSON Schema di Fastify. Aggiungere `minLength`, `maxLength`, `format: 'email'` dove appropriato.
- Per i campi che accettano URL: usare `format: 'uri'` nello schema.

## Sicurezza generale

- `@fastify/helmet` abilitato per headers sicuri (CSP disabilitato perché l'admin è su altro dominio).
- Rate limiting su `/api/v1/auth/login`: max 10 richieste per minuto per IP (configurato separatamente dal rate limit globale di 200/min).
- Non rivelare mai se un username esiste o meno nei messaggi di errore login (risposta generica: "Credenziali non valide").
