# Plugin Built-in

PhrasePress include quattro plugin nel repository, tutti attivabili dalla pagina Plugin dell'admin.

---

## phrasepress-media

Gestisce l'upload e la libreria media (immagini, PDF, ecc.).

### Funzionalità
- Upload multiplo di file tramite multipart form
- Libreria media a griglia nella pagina `/media`
- `MediaPickerDialog.vue` per selezionare immagini nei post
- File serviti staticamente da `/uploads/`

### API
```
POST   /api/v1/plugins/phrasepress-media/upload    # upload file (multipart)
GET    /api/v1/plugins/phrasepress-media/media      # lista file
DELETE /api/v1/plugins/phrasepress-media/media/:id  # elimina file
```

### Tabella DB: `pp_media`
| Colonna | Tipo | Note |
|---|---|---|
| `id` | TEXT PK | UUID |
| `filename` | TEXT | nome file originale |
| `path` | TEXT | percorso relativo in uploads/ |
| `mime_type` | TEXT | es. `image/jpeg` |
| `size` | INTEGER | byte |
| `alt` | TEXT | testo alternativo |
| `created_at` | INTEGER | Unix timestamp |

---

## phrasepress-fields

Permette di definire **gruppi di campi custom** dall'interfaccia admin, senza toccare il codice.

### Funzionalità
- Crea field group con nome e condizioni di applicazione (post type)
- Drag & drop per riordinare i campi
- Tipi supportati: text, textarea, number, select, checkbox, date, image, relationship, repeater
- I gruppi attivi appaiono automaticamente nell'editor dei post corrispondenti

### API
```
GET    /api/v1/plugins/phrasepress-fields/field-groups
POST   /api/v1/plugins/phrasepress-fields/field-groups
GET    /api/v1/plugins/phrasepress-fields/field-groups/:id
PUT    /api/v1/plugins/phrasepress-fields/field-groups/:id
DELETE /api/v1/plugins/phrasepress-fields/field-groups/:id
```

---

## phrasepress-forms

Builder per form pubblici con raccolta submission.

### Funzionalità admin
- Crea/modifica form con campi personalizzati
- Tipi campi: text, email, textarea, number, select, checkbox, date
- Visualizza le submission ricevute con colonne dinamiche per campo
- Elimina singole submission

### API admin (richiede `manage_plugins`)
```
GET    /api/v1/plugins/phrasepress-forms/forms
POST   /api/v1/plugins/phrasepress-forms/forms
PUT    /api/v1/plugins/phrasepress-forms/forms/:id
DELETE /api/v1/plugins/phrasepress-forms/forms/:id
GET    /api/v1/plugins/phrasepress-forms/forms/:id/submissions
DELETE /api/v1/plugins/phrasepress-forms/submissions/:id
```

### API pubblica (no autenticazione)
```
GET  /api/v1/plugins/phrasepress-forms/public/forms/:slug    # schema form
POST /api/v1/plugins/phrasepress-forms/public/submit/:slug   # invia submission
```

### Esempio: incorporare un form in HTML
```html
<form id="contact-form">
  <input name="nome" required placeholder="Nome">
  <input type="email" name="email" required placeholder="Email">
  <textarea name="messaggio" placeholder="Messaggio"></textarea>
  <button type="submit">Invia</button>
</form>
<script>
document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const data = Object.fromEntries(new FormData(e.target))
  await fetch('/api/v1/plugins/phrasepress-forms/public/submit/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
})
</script>
```

### Hook emesso
```ts
// Payload available in ctx.hooks.addAction('form.submitted', handler)
{
  form: { id: string; name: string; fields: FormField[] },
  submission: { id: string; data: string /* JSON */ }
}
```

---

## phrasepress-mailer

Invia email di notifica quando viene ricevuta una submission di un form.

### Funzionalità
- Configurazione SMTP (host, porta, TLS, credenziali)
- Regole di notifica per-form: email destinatario, template oggetto
- Invio email di test dalla pagina impostazioni
- Corpo email HTML generato automaticamente con tutti i campi della submission

### API admin (richiede `manage_options`)
```
GET  /api/v1/plugins/phrasepress-mailer/settings         # config SMTP (senza password)
PUT  /api/v1/plugins/phrasepress-mailer/settings         # aggiorna config
POST /api/v1/plugins/phrasepress-mailer/test             # invia email di test
GET  /api/v1/plugins/phrasepress-mailer/notifications    # regole di notifica
POST /api/v1/plugins/phrasepress-mailer/notifications    # crea regola
PUT  /api/v1/plugins/phrasepress-mailer/notifications/:id
DELETE /api/v1/plugins/phrasepress-mailer/notifications/:id
```

**Nota sicurezza:** la password SMTP non viene mai restituita dall'API. `GET /settings` restituisce `hasPassword: boolean`. Per aggiornare la password inviare il campo `authPass` nel `PUT /settings`; omettendo il campo o inviando stringa vuota, la password esistente viene preservata.

### Template oggetto
Usare `{form_name}` come placeholder:
```
Nuova submission: {form_name}
```

### Tabelle DB
- `pp_mailer_config` — configurazione SMTP (riga singola con id='default')
- `pp_mailer_notifications` — regole per-form
