#!/usr/bin/env bash
# Démarrage de l'API en prod : applique les migrations Prisma puis lance le serveur.
set -euo pipefail

echo "[entrypoint] prisma migrate deploy..."
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

echo "[entrypoint] starting Linge Serein API..."
exec node packages/api/dist/server.js
