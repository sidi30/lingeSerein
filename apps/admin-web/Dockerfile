# syntax=docker/dockerfile:1
# Build monorepo (npm workspaces + turbo) du back-office admin Linge Serein.
# Contexte de build = racine du repo. `turbo prune` ne garde que @lingengo/admin-web
# et ses deps internes (@lingengo/shared, @lingengo/ui) — pas d'expo/react-native.

# ---- Stage 1 : prune le sous-graphe de l'admin ----
FROM node:22-alpine AS pruner
WORKDIR /app
COPY . .
RUN npx --yes turbo@^2.5.0 prune @lingengo/admin-web --docker

# ---- Stage 2 : install deps + build Next.js (standalone) ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN npm ci
COPY --from=pruner /app/out/full/ ./
# tsconfig racine : les packages font `extends ../../tsconfig.base.json`,
# que `turbo prune` ne copie pas (fichier hors workspace).
COPY --from=pruner /app/tsconfig.base.json /app/tsconfig.json ./
# URL API embarquée au build (NEXT_PUBLIC_* est inliné dans le bundle client)
ARG NEXT_PUBLIC_API_URL=https://api.lingeserein.fr/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx turbo run build --filter=@lingengo/admin-web

# ---- Stage 3 : runtime (serveur standalone Next) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# outputFileTracingRoot = racine monorepo → server.js sous apps/admin-web/
COPY --from=builder /app/apps/admin-web/.next/standalone ./
COPY --from=builder /app/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=builder /app/apps/admin-web/public ./apps/admin-web/public
EXPOSE 3000
CMD ["node", "apps/admin-web/server.js"]
