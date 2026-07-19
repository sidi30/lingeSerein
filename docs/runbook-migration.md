# Runbook — migrations de base en production

## Pourquoi ce document

`packages/api/docker-entrypoint.sh` lance `prisma migrate deploy` **au démarrage du
conteneur**, avec `set -euo pipefail`. Conséquence directe :

> **Déployer, c'est migrer.** Et une migration qui échoue fait sortir l'entrypoint en
> erreur → `restart: unless-stopped` relance → **crash-loop**. L'API, l'app mobile et
> l'admin sont alors **tous indisponibles** jusqu'à intervention SSH.

Il n'y a pas de `healthcheck` sur `ls-api` et Prisma ne génère pas de migration
inverse (aucun `down.sql` dans les dossiers existants). D'où cette procédure.

## Avant toute migration

```bash
# Sur le VPS. --verify restaure réellement le dump sur une base jetable :
# un dump jamais restauré n'est pas une sauvegarde.
/opt/backup-db.sh --verify
```

Ne rien lancer tant que la ligne `[verify] restauration VALIDÉE` n'est pas affichée.

## Déploiement

```bash
# Depuis le poste de dev, à la racine du repo
git archive HEAD | ssh root@46.224.193.109 \
  'cd /opt/apps/LingeSerein-API && tar xf - && \
   find . -name "*.sh" -exec sed -i "s/\r$//" {} +'
```

⚠️ Le `sed` sur les `*.sh` n'est pas cosmétique : un `docker-entrypoint.sh` avec des
fins de ligne CRLF produit `set: pipefail: invalid option name` et part en crash-loop
avant même d'atteindre la migration.

```bash
ssh root@46.224.193.109 'cd /opt/apps/LingeSerein-API && \
  docker compose -f packages/api/docker-compose.prod.yml build ls-api && \
  docker compose -f packages/api/docker-compose.prod.yml up -d ls-api'

# Surveiller la migration au démarrage
ssh root@46.224.193.109 'docker logs -f --tail 40 ls-api'
```

Sortie attendue : `All migrations have been successfully applied.` puis
`Linge Serein API v1 running`.

## En cas d'échec de migration (crash-loop)

Symptôme : `docker ps` montre `ls-api` qui redémarre en boucle, et
`https://api.lingeserein.fr/health` ne répond plus.

```bash
# 1) Stopper la boucle pour reprendre la main
docker compose -f packages/api/docker-compose.prod.yml stop ls-api

# 2) Lire l'erreur exacte
docker logs --tail 60 ls-api

# 3) Marquer la migration comme annulée pour débloquer Prisma
docker compose -f packages/api/docker-compose.prod.yml run --rm --entrypoint sh ls-api \
  -c "npx prisma migrate resolve --rolled-back <nom_du_dossier_de_migration> \
      --schema packages/database/prisma/schema.prisma"

# 4) Redéployer l'image précédente pour rétablir le service
docker tag lingeserein-api:rollback lingeserein-api:latest
docker compose -f packages/api/docker-compose.prod.yml up -d ls-api
```

Toujours taguer l'image courante avant un déploiement risqué :

```bash
docker tag lingeserein-api:latest lingeserein-api:rollback
```

## Retour arrière complet (dernier recours)

Prisma n'a pas de migration inverse : il faut défaire à la main **puis** effacer la
trace, sinon `migrate deploy` considérera la migration comme déjà appliquée.

```bash
docker exec ls-postgres psql -U lingeserein -d lingeserein
```

```sql
-- Exemple pour 20260720000000_client_crm
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_rating_range";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_password_requires_email";
-- ⚠️ Ne PAS remettre NOT NULL sur email/password_hash s'il existe déjà des
-- clients sans compte : la commande échouerait et il faudrait leur inventer un
-- email ou les supprimer. C'est le point de non-retour de cette migration.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260720000000_client_crm';
```

Restauration totale depuis un dump (perd les écritures postérieures) :

```bash
docker cp /opt/backups/ls-<date>.dump ls-postgres:/tmp/r.dump
docker exec ls-postgres pg_restore -U lingeserein -d lingeserein --clean --if-exists \
  --exit-on-error /tmp/r.dump
```

## Dérive Prisma connue

Trois éléments de `20260720000000_client_crm` ne sont **pas** exprimables dans
`schema.prisma` : les deux `CHECK` (`users_rating_range`,
`users_password_requires_email`) et rien d'autre côté index.

Conséquence : un futur `prisma migrate dev` proposera de les supprimer, croyant à une
dérive. **Retirer ces `DROP CONSTRAINT` à la main de la migration générée**, sinon les
garde-fous disparaissent silencieusement de la base.

## Amélioration à prévoir

Sortir `prisma migrate deploy` de l'entrypoint pour en faire une commande explicite :

```bash
docker compose run --rm ls-api npx prisma migrate deploy
```

Un échec de migration cesserait alors d'être une panne totale du service — il
laisserait simplement l'ancienne version en ligne. Tant que ce n'est pas fait, toute
migration est une opération à risque de coupure, à mener en présence de quelqu'un.
