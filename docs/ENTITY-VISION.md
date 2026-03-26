# PhrasePress — Verso un CMS Data-Centric: La Visione a Codex e Folio

> Documento di analisi architetturale — precede l'implementazione.  
> Stato: **Proposta in discussione**

---

## Il Problema: Siamo Nati Come Blog

WordPress è stato progettato nel 2003 per fare una cosa sola: **pubblicare post**. Tutto il sistema — dai nomi variabili al database — riflette questa singola intenzione originaria.

Negli anni WordPress ha cercato di generalizzarsi con i **Custom Post Types** (CPT, introdotti in WP 3.0, 2010). Ma i CPT sono una toppa elegante su un sistema blog: ogni "tipo" personalizzato eredita comunque la struttura del post, con campi obbligatori che spesso non hanno senso nel dominio dell'utente.

PhrasePress ha replicato questo modello fedelmente:
```
posts { id, postType, title, slug, content, status, fields, ... }
```

Funziona. Ma ci ancora a una metafora sbagliata.

---

## 1. L'Analisi: Cosa non Funziona del Modello "Posts"

### 1.1 Campi Predefiniti Semanticamente Vuoti

Ogni record in PhrasePress (come in WordPress) nasce con questi campi fissi:

| Campo | Senso per un blog | Senso per un Prodotto | Senso per un Evento | Senso per un Contatto |
|---|---|---|---|---|
| `title` | ✅ "Titolo dell'articolo" | ⚠️ "Nome prodotto" (forse) | ⚠️ "Nome evento" (forse) | ❌ Non esiste un "titolo" |
| `content` | ✅ "Corpo dell'articolo" | ❌ Inusato o abusato | ❌ Inusato o abusato | ❌ Inusato |
| `slug` | ✅ URL-friendly del titolo | ⚠️ Solo se ha URL pubblico | ⚠️ Solo se ha URL pubblico | ❌ Ha senso uno slug per un contatto? |
| `status` | ✅ draft/published/trash | ⚠️ available/discontinued? | ⚠️ upcoming/past/cancelled? | ❌ active/archived? |

Risultato: **il developer forza la realtà dentro un container che non le appartiene**. Il campo `content` di un prodotto è vuoto. Il campo `status` di un ordine ha valori che non coincidono con draft/published. Lo `slug` di un record interno non porta da nessuna parte.

### 1.2 Lo Status è un'Idea Editoriale, Non un Concetto Universale

`draft | published | trash` riflette il workflow di un giornalista. Non ha nulla a che fare con:
- uno stato ordine (`pending | processing | shipped | delivered | refunded`)
- uno stato ticket (`open | in_progress | resolved | closed`)
- uno stato progetto (`planning | active | on_hold | completed | archived`)

Il developer attuale deve **simulare** questi stati con custom fields `select`, mentre il sistema continua a gestire un campo `status` separato che non usa.

### 1.3 Le Tassonomie Come Sidekick Obbligatorio

In WordPress (e attualmente in PhrasePress), le tassonomie esistono come sistema parallelo:

```
posts → post_terms → terms → taxonomies
```

Questo è corretto per catalogare "categorie" e "tag" su articoli. Ma per un prodotto che appartiene a un brand (`Brand`), per un film che ha un regista (`Director`), per un libro che ha un autore (`Author`) — la relazione non è una "tassonomia", è una **relazione tra entità**.

Usare una taxonomy per "Marchi dei prodotti" è semanticamente sbagliato: un Brand ha i suoi campi (logo, sito, anno fondazione...), non è un semplice termine con nome e slug.

### 1.4 Le Relazioni Sono di Seconda Classe

Il tipo di campo `relationship` esiste nel sistema custom fields, ma è un campo opzionale che punta a un altro "post type". Non è nativo nel modello dato: una relazione è salvata nel blob JSON `fields` come un ID, non come un foreign key con integrità referenziale nel database.

### 1.5 Le Revisioni Sono Blog-Centriche

Il sistema di revisioni salva snapshot di `title + content + fields`. Per un record come un ordine o un contatto, ha senso storicizzare ogni modifica, ma l'implementazione è legata all'idea che si stia "editando un articolo".

