# Linge Serein

Service B2B de location de linge hôtelier pour le Vaucluse (FR) — devis, commandes, tournées de livraison pour hôtes Airbnb / gîtes.

## Stack

- **App mobile** : React Native + Expo SDK 55 (une seule app, 3 rôles : client, livreur, admin)
- **Dashboard admin** : Next.js 15 + React 19 + Tailwind CSS v4
- **Vitrine** : Next.js 15 + React 19 (site public + générateur de devis PDF)
- **Mailer** : Fastify 5 + Nodemailer (formulaire de contact)
- **API** : Node.js 22 + Fastify 5
- **Base de données** : PostgreSQL 16 + Prisma 6
- **Cache & queues** : Redis 7 + BullMQ
- **Monorepo** : Turborepo + npm workspaces

> Note : le scope npm interne des packages est resté `@lingengo/*` (nom historique) ; le produit est **Linge Serein**.

## Structure du monorepo

```
apps/
  mobile/        # App React Native / Expo (client + livreur + admin)
  admin-web/     # Dashboard admin Next.js (devis, commandes, users, réglages)
  vitrine/       # Site public Next.js + génération devis PDF
  mailer/        # Service Fastify formulaire de contact (api.lingeserein.fr)
packages/
  api/           # API REST Fastify (@lingengo/api)
  database/      # Prisma ORM + migrations (@lingengo/database)
  shared/        # Types, schémas Zod, constantes, calcul devis (@lingengo/shared)
  ui/            # Design system partagé + rendu react-pdf (@lingengo/ui)
  eslint-config/ # Configuration ESLint partagée
```

## Prérequis

- Node.js >= 22, npm >= 10
- Docker (PostgreSQL + Redis)

## Installation

```bash
# 1. Cloner le repo
git clone <repo-url> && cd service-serviette

# 2. Installer les dépendances
npm install

# 3. Copier les variables d'environnement
cp .env.example .env
# Remplir les valeurs dans .env

# 4. Lancer PostgreSQL + Redis
docker compose up -d

# 5. Générer le client Prisma + appliquer les migrations + seed
npm run db:generate
npm run db:migrate
npm run db:seed

# 6. Lancer le projet en développement
npm run dev
```

L'app mobile se lance à part avec Expo (voir `apps/mobile`).

## Scripts principaux

| Commande              | Description                                 |
| --------------------- | ------------------------------------------- |
| `npm run dev`         | Lance toutes les apps en mode développement |
| `npm run build`       | Build de production                         |
| `npm run lint`        | Lint de tous les workspaces                 |
| `npm run lint:fix`    | Lint + correction automatique               |
| `npm run format`      | Formate le code (Prettier)                  |
| `npm run test`        | Tests de tous les workspaces                |
| `npm run typecheck`   | Vérification TypeScript                     |
| `npm run db:migrate`  | Appliquer les migrations Prisma             |
| `npm run db:generate` | Générer le client Prisma                    |
| `npm run db:seed`     | Seed la base                                |
| `npm run db:studio`   | Ouvrir Prisma Studio                        |

## Déploiement (prod)

- **VPS** : Docker Compose derrière Traefik.
- **vitrine** → `lingeserein.fr`
- **admin-web** → `admin.lingeserein.fr`
- **api + mailer** → `api.lingeserein.fr` (path-routé)
- **mobile** → EAS Build → TestFlight (iOS) / Google Play internal (Android)

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)
- **Branches** : `main` (production) / `feature/*` / `hotfix/*`
- **TypeScript** : strict mode — aucune exception
  </content>
  </invoke>
