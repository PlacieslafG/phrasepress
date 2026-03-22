#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/var/www/phrasepress"
NGINX_CONF="/etc/nginx/sites-available/phrasepress"

echo "=== PhrasePress Install ==="

# ── Prerequisiti ──────────────────────────────────────────────────────────────
command -v node  >/dev/null 2>&1 || { echo "ERRORE: Node.js non trovato (richiesto v22+)"; exit 1; }
command -v pnpm  >/dev/null 2>&1 || npm install -g pnpm
command -v pm2   >/dev/null 2>&1 || npm install -g pm2

if ! command -v nginx >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y nginx
  else
    echo "ERRORE: nginx non trovato. Installalo manualmente."; exit 1
  fi
fi

# ── Installa dipendenze e compila ─────────────────────────────────────────────
pnpm install --frozen-lockfile
pnpm run build

# ── Directory dati ────────────────────────────────────────────────────────────
mkdir -p data uploads

# ── .env ─────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  Il file .env è stato creato da .env.example."
  echo "   Modifica i valori (JWT_SECRET, ADMIN_PASSWORD, DOMAIN, ecc.) e rilancia lo script."
  echo "   Premi INVIO quando hai finito..."
  read -r
fi

# ── Migrazione DB ──────────────────────────────────────────────────────────────
pnpm run db:migrate

# ── Deploy file statici (SPA admin) ──────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cp -r dist/admin/* "$INSTALL_DIR/dist/admin/"
[ -d uploads ] && cp -r uploads "$INSTALL_DIR/"

# ── pm2 ───────────────────────────────────────────────────────────────────────
pm2 start ecosystem.config.cjs --env production
pm2 save
echo ""
echo "Per attivare l'avvio automatico al boot, esegui il comando mostrato da:"
pm2 startup

# ── Nginx ─────────────────────────────────────────────────────────────────────
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2)
if [ -z "$DOMAIN" ]; then
  echo "ATTENZIONE: DOMAIN non trovato in .env — configura Nginx manualmente."
else
  sed "s/\${DOMAIN}/$DOMAIN/g" deploy/nginx.conf.template > "$NGINX_CONF"
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/phrasepress
  nginx -t && systemctl reload nginx
fi

echo ""
echo "=== Installazione completata! ==="
[ -n "$DOMAIN" ] && echo "➜  http://$DOMAIN"
