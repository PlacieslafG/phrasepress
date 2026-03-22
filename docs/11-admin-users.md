# Gestione Utenti e Ruoli

---

## Pagina Utenti (`UsersPage.vue`)

Richiede capability `manage_users`.

### Funzionalità
- Lista utenti con colonne: username, email, ruolo, data registrazione
- **Crea utente**: dialog con username, email, password, ruolo (select dai ruoli disponibili)
- **Modifica utente**: cambia email, password, ruolo. Il proprio ruolo non può essere modificato.
- **Elimina utente**: dialog di conferma. Non si può eliminare se stessi.

---

## Pagina Ruoli (`RolesPage.vue`)

Richiede capability `manage_roles`.

### Funzionalità
- Lista ruoli come card, ognuna mostra nome, slug e capabilities attive come badge colorati
- **Crea ruolo**: dialog con nome, slug (auto-generato, non modificabile dopo la creazione), selezione capabilities
- **Modifica ruolo**: stesso dialog; lo slug non è modificabile
- **Elimina ruolo**: dialog di conferma. Il ruolo `administrator` non può essere eliminato.
- Il ruolo `administrator` non ha il bottone Elimina

### Gestione capabilities nel dialog
- Le capabilities sono raggruppate in: Contenuto, Tassonomie, Media, Amministrazione
- Ogni gruppo ha un toggle "seleziona/deseleziona tutto" con indicatore indeterminate
- Ogni capability ha una descrizione in chiaro di cosa consente
- Quick actions "Seleziona tutte" / "Deseleziona tutte"

---

## Pagina Profilo (`ProfilePage.vue`)

Accessibile a tutti gli utenti autenticati. Permette di modificare email e password.

---

## Capabilities disponibili

Vedi `docs/07-auth.md` per la tabella completa delle capabilities.
