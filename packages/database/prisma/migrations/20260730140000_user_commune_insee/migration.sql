-- Migration: 20260730140000_user_commune_insee
--
-- `users.commune_insee` — la commune de livraison du client, par son code INSEE.
--
-- POURQUOI UNE COLONNE DE PLUS alors que `city` et `postal_code` existent déjà :
--
--  1. Le code postal NE DÉSIGNE PAS UNE COMMUNE. 84100 couvre Orange (0 € de
--     livraison, commune du siège) ET Uchaux ; sept codes postaux du Vaucluse
--     sont à cheval sur deux paliers tarifaires. Déduire le prix du seul code
--     postal, c'était donc soit se tromper, soit deviner.
--  2. Le code postal est écrit LIBREMENT par le client depuis son profil
--     (PATCH /auth/me). Tant que le tarif s'en déduisait, saisir « 84100 »
--     suffisait à s'attribuer la gratuité d'Orange. `commune_insee` est choisi
--     dans une liste FERMÉE (les 151 communes du Vaucluse, `@lingengo/shared`),
--     revalidée côté serveur : il n'y a plus de chaîne libre dans le calcul.
--  3. Le nom d'une commune n'est pas stable (fusions), le code INSEE l'est.
--
-- ADDITIVE : colonne NULLABLE, aucune valeur par défaut, aucune contrainte
-- d'intégrité vers une table de communes (la liste vit dans le code, pas en
-- base — c'est une donnée de référence versionnée avec l'application).
-- Les fiches existantes restent donc à NULL et continuent de fonctionner par le
-- REPLI code postal → palier le moins cher (`zoneParCodePostal`). Le script
-- `packages/api/scripts/rapport-communes-clients.ts` dit, AVANT déploiement,
-- combien de clients basculeraient en « sur devis ».
--
-- Rollback : la colonne se supprime sans perte de donnée métier antérieure
-- (elle n'existait pas). Prisma n'a pas de down-migration — voir
-- docs/runbook-migration.md.

SET lock_timeout = '5s';

-- VARCHAR(5) : un code INSEE de commune fait exactement 5 caractères. Pas de
-- CHECK sur le préfixe « 84 » : la contrainte de périmètre est métier (elle se
-- déplacerait avec le département desservi) et elle est portée par la validation
-- applicative, qui refuse en 400 une commune hors liste.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "commune_insee" VARCHAR(5);