---

## 2. La Visione: PhrasePress Come Strato Semantico Sopra i Dati

PhrasePress deve smettere di essere un "CMS per blog estendibile" e diventare un **runtime per dati strutturati**, dove il tipo di dati — e la loro semantica — è interamente definito dall'utente.

### Il Reframe Fondamentale

> WordPress gestisce **contenuti** da pubblicare.  
> PhrasePress (nuova visione) gestisce **dati strutturati** di qualsiasi natura.

La conseguenza di questo reframe:
- Non esistono campi predefiniti imposti dal sistema (eccetto identità e timestamp)
- Non esiste un concetto di "status pubblicazione" predefinito
- Non esiste distinzione tra "post" e "tassonomia" — esistono solo collezioni di dati con relazioni
- Il sistema non sa nulla del dominio: sa solo che esistono **strutture dati** con **campi** e **relazioni**

### Cosa Rimane Invariato

Questo non è un rewrite da zero. Molte cose rimangono:
- Il database SQLite con Drizzle ORM
- Fastify come HTTP framework
- Il sistema di plugin con HookManager
- Il sistema di autenticazione JWT
- L'architettura monorepo

Cambiano i **concetti**, le **astrazioni** e i **nomi** — non lo stack.

---

## 3. La Nuova Nomenclatura: Codex e Folio

Proponiamo una terminologia originale che riflette l'identità di PhrasePress come strumento editoriale moderno, riprendendo la metafora tipografica del nome.

### Il Vocabolario

| Termine Nuovo | Termine Vecchio | Definizione |
|---|---|---|
| **Codex** (pl. Codices) | Post Type | La definizione di una struttura dati: i suoi campi, comportamenti e relazioni |
| **Folio** (pl. Folios) | Post | Un'istanza concreta di un Codex — un singolo record di dati |
| **Blueprint** | — | Lo schema dei campi di un Codex (era implicito nel post type) |
| **Stage** | Status | Lo stato del ciclo di vita di un Folio, definito dal Codex |
| **Vocabulary** | Taxonomy | Un Codex speciale con struttura gerarchica, usato per catalogare |
| **Term** | Term | Un Folio appartenente a un Vocabulary (invariato nel nome) |
| **Link** | Relationship field | Una relazione tipizzata tra due Codices, con integrità referenziale |

### La Metafora

Un **Codex** è un libro antico — definisce la struttura, il "codice" di una classe di informazioni. Riprende anche "codice" nel senso informatico: è lo schema TypeScript che definisce i dati. Il Codex è il *tipo*.

Un **Folio** è una pagina di un Codex — l'instanza concreta, il dato reale. È anche un foglio tipografico, richiamando il "Press" di PhrasePress. Il Folio è il *valore*.

### Confronto con Altri CMS

| CMS | "Post Type" | "Post" |
|---|---|---|
| WordPress | Post Type | Post |
| Directus | Collection | Item |
| Strapi 5 | Content Type | Document |
| Payload CMS | Collection | Document |
| Contentful | Content Type | Entry |
| Sanity | Schema Type | Document |
| **PhrasePress** | **Codex** | **Folio** |

PhrasePress è l'unico ad usare questa coppia — e la metafora regge semanticamente.

### In Codice

```ts
// Configurazione utente (phrasepress.config.ts)
defineConfig({
  codices: [
    {
      name: 'product',      // identificatore
      label: 'Products',
      stages: [             // ciclo di vita definito dal Codex, non dal sistema
        { name: 'draft',        label: 'Bozza',     color: 'gray'  },
        { name: 'available',    label: 'Disponibile', color: 'green' },
        { name: 'discontinued', label: 'Fuori prod.', color: 'red'   },
      ],
      blueprint: [          // lo schema dei campi
        { name: 'price',       type: 'number',   queryable: true  },
        { name: 'sku',         type: 'string',   queryable: true  },
        { name: 'description', type: 'richtext', queryable: false },
        { name: 'brand',       type: 'link',     target: 'brand'  }, // relazione a Codex "brand"
      ]
    }
  ],
  vocabularies: [           // ex-taxonomies: rimangono come concetto separato
    {
      name: 'genre',
      label: 'Generi',
      hierarchical: true,
      for: ['book'],
    }
  ],
  plugins: [...]
})
```

