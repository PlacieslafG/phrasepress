FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ── deps: installa solo le dipendenze di produzione ────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json  ./packages/core/
COPY packages/admin/package.json ./packages/admin/

# Installa tutte le dipendenze (dev incluse, necessarie per la build)
RUN pnpm install --frozen-lockfile

# ── build: compila TS + Vite ───────────────────────────────────────────────────
FROM deps AS build
COPY . .

RUN pnpm run build

# ── production: immagine finale minimale ──────────────────────────────────────
FROM base AS production
WORKDIR /app

# Copia solo i manifest per reinstallare --prod (senza dev deps)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json  ./packages/core/
COPY packages/admin/package.json ./packages/admin/

RUN pnpm install --frozen-lockfile --prod

# Copia i compilati
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/dist/admin          ./dist/admin

# Copia migration e config utente
COPY packages/core/src/db/migrations ./packages/core/src/db/migrations
COPY config ./config

# Directory dati (montate come volume in produzione)
RUN mkdir -p /data /app/uploads

EXPOSE 3000

CMD ["node", "packages/core/dist/server.js"]
