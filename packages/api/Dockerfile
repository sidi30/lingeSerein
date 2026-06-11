# syntax=docker/dockerfile:1
# Build monorepo (npm workspaces + turbo) de l'API Linge Serein.
# Contexte de build = racine du repo. On utilise `turbo prune` pour ne garder
# que @lingengo/api et ses deps internes (@lingengo/database, @lingengo/shared)
# → on évite d'installer expo/react-native (apps/mobile) inutiles côté serveur.

# ---- Stage 1 : prune le sous-graphe de l'API ----
FROM node:22-alpine AS pruner
WORKDIR /app
COPY . .
RUN npx --yes turbo@^2.5.0 prune @lingengo/api --docker

# ---- Stage 2 : install deps + build ----
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
# Lockfile + package.json élagués (couche cache séparée des sources)
COPY --from=pruner /app/out/json/ ./
RUN npm ci
# Sources élaguées (inclut packages/database/prisma/**)
COPY --from=pruner /app/out/full/ ./
# Client Prisma puis build (shared → database → api, ordre géré par turbo)
RUN npx prisma generate --schema packages/database/prisma/schema.prisma \
 && npx turbo run build --filter=@lingengo/api

# ---- Stage 3 : runtime ----
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl bash
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3001
ENTRYPOINT ["bash", "packages/api/docker-entrypoint.sh"]