---

## 4. Il Nuovo Modello Dati

### 4.1 La Tabella `folios` (ex `posts`)

La tabella principale perde i campi blog-centrici e diventa neutrale:

```
// PRIMA (posts)
{ id, postType, title, slug, content, status, fields, createdAt, updatedAt, authorId }

// DOPO (folios)
{ id, codex, stage, fields, createdAt, updatedAt, authorId }
```

**`title`, `slug`, `content` scompaiono come colonne fisse.**

Se un Codex "Article" vuole titolo, slug e contenuto, li dichiara nel Blueprint come campi normali:
```ts
blueprint: [
  { name: 'title',   type: 'string',   queryable: true, required: true },
  { name: 'slug',    type: 'slug',     queryable: true, source: 'title' }, // nuovo tipo
  { name: 'content', type: 'richtext', queryable: false },
]
```

Un Codex "Contact" non dichiara nessuno di questi, e non li riceve.

### 4.2 Il Tipo di Campo `slug`

Il tipo `slug` è un campo speciale, non più implicito:
- Si auto-genera da un campo sorgente (`source: 'fieldName'`)
- Ha unicità per `(codex, slug)` — ma solo se dichiarato — tramite indice condizionale
- Un Folio senza campo `slug` non ha un URL pubblico, il che è corretto per dati interni

### 4.3 Gli `stages` Come Campo di Sistema

Il campo `stage` rimane in tabella (non nel blob JSON) per efficienza delle query. Ma il suo schema è dichiarato nel Codex:

```ts
stages: [
  { name: 'draft',     label: 'Bozza',       initial: true  },
  { name: 'published', label: 'Pubblicato',   final: false   },
  { name: 'archived',  label: 'Archiviato',   final: true    },
]
```

Se il Codex non dichiara stages, il sistema usa un default minimo: `['active', 'archived']`.

### 4.4 I `Links` Come Foreign Key di Prima Classe

Le relazioni tra Codices non sono più salvate nel blob JSON. Esiste una tabella dedicata:

```
folio_links {
  id,
  fromFolioId  → folios.id,
  fromField    (nome del campo link nel Blueprint),
  toFolioId    → folios.id,
  toCodex      (per query efficienti senza JOIN),
  order        (per relazioni ordinate, es. repeater di link)
}
```

Questo garantisce:
- **Integrità referenziale** — non si può cancellare un Folio se altri vi puntano (con cascade configurabile)
- **Query inverse** — "dammi tutti i prodotti del brand X" senza scorrere JSON
- **Indici reali** — la query usa indici SQL, non full scan del blob

### 4.5 Le Revisioni Generalizzate

La tabella `folio_revisions` (ex `post_revisions`) salva solo `fields` e `stage` come snapshot. Non c'è titolo/slug predefinito: se il Codex ha un campo `title`, questo sarà nel JSON `fields`.

### 4.6 Schema Database Completo

```
folios
  { id, codex, stage, fields (JSON), createdAt, updatedAt, authorId }
  INDEX UNIQUE (codex, slug) — solo se almeno un Folio del Codex ha campo slug

folio_field_index
  { id, folioId, fieldName, stringValue, numberValue }
  INDEX (fieldName, stringValue), INDEX (fieldName, numberValue)
  — invariato nel meccanismo, cambia solo il nome della tabella

folio_links
  { id, fromFolioId, fromField, toFolioId, toCodex, order }
  INDEX (fromFolioId, fromField), INDEX (toFolioId)

folio_revisions
  { id, folioId, stage, fields (JSON), createdAt, authorId }

vocabularies
  { id, name, slug, hierarchical }
  — ex taxonomies, ma ora anche i Codices possono agire da Vocabulary (via flag)

terms
  { id, vocabularyId, name, slug, description, parentId }

folio_terms
  { folioId, termId }
  — invariato nel meccanismo

roles     { id, name, slug, capabilities (JSON) }
users     { id, username, passwordHash, email, roleId, createdAt }
plugin_status { name, active }
refresh_tokens { id, userId, tokenHash, expiresAt }
```

