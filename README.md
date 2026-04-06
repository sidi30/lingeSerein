# Lingengo

Service B2B de location de linge hôtelier pour le Vaucluse (FR).

## Stack

- **Apps mobiles** : React Native + Expo SDK 52 (client + livreur)
- **Dashboard admin** : Next.js 15 + React 19 + Tailwind CSS v4
- **API** : Node.js 22 + Fastify v5
- **Base de données** : PostgreSQL 16 + Prisma 6
- **Cache & queues** : Redis 7 + BullMQ

## Structure du monorepo

```
apps/
  client-app/       # App client iOS/Android
  delivery-app/     # App livreur iOS/Android
  admin-web/        # Dashboard admin Next.js
packages/
  api/              # API REST Fastify
  database/         # Prisma ORM + migrations
  shared/           # Types, schémas Zod, constantes
  ui/               # Design system partagé
  eslint-config/    # Configuration ESLint partagée
```

## Installation

```bash
# 1. Cloner le repo
git clone <repo-url> && cd lingengo

# 2. Installer les dépendances
npm install

# 3. Copier les variables d'environnement
cp .env.example .env
# Remplir les valeurs dans .env

# 4. Lancer PostgreSQL + Redis
docker compose up -d

# 5. Générer le client Prisma + appliquer les migrations
npm run db:generate
npm run db:migrate

# 6. Lancer le projet en développement
npm run dev
```

## Scripts principaux

| Commande             | Description                                 |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Lance toutes les apps en mode développement |
| `npm run build`      | Build de production                         |
| `npm run lint`       | Lint de tous les workspaces                 |
| `npm run test`       | Tests de tous les workspaces                |
| `npm run typecheck`  | Vérification TypeScript                     |
| `npm run db:migrate` | Appliquer les migrations Prisma             |
| `npm run db:studio`  | Ouvrir Prisma Studio                        |

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)
- **Branches** : `main` (production) / `develop` (staging) / `feature/*` / `hotfix/*`
- **TypeScript** : strict mode — aucune exception
