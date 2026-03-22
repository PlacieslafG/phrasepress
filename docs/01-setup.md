# Setup e sviluppo locale

## Requisiti

- **Node.js** 22+
- **pnpm** 9+
- Sistema operativo: Linux, macOS o WSL2

---

## Struttura monorepo

```
phrasepress/
├── packages/
│   ├── core/          # server Node.js + Fastify + SQLite
│   ├── admin/         # SPA Vue 3 (pannello di amministrazione)
│   └── plugins/
│       ├── media/     # plugin gestione file/immagini
│       ├── fields/    # plugin custom fields avanzati
│       ├── forms/     # plugin form pubblici
│       └── mailer/    # plugin invio email
├── config/
│   └── phrasepress.config.ts   # configurazione del sito
├── deploy/
│   └── nginx.conf.template
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

---

## Installazione e avvio in sviluppo

```bash
# 1. Installa dipendenze
pnpm install

# 2. Crea il file .env (la prima volta)
cp .env.example .env
# Modifica i valori (vedi sezione variabili d'ambiente)

# 3. Esegui le migration del database
cd packages/core && pnpm db:migrate

# 4. Avvia il server core (porta 3000)
pnpm --filter @phrasepress/core dev

# 5. In un altro terminale: avvia l'admin (porta 5173)
pnpm --filter @phrasepress/admin dev
```

Apri `http://localhost:5173` per accedere all'admin. Le credenziali iniziali sono quelle definite in `ADMIN_USERNAME` e `ADMIN_PASSWORD` nel file `.env`.

---

## Variabili d'ambiente

Creare un file `.env` nella root del progetto con queste variabili:

| Variabile | Obbligatoria | Default | Descrizione |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Secret per la firma degli access token JWT (min 32 char) |
| `JWT_REFRESH_SECRET` | ✅ | — | Secret per la firma dei refresh token (min 32 char) |
| `ADMIN_PASSWORD` | ✅ | — | Password dell'utente `admin` creato al primo avvio |
| `ADMIN_USERNAME` | | `admin` | Username dell'utente admin iniziale |
| `DATABASE_PATH` | | `data/phrasepress.db` | Percorso del file SQLite |
| `PORT` | | `3000` | Porta su cui ascolta Fastify |
| `NODE_ENV` | | `development` | `development` o `production` |
| `CORS_ORIGIN` | | `http://localhost:5173` | Origini CORS consentite (separate da virgola) |
| `DOMAIN` | | — | Dominio pubblico (usato da install.sh e Nginx) |

---

## Comandi disponibili

### Root workspace
```bash
pnpm install          # installa tutte le dipendenze
pnpm build            # compila core (tsc) + admin (vite build)
pnpm test             # esegue i test del package core
```

### packages/core
```bash
pnpm dev              # avvia il server in development con tsx watch
pnpm build            # compila TypeScript → dist/
pnpm test             # vitest run
pnpm db:migrate       # applica le migration SQLite in sospeso
pnpm db:generate      # genera nuove migration da modifiche allo schema Drizzle
pnpm db:studio        # avvia Drizzle Studio (GUI database)
```

### packages/admin
```bash
pnpm dev              # avvia Vite dev server (porta 5173)
pnpm build            # produce dist/ per il deploy
pnpm type-check       # vue-tsc --noEmit
```

---

## TypeScript

- `tsconfig.base.json` nella root definisce le opzioni condivise (`strict: true`, `module: NodeNext`, `esModuleInterop: true`)
- Ogni package estende la base nel proprio `tsconfig.json`
- I file `.ts` del core usano import con estensione `.js` (richiesto da Node.js ESM)
- Il package admin usa Vite con `@vitejs/plugin-vue` che gestisce il bundling