---

## 5. Implicazioni sull'API REST

### 5.1 Struttura Endpoint

```
// PRIMA
GET  /api/v1/posts?type=product
POST /api/v1/posts
GET  /api/v1/posts/:id
PUT  /api/v1/posts/:id
DEL  /api/v1/posts/:id
GET  /api/v1/taxonomies/:taxonomy/terms

// DOPO
GET  /api/v1/codices                          (lista Codices registrati — ex post-types)
GET  /api/v1/:codex                           (lista Folios del Codex)
POST /api/v1/:codex                           (crea Folio)
GET  /api/v1/:codex/:id                       (singolo Folio)
PUT  /api/v1/:codex/:id                       (aggiorna Folio)
DEL  /api/v1/:codex/:id                       (elimina Folio)
GET  /api/v1/:codex/:id/links/:field          (Folios collegati via Link)
GET  /api/v1/vocabularies/:vocabulary/terms   (ex /taxonomies/:taxonomy/terms)
```

Esempio reale:
```
GET /api/v1/products?price[gt]=100&stage=available&genre=fantasy
GET /api/v1/articles?slug=my-article-slug
GET /api/v1/events?stage=upcoming&orderBy=startDate&order=asc
GET /api/v1/products/42/links/brand
```

### 5.2 La Query API è più Espressiva

Con i Links come entità proprie, la query API può includere Folios correlati in una sola chiamata:
```
GET /api/v1/products?include=brand,category
→ ogni product nel risultato porta già i dati del brand e della categoria
```

Questo era impossibile o costoso con il modello post/fields-blob.

### 5.3 Retrocompatibilità per Chi Usa il Blog Pattern

Per i Codices che dichiarano campi `title`, `slug`, `content` con quel nome esatto, l'admin e le API li trattano con UX ottimizzata (es. il campo `title` diventa l'intestazione nell'elenco, il campo `slug` abilita la preview URL). Non c'è rottura — chi vuole il comportamento blog, lo ottiene dichiarandolo.

---

## 6. Implicazioni sull'Admin UI

### 6.1 Lista Folios Dinamica

L'intestazione della lista non è sempre "Titolo | Slug | Stato". È configurabile per Codex:
```ts
{
  name: 'product',
  listColumns: ['sku', 'price', 'stage'], // colonne mostrate nella lista admin
  displayField: 'name',                   // campo usato come "titolo" nella UI
}
```

Se `displayField` non è dichiarato, si usa il campo `title` se esiste, altrimenti l'ID.

### 6.2 Editor Folio Completamente Dinamico

L'editor non presuppone titolo+richtext+sidebar. Renderizza i campi nell'ordine dichiarato nel Blueprint, con layout configurabile:
```ts
blueprint: [
  { name: 'name',  type: 'string',  layout: 'full' },
  { name: 'price', type: 'number',  layout: 'half' },
  { name: 'sku',   type: 'string',  layout: 'half' },
  { name: 'brand', type: 'link',    target: 'brand', layout: 'sidebar' },
]
```

### 6.3 Navigazione Sidebar

La sidebar dell'admin mostra: Codices registrati + Vocabularies, raggruppati per sezione configurabile nel config:
```ts
adminSections: [
  { label: 'Contenuti',  codices: ['article', 'page'] },
  { label: 'Catalogo',   codices: ['product', 'brand', 'category'] },
  { label: 'CRM',        codices: ['contact', 'company'] },
]
```

---

## 7. I Vocabularies e la Fine della "Taxonomy" Come Concetto Speciale

### 7.1 La Proposta Radicale

Le Taxonomies attuali esistono perché WordPress aveva bisogno di un modo per catalogare i post. In realtà, sono Codices molto semplici (solo `name`, `slug`, `parentId`) con una relazione N:M verso altri Codices.

