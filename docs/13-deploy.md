# Deploy

---

## Architettura in produzione

```
Internet
   │
   ▼
Nginx (porta 80/443)
   ├── /           → file statici da dist/admin/ (SPA Vue)
   ├── /api/*      → proxy_pass http://127.0.0.1:3000
   └── /uploads/*  → file statici da uploads/
   
Node.js / Fastify (porta 3000, pm2)
   └── data/phrasepress.db  (SQLite)
```

---

## Deploy su VPS con install.sh

```bash
# 1. Clona il repository
git clone https://github.com/tuouser/phrasepress.git /var/www/phrasepress
cd /var/www/phrasepress

# 2. Crea il file .env
cp .env.example .env
nano .env   # imposta JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_PASSWORD, DOMAIN

# 3. Esegui lo script di installazione
sudo bash install.sh
```

`install.sh` eseguirà automaticamente:
1. Verifica prerequisiti (node 22+, pnpm, pm2, nginx)
2. `pnpm install` + `pnpm build`
3. `pnpm db:migrate`
4. Avvio con pm2 + pm2 save
5. Configurazione Nginx dal template in `deploy/nginx.conf.template`

---

## Docker

```bash
# Build immagine
docker build -t phrasepress .

# Run con volumi per dati persistenti
docker run -d \
  --name phrasepress \
  -p 3000:3000 \
  -e JWT_SECRET=... \
  -e JWT_REFRESH_SECRET=... \
  -e ADMIN_PASSWORD=... \
  -v $(pwd)/data:/data \
  -v $(pwd)/uploads:/app/uploads \
  phrasepress
```

### docker-compose

```bash
docker compose up -d
```

Configura le variabili d'ambiente nel file `.env` (letto automaticamente da docker-compose).

---

## Nginx

Il template `deploy/nginx.conf.template` configura:
- `/` → serve la SPA Vue da `dist/admin/` con `try_files` per client-side routing
- `/api` → reverse proxy a `http://127.0.0.1:3000`
- `/uploads` → file statici con cache 30 giorni

Per HTTPS con Let's Encrypt:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d tuodominio.com
```

---

## Variabili d'ambiente in produzione

| Variabile | Note |
|---|---|
| `JWT_SECRET` | Min 32 caratteri, generare con `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Min 32 caratteri, diverso da JWT_SECRET |
| `ADMIN_PASSWORD` | Usato solo al primo avvio per il seed; dopo si può rimuovere |
| `DATABASE_PATH` | Default `/data/phrasepress.db`; montare come volume Docker |
| `NODE_ENV` | Impostare a `production` |
| `DOMAIN` | Es. `cms.example.com` |
| `CORS_ORIGIN` | Si può rimuovere in produzione se Nginx serve tutto sotto stesso dominio |

---

## Aggiornamenti

```bash
cd /var/www/phrasepress
git pull
pnpm install
pnpm build
pnpm db:migrate
pm2 restart phrasepress
```

Lo script `update.sh` nella root esegue questi passi automaticamente.

---

## Backup

Il database SQLite è un singolo file: `data/phrasepress.db`. Per backup automatici:

```bash
# Copia sicura con SQLite (non blocca le scritture)
sqlite3 data/phrasepress.db ".backup 'backup-$(date +%Y%m%d).db'"

# Oppure cron giornaliero
0 2 * * * sqlite3 /var/www/phrasepress/data/phrasepress.db ".backup '/backups/phrasepress-$(date +\%Y\%m\%d).db'"
```
