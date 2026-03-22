# Modulo 11 — Admin: Utenti e Ruoli

**Dipendenze:** `08-admin-shell.md`, `07-auth.md`  
**Produce:** pagine per gestire utenti e ruoli con capabilities

---

## Obiettivo

Permettere all'amministratore di gestire chi ha accesso all'admin e con quali permessi, tramite un sistema di ruoli configurabili con capabilities granulari.

---

## `UsersPage.vue`

Route: `/users`  
Richiede capability: `manage_users`

### Layout

```
┌──────────────────────────────────────────────┐
│ Utenti                          [+ Nuovo]    │
├──────────────────────────────────────────────┤
│  Username    Email           Ruolo    Azioni  │
│  ──────────────────────────────────────────  │
│  admin       a@example.com  Admin    ✏️ 🗑️   │
│  mario       m@example.com  Editor   ✏️ 🗑️   │
└──────────────────────────────────────────────┘
```

### Comportamento
- Click "+ Nuovo" → apre `Dialog` (PrimeVue) con `UserForm`
- Click "Modifica" → apre lo stesso dialog pre-compilato
- Click "Elimina" → dialog di conferma, poi `DELETE /users/:id`
  - Non mostrare il pulsante elimina per l'utente corrente loggato

### `UserForm.vue` (in Dialog)
Campi:
- Username (required, unico)
- Email (required, unico)
- Password (required per nuovo, facoltativa per modifica — se vuota non cambia)
- Ruolo: `<Select>` con lista ruoli da `GET /roles`

---

## `RolesPage.vue`

Route: `/roles`  
Richiede capability: `manage_roles`

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Ruoli                                    [+ Nuovo Ruolo] │
├──────────────────────────────────────────────────────────┤
│ ┌─ Administrator ────────────────────────────────────┐   │
│ │ ✅ edit_posts  ✅ publish_posts  ✅ manage_users    │   │
│ │ ✅ manage_roles  ✅ manage_plugins  ...              │   │
│ │                                     [Modifica]      │   │
│ └─────────────────────────────────────────────────────┘   │
│ ┌─ Editor ───────────────────────────────────────────┐   │
│ │ ✅ edit_posts  ✅ publish_posts  ✅ manage_terms    │   │
│ │ ❌ manage_users  ❌ manage_plugins  ...              │   │
│ │                               [Modifica] [Elimina]  │   │
│ └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Comportamento
- Ogni ruolo è una card espandibile che mostra le capabilities
- Le capabilities sono raggruppate per area (Post, Taxonomy, Utenti, Sistema)
- Click "Modifica" → apre `Dialog` con `RoleForm`
- Click "Elimina" → solo se nessun utente usa quel ruolo e non è `administrator`

### `RoleForm.vue` (in Dialog)
Campi:
- Nome (required)
- Slug (auto-generato dal nome, non modificabile dopo creazione)
- Capabilities: griglia di checkbox raggruppate per area

```
Contenuto:
  ☑ read
  ☑ edit_posts
  ☐ edit_others_posts
  ☑ publish_posts
  ☐ delete_posts

Utenti & Sistema:
  ☐ manage_users
  ☐ manage_roles
  ☐ manage_plugins
  ☐ manage_options
```

### Grouping capabilities nell'UI

```ts
const CAPABILITY_GROUPS = {
  'Contenuto': ['read', 'edit_posts', 'edit_others_posts', 'publish_posts', 'delete_posts', 'delete_others_posts'],
  'Tassonomie': ['manage_terms'],
  'Media': ['upload_files'],
  'Amministrazione': ['manage_users', 'manage_roles', 'manage_plugins', 'manage_options'],
}
```

---

## Profilo utente corrente

Route: `/profile` (aggiunta nella sidebar sotto il nome utente)  
Permette all'utente loggato di modificare i propri dati: email, password. Non richiede `manage_users`.

---

## Checklist

- [ ] Implementare `UsersPage.vue` con lista e dialog
- [ ] Implementare `UserForm.vue` con validazione lato client (email formato, password min 8 chars)
- [ ] Collegare form utente con `POST /users` e `PUT /users/:id`
- [ ] Collegare eliminazione utente con controllo "non puoi eliminare te stesso"
- [ ] Implementare `RolesPage.vue` con card capabilities
- [ ] Implementare `RoleForm.vue` con checkbox raggruppate
- [ ] Collegare form ruolo con `POST /roles` e `PUT /roles/:id`
- [ ] Collegare eliminazione ruolo con controllo server (ruolo in uso)
- [ ] Implementare pagina `/profile` per modifica dati propri
- [ ] Testare: creare ruolo custom, assegnarlo a utente, verificare accessi
