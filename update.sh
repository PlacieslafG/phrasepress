#!/usr/bin/env bash
set -euo pipefail

echo "=== PhrasePress Update ==="

git pull

pnpm install --frozen-lockfile
pnpm run build
pnpm run db:migrate

pm2 restart phrasepress

echo "=== Aggiornamento completato ==="
