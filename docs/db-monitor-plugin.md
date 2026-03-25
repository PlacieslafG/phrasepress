# DB Monitor Plugin — Design Document

## Obiettivo

Plugin di monitoring del database per PhrasePress. Progettato come strumento scalabile per diagnostica delle performance, visibilità sugli indici e tracciamento delle query API.

## Scope iniziale (v1)

### 1. Index Analyzer
Mostra lo stato degli indici per ogni tabella SQLite:
- Quali colonne hanno un indice e di che tipo (unique, normale, PK)
- Quali colonne **non** hanno indici (potenziali colli di bottiglia)
- Statistiche aggregate per tabella

Dati estratti tramite SQL raw su `sqlite_master`, `PRAGMA index_list(table)` e `PRAGMA table_info(table)`.

### 2. Query Speed Monitor
Il frontend registra le proprie chiamate API con durata e metadati:
- URL della chiamata, metodo HTTP, codice risposta
- Durata in millisecondi lato client
- Timestamp, user agent, utente autenticato (se noto)

I dati vengono inviati dal client al backend tramite `POST /query-log`. Il backend li conserva in una tabella plugin-managed (`db_monitor_query_log`) e li espone con aggregazioni (media, percentili, query più lente).

### 3. Table Stats
Statistiche generali sulle tabelle del DB:
- Conteggio righe per tabella
- Dimensione stimata file SQLite
- PRAGMA SQLite utili (page_count, page_size, wal_autocheckpoint, ecc.)

---

## Architettura

```
packages/plugins/db-monitor/
  package.json
  tsconfig.json
  src/
    index.ts          # Plugin entry: onActivate, register
    routes.ts         # Fastify route registration
    analyzer.ts       # Logica index analysis + table stats (SQL raw PRAGMA)
    query-tracker.ts  # Tabella query_log, CRUD, aggregazioni
```

### Plugin entry (`index.ts`)
- `onActivate(ctx)` → crea la tabella `db_monitor_query_log`
- `register(ctx)` → chiama `onActivate` (idempotente) + registra le route Fastify

### Capacità richiesta
Tutte le route del plugin richiedono `manage_options` (riservata agli amministratori).

---

## API Routes

Prefisso: `/api/v1/plugins/db-monitor`

| Metodo | Path           | Descrizione                                           |
|--------|----------------|-------------------------------------------------------|
| GET    | `/indexes`     | Index analysis: tabelle, colonne, indici presenti/mancanti |
| GET    | `/table-stats` | Estadísticas tabelle: row count, pragma SQLite        |
| POST   | `/query-log`   | Frontend invia una entry di timing                    |
| GET    | `/query-log`   | Lista query logate con aggregazioni (lente, medie)    |
| DELETE | `/query-log`   | Svuota il log (mantenimento)                          |

---

## Schema tabella plugin-managed

```sql
CREATE TABLE IF NOT EXISTS db_monitor_query_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT    NOT NULL,
  method      TEXT    NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER,
  user_agent  TEXT,
  user_id     INTEGER,
  created_at  INTEGER NOT NULL
)
```

Indici sulla tabella di log:
- `(duration_ms)` — per trovare rapidamente le query più lente
- `(created_at)` — per pulizia/paginazione temporale

---

## Tipo risposta `GET /indexes`

```ts
{
  tables: Array<{
    name: string
    columns: Array<{
      name:      string
      type:      string
      notNull:   boolean
      pk:        boolean        // è colonna primary key
      indexed:   boolean        // ha almeno un indice
      indexName: string | null  // nome del primo indice trovato
      unique:    boolean        // l'indice è UNIQUE
    }>
    indexes: Array<{
      name:    string
      unique:  boolean
      columns: string[]
    }>
    unindexedColumns: string[]  // colonne non PK senza indice (suggerimentidi ottimizzazione)
  }>
}
```

## Tipo risposta `GET /query-log`

```ts
{
  data: Array<{
    id:         number
    url:        string
    method:     string
    durationMs: number
    statusCode: number | null
    userId:     number | null
    createdAt:  number
  }>
  stats: {
    count:      number
    avgMs:      number
    p50Ms:      number   // mediana
    p95Ms:      number
    maxMs:      number
    slowest: Array<{ url: string; method: string; durationMs: number; createdAt: number }>
  }
  total: number
  page:  number
  limit: number
}
```

---

## Scalabilità — Feature future (v2+)

Il plugin è strutturato in moduli separati (`analyzer.ts`, `query-tracker.ts`) per facilitare l'aggiunta di:

- **EXPLAIN QUERY PLAN** — endpoint per analizzare un'interrogazione SQL passata come parametro
- **Slow query alerting** — action hook `db_monitor.slow_query` quando una query supera una soglia configurabile
- **Auto-vacuum e OPTIMIZE** — endpoint admin per triggerare manutenzione SQLite
- **Index suggestions** — algoritmo che suggerisce indici mancanti basandosi sulle query più frequenti nel log
- **Retention policy** — pulizia automatica del log con TTL configurabile
- **Export CSV/JSON** — download del query log per analisi offline

---

## Sicurezza

- Tutte le route protette da `authenticate` + `requireCapability('manage_options')`  
- Il body di `POST /query-log` è validato con JSON Schema Fastify (niente input free-form nel DB)
- `url` nel query log è troncata a 500 caratteri per evitare log flooding
- `user_agent` troncato a 200 caratteri

---

## Integrazione config

```ts
// config/phrasepress.config.ts
plugins: [
  ...
  (await import('../packages/plugins/db-monitor/src/index.js')).default,
]
```
