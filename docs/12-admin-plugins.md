# Modulo 12 — Admin: Gestione Plugin

**Dipendenze:** `08-admin-shell.md`, `06-plugins.md`  
**Produce:** pagina per attivare/disattivare plugin installati

---

## Obiettivo

Fornire all'amministratore una vista chiara dei plugin disponibili e la possibilità di attivarli o disattivarli senza toccare il codice.

---

## `PluginsPage.vue`

Route: `/plugins`  
Richiede capability: `manage_plugins`

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Plugin                                                   │
├──────────────────────────────────────────────────────────┤
│ ┌─ phrasepress-media ────────────────── ● ATTIVO ──────┐ │
│ │ v1.0.0 — Media Library                               │ │
│ │ Aggiunge upload e gestione file media al CMS.        │ │
│ │                                      [Disattiva]     │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ custom-fields-ui ─────────────────── ○ INATTIVO ───┐ │
│ │ v0.2.0 — Custom Field Types extra                   │ │
│ │ Aggiunge tipi di campo: color picker, range slider. │ │
│ │                                       [Attiva]      │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Comportamento

- La lista è caricata da `GET /api/v1/plugins`: ritorna tutti i plugin nel config con il loro stato
- Per ogni plugin: badge colorato (verde = attivo, grigio = inattivo), pulsante contestuale

#### Attivazione
1. Click "Attiva" → `POST /api/v1/plugins/:name/activate`
2. On success: aggiorna stato in lista (ottimista: prima aggiorna UI, poi ricarica)
3. Mostra toast: "Plugin attivato. Ricarica la pagina per vedere le nuove funzionalità."
4. **Non** richiedere riavvio del server — l'attivazione è effective immediatamente (il plugin era già caricato in memoria, `onActivate` viene chiamato ora)

#### Disattivazione
1. Click "Disattiva" → dialog di conferma: "Il plugin verrà disattivato. Alcune funzionalità potrebbero smettere di funzionare. Richiede riavvio del server per rimozione completa."
2. `POST /api/v1/plugins/:name/deactivate`
3. On success: aggiorna stato, mostra banner giallo: "Plugin disattivato. Riavvia il server per la rimozione completa dei suoi hook."

### Card plugin

Informazioni mostrate per ogni plugin:
- Nome (da `plugin.name`)
- Versione (da `plugin.version`)
- Descrizione (da `plugin.description`)
- Stato (badge)
- Pulsante azione

---

## Note implementative

- I plugin sono **registrati nel config dell'utente** (`phrasepress.config.ts`), non installabili dall'admin tramite upload. L'admin gestisce solo attivazione/disattivazione.
- Non è previsto un marketplace o download automatico nell'MVP.
- Se un plugin causa un errore al `register()`, il suo stato resta "inattivo" e viene mostrato un badge rosso "Errore" con il messaggio.

---

## Checklist

- [ ] Implementare `PluginsPage.vue` con lista card
- [ ] Mostrare nome, versione, descrizione, stato per ogni plugin
- [ ] Collegare pulsante "Attiva" con `POST /plugins/:name/activate`
- [ ] Collegare pulsante "Disattiva" con dialog conferma + `POST /plugins/:name/deactivate`
- [ ] Mostrare toast/banner con indicazioni post-attivazione/disattivazione
- [ ] Gestire stato "Errore" per plugin che hanno fallito la registrazione
- [ ] Testare con il plugin di esempio del modulo 06