**Proposta:** abolire le Taxonomies come sistema separato. Un Vocabulary (`genre`, `category`, `tag`) diventa un Codex con il flag `vocabulary: true`:

```ts
codices: [
  {
    name: 'genre',
    label: 'Generi',
    vocabulary: true,      // abilita struttura gerarchica e UI da vocabulary
    hierarchical: true,
    for: ['book', 'film'], // quali Codices possono referenziarlo
    blueprint: [
      { name: 'name',  type: 'string', required: true },
      { name: 'slug',  type: 'slug',   source: 'name' },
      { name: 'color', type: 'string' }, // i Vocabulary possono avere campi extra!
    ]
  }
]
```

Questo porta a un vantaggio enorme: **i Vocabulary hanno campi custom come qualsiasi Codex**. Quindi "Genere" può avere un colore, un'icona, una descrizione ricca, un'immagine — senza hack.

### 7.2 Gestione della Transizione

Per ora i Vocabularies possono convivere con il sistema Taxonomy esistente. La migrazione può avvenire per stadi:
1. Fase 1: rinominare "taxonomies" → "vocabularies" nella codebase (rename puramente nominale)
2. Fase 2: ristrutturare Vocabulary come Codex speciale con Blueprint
3. Fase 3: unificare le tabelle `vocabularies` e `folios`

---

## 8. Cosa si Guadagna: Casi d'Uso Abilitati

### 8.1 CRM Completo
```ts
codices: [
  { name: 'company',  blueprint: ['name', 'website', 'industry', 'size'] },
  { name: 'contact',  blueprint: ['firstName', 'lastName', 'email',
                                  { name: 'company', type: 'link', target: 'company' }] },
  { name: 'deal',     blueprint: ['title', 'value', 'stage',
                                  { name: 'contact', type: 'link', target: 'contact' },
                                  { name: 'company', type: 'link', target: 'company' }],
                      stages: ['prospect', 'qualified', 'proposal', 'won', 'lost'] },
]
```

Con WordPress + CPT questo è un patchwork. Con PhrasePress data-centric, è configurazione.

### 8.2 E-commerce Strutturato
```ts
codices: [
  { name: 'product',  blueprint: ['name', 'sku', 'price', 'stock',
                                   { name: 'brand', type: 'link', target: 'brand' }] },
  { name: 'brand',    blueprint: ['name', 'logo', 'country'] },
  { name: 'order',    blueprint: ['orderNumber', 'total', 'items'],
                      stages: ['pending', 'processing', 'shipped', 'delivered', 'refunded'] },
]
```

### 8.3 Knowledge Base / Wiki
```ts
codices: [
  { name: 'article',   blueprint: ['title', 'slug', 'content', 'summary',
                                    { name: 'relatedArticles', type: 'link', target: 'article', multiple: true }],
                       stages: ['draft', 'review', 'published', 'deprecated'] },
]
```

Il vecchio modello WordPress funziona comunque — ma ora è un caso speciale di un sistema più generale.

### 8.4 Multi-lingua Nativa (Senza Plugin)
```ts
codices: [
  { name: 'translation',
    blueprint: ['locale', 'key', 'value'],
    indexes: [{ fields: ['locale', 'key'], unique: true }],
    stages: ['draft', 'approved'] }
]
```

Un sistema di traduzioni come Codex — senza dipendere dal plugin i18n.

---

## 9. Cosa Non Cambia (Garanzie di Continuità)

| Componente | Cambiamento |
|---|---|
| Drizzle ORM + SQLite | ✅ Nessun cambiamento |
| Fastify HTTP framework | ✅ Nessun cambiamento |
| Sistema plugin + Hooks | ✅ Nessun cambiamento (solo rename nei nomi degli hook) |
| JWT + Auth | ✅ Nessun cambiamento |
| Custom field index queryable | ✅ Stesso meccanismo, tabella rinominata |
| Sistema revisioni | ✅ Stesso meccanismo, generalizzato |
| Vue 3 Admin | ⚠️ Refactoring UI (nessuna logica da rifare, solo rendering dinamico) |
| Plugin esistenti (media, forms, i18n) | ⚠️ Adattamento API (non riscrittura) |

