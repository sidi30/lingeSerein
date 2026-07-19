-- CRM client : permettre d'enregistrer un client qui n'a jamais créé de compte
-- (rencontré sur un marché, au téléphone, par bouche-à-oreille) et enrichir sa
-- fiche commerciale.
--
-- Choix d'architecture : on garde `users` comme entité unique plutôt que
-- d'introduire un modèle `Client` séparé. Raison décisive : delivery_stops.client_id,
-- invoices.user_id et subscriptions.user_id sont des FK NOT NULL vers users, et
-- l'écran de tournée du livreur lit name/address/phone SUR users. Une entité
-- séparée imposerait un "compte fantôme" vide → arrêt de tournée sans nom et
-- géocodage cassé.
--
-- ⚠️ IRRÉVERSIBLE EN PRATIQUE : réversible tant qu'aucun client sans email
-- n'existe, plus du tout ensuite (il faudrait inventer des emails ou supprimer
-- des clients). Prisma n'a pas de down-migration.
-- Procédure de retour arrière : voir docs/runbook-migration.md.

SET lock_timeout = '5s';

-- 1) Le compte de connexion devient optionnel.
--    Postgres autorise plusieurs NULL dans un index UNIQUE : plusieurs clients
--    sans email cohabitent sans collision.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- 2) Origine du client — permet de distinguer "mes clients" des comptes app.
DO $$ BEGIN
  CREATE TYPE "ClientSource" AS ENUM ('APP','ADMIN','BOUCHE_A_OREILLE','MARCHE','DEVIS','SITE_WEB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Colonnes CRM. Adresse structurée (city/postal_code) en clair : permet le
--    tri, la recherche, et le rattachement automatique à une zone de livraison
--    via DeliveryZone.postalCodes.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "company_name" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "city"         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "postal_code"  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "rating"       SMALLINT,
  ADD COLUMN IF NOT EXISTS "requirements" TEXT,
  ADD COLUMN IF NOT EXISTS "source"       "ClientSource" NOT NULL DEFAULT 'APP';

-- 4) Garde-fous exprimés en base, non exprimables dans schema.prisma.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_rating_range";
ALTER TABLE "users" ADD CONSTRAINT "users_rating_range"
  CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));

-- Un mot de passe sans email est inutilisable : le login se fait par email.
-- On n'impose PAS l'inverse : "email connu, pas d'accès à l'app" est le cas
-- NOMINAL d'un client créé par l'admin.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_password_requires_email";
ALTER TABLE "users" ADD CONSTRAINT "users_password_requires_email"
  CHECK ("password_hash" IS NULL OR "email" IS NOT NULL);

-- 5) Index pour la liste commerciale et les agrégats par client.
CREATE INDEX IF NOT EXISTS "users_operator_role_deleted_idx"
  ON "users"("operator_id","role","deleted_at");
CREATE INDEX IF NOT EXISTS "users_company_name_idx" ON "users"("company_name");
CREATE INDEX IF NOT EXISTS "orders_user_deleted_idx" ON "orders"("user_id","deleted_at");
