# Modulo 13 — Deploy

**Dipendenze:** tutti i moduli precedenti  
**Produce:** Dockerfile, configurazione Nginx, script pm2, script install.sh

---

## Obiettivo

Permettere il deploy di PhrasePress su un VPS esattamente come si farebbe con WordPress: copia file, esegui uno script, configura Nginx, funziona.

---

## Architettura in produzione

```
Internet
   │
   ▼
Nginx (porta 80/443)
   ├── /admin/*    → serve file statici da dist/admin/ (build Vue)
   ├── /api/*      → proxy_pass http://localhost:3000
   └── /uploads/*  → serve file statici da uploads/ (plugin media)
   
Node.js / Fastify (porta 3000, gestito da pm2)
   └── phrasepress.db  (SQLite, in data/)
```

---

## File da creare

### `Dockerfile`

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Installa pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copia e installa dipendenze
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/admin/package.json ./packages/admin/
RUN pnpm install --frozen-lockfile --prod

# Copia sorgenti e build
COPY . .
RUN pnpm build

# Crea directory dati
RUN mkdir -p /data /app/uploads

EXPOSE 3000

CMD ["node", "packages/core/dist/index.js"]
```

### `docker-compose.yml` (develop + production)

```yaml
version: '3.9'
services:
  phrasepress:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data            # SQLite persistente
      - ./uploads:/app/uploads  # File media persistenti
      - ./config:/app/config    # Config utente
    environment:
      - DATABASE_PATH=/data/phrasepress.db
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - PORT=3000
      - NODE_ENV=production
```

---

### `ecosystem.config.cjs` (pm2)

```js
module.exports = {
  apps: [{
    name:         'phrasepress',
    script:       './packages/core/dist/index.js',
    instances:    1,          // SQLite non supporta multi-istanza
    autorestart:  true,
    watch:        false,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
    },
  }],
}
```

---

### Template Nginx (`deploy/nginx.conf.template`)

```nginx
server {
    listen 80;
    server_name ${DOMAIN};

    # Admin SPA — file statici
    location /admin {
        alias /var/www/phrasepress/dist/admin;
        try_files $uri $uri/ /admin/index.html;
    }

    # API → reverse proxy a Node.js
    location /api {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # (Plugin media) Upload serviti staticamente
    location /uploads {
        alias /var/www/phrasepress/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Dopo l'installazione di Certbot: `certbot --nginx -d yourdomain.com`

---

### `install.sh`

Script per primo deploy su VPS Ubuntu/Debian:

```bash
#!/bin/bash
set -e

echo "=== PhrasePress Install ==="

# 1. Verifica prerequisiti
command -v node  >/dev/null || { echo "Node.js non trovato"; exit 1; }
command -v pnpm  >/dev/null || { npm install -g pnpm; }
command -v pm2   >/dev/null || { npm install -g pm2; }
command -v nginx >/dev/null || { apt install -y nginx; }

# 2. Install dipendenze
pnpm install --frozen-lockfile

# 3. Build admin
pnpm build

# 4. Crea directory
mkdir -p data uploads

# 5. Copia .env
[ -f .env ] || cp .env.example .env
echo "⚠️  Modifica .env con i tuoi valori prima di continuare!"
echo "   Premi INVIO quando sei pronto..."
read

# 6. Migra DB (crea tabelle + seed ruoli + admin)
pnpm db:migrate

# 7. Avvia con pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup  # mostra il comando per auto-avvio al boot

# 8. Configura Nginx
DOMAIN=$(grep DOMAIN .env | cut -d= -f2)
sed "s/\${DOMAIN}/$DOMAIN/g" deploy/nginx.conf.template \
  > /etc/nginx/sites-available/phrasepress
ln -sf /etc/nginx/sites-available/phrasepress /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "=== Installazione completata! ==="
echo "Visita: http://$DOMAIN/admin"
```

---

### `update.sh`

Per aggiornamenti successivi:

```bash
#!/bin/bash
set -e

git pull
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate           # applica nuove migration se presenti
pm2 restart phrasepress
echo "Aggiornamento completato."
```

---

## Variabili d'ambiente di produzione

| Variabile | Descrizione | Esempio |
|---|---|---|
| `DATABASE_PATH` | Path assoluto o relativo al file SQLite | `./data/phrasepress.db` |
| `JWT_SECRET` | Segreto per access token (min 32 char) | stringa random lunga |
| `JWT_REFRESH_SECRET` | Segreto per refresh token | stringa random diversa |
| `ADMIN_PASSWORD` | Password utente admin iniziale (solo al seed) | |
| `PORT` | Porta Fastify | `3000` |
| `NODE_ENV` | `production` | |
| `DOMAIN` | Dominio per Nginx | `example.com` |

---

## Checklist

- [ ] Creare `Dockerfile` e `.dockerignore`
- [ ] Creare `docker-compose.yml`
- [ ] Creare `ecosystem.config.cjs` per pm2
- [ ] Creare template Nginx `deploy/nginx.conf.template`
- [ ] Scrivere `install.sh` e testarlo su VM pulita
- [ ] Scrivere `update.sh`
- [ ] Documentare variabili d'ambiente in `README.md` e `.env.example`
- [ ] Testare build Docker: `docker compose up --build`
- [ ] Testare deploy VPS: provare su DigitalOcean Droplet / Hetzner CX22
- [ ] Configurare HTTPS con Certbot nell'installazione di test