---

## 10. Roadmap di Implementazione

> L'implementazione avviene per fasi, ognuna autonoma e testabile.

### Fase 0 — Fondamenta Concettuali (questo documento)
- [ ] Approvare la terminologia Codex / Folio
- [ ] Approvare il modello dati proposto
- [ ] Identificare le breaking change accettabili

### Fase 1 — Rename e Refactoring Nominale
- [ ] Rinominare `posts` → `folios`, `postType` → `codex` nel DB e nel codice
- [ ] Rinominare `PostTypeRegistry` → `CodexRegistry`
- [ ] Rinominare `taxonomies` → `vocabularies` nel codice e nelle API
- [ ] Aggiornare tutte le route API con i nuovi path
- [ ] Aggiornare l'admin Vue 3 con la nuova terminologia

### Fase 2 — Schema Libero (No Campi Predefiniti)
- [ ] Rendere `title`, `slug`, `content` opzionali come campi Blueprint normali
- [ ] Aggiungere tipo di campo `slug` con auto-generazione
- [ ] Implementare gli `stages` configurabili per Codex (invece di `status` fisso)
- [ ] Aggiornare l'admin per rendering dinamico basato su Blueprint

### Fase 3 — Links Come Entità di Prima Classe
- [ ] Creare tabella `folio_links` con integrità referenziale
- [ ] Aggiungere tipo di campo `link` nel Blueprint
- [ ] Aggiungere endpoint API per navigazione links
- [ ] Aggiornare `folio_field_index` per escludere i link (gestiti separatamente)

### Fase 4 — Vocabularies Come Codex Speciale
- [ ] Aggiungere flag `vocabulary: true` ai Codices
- [ ] Migrare la logica taxonomy → vocabulary
- [ ] Consentire Blueprint custom sui Vocabulary
- [ ] Unificare gradualmente le tabelle

### Fase 5 — Developer Experience
- [ ] Generazione automatica TypeScript types dai Codices (`CodexTypes<'product'>`)
- [ ] Endpoint `/api/v1/codices/:name/schema` per schema introspection
- [ ] Documentazione API auto-generata (OpenAPI da Blueprint)

---

## 11. Rischi e Mitigazioni

| Rischio | Probabilità | Mitigazione |
|---|---|---|
| Breaking change per il test site esistente | Alta | Alias temporanei `/posts` → `/folios` durante la transizione |
| Complessità eccessiva dell'admin con schema dinamico | Media | Iniziare con rendering semplice, migliorare iterativamente |
| Performance della tabella `folio_links` | Bassa | Indici coprono i pattern di query previsti |
| Confusione della terminologia per utenti WP | Media | Documentazione chiara, mapping terminologico esplicito |

---

## 12. Conclusione: Perché Vale la Pena

WordPress è uno strumento eccezionale per ciò che è stato progettato per fare. PhrasePress non deve competere con WordPress — deve essere *diverso* da WordPress in modo significativo.

La differenza significativa non è tecnologica (Node.js vs PHP, TypeScript vs codice legacy). La differenza significativa è **concettuale**:

> WordPress è un CMS che si può usare come database.  
> PhrasePress è un database che si comporta come un CMS.

Un Codex non è un "post type". È la definizione formale di una classe di dati — un contratto TypeScript che descrive cosa esiste nel sistema. Un Folio non è un "post". È un'istanza di quel contratto — un record che rispetta lo schema.

Questo cambio di prospettiva sblocca PhrasePress come strumento per categorie di problemi che WordPress non può nemmeno avvicinarsi a risolvere in modo pulito: CRM, e-commerce strutturato, knowledge base relazionale, gestione eventi, cataloghi multimediali, sistemi editoriali complessi.

Non stiamo costruendo un blog engine migliore. Stiamo costruendo **l'infrastruttura dati per qualsiasi applicazione web content-driven**.

---

*Documento redatto: Marzo 2026*  
*Prossimo passo: revisione → approvazione → apertura issue di implementazione Fase 1*
