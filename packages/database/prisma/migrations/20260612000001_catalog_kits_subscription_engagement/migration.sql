-- Migration: 20260612000001_catalog_kits_subscription_engagement
-- Phase 1 — Toutes les modifications sont ADDITIVES (ou relâchements de contrainte justifiés).
-- Aucune donnée supprimée. Aucune valeur d'enum retirée.
-- Rollback possible : les colonnes ajoutées sont nullable ou ont des defaults ;
-- le drop de contrainte et les DROP NOT NULL sont réversibles tant qu'aucun NULL n'existe.
-- ADR-V2-001 (slug + kind + nullable + drop unique) / ADR-V2-002 (SubscriptionConfig) /
-- ADR-V2-003 (plan nullable) / ADR-V2-006 (snapshots Subscription).

-- ============================================================================
-- 1. Nouveau enum ProductKind (KIT | ARTICLE)
-- ============================================================================

CREATE TYPE "ProductKind" AS ENUM ('KIT', 'ARTICLE');

-- ============================================================================
-- 2. Colonnes additives sur Product (ADR-V2-001)
-- ============================================================================

-- kind : NOT NULL avec DEFAULT 'ARTICLE' — backfill implicite des lignes existantes
ALTER TABLE "products"
  ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'ARTICLE';

-- slug : nullable pour ne pas invalider les lignes legacy (NULL ignoré par l'index unique)
ALTER TABLE "products"
  ADD COLUMN "slug" VARCHAR(60);

CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- ============================================================================
-- 3. Relâchement NOT NULL sur Product.category et Product.range (ADR-V2-001)
-- Les kits n'ont pas de category / range naturels.
-- Additif : relâche une contrainte, ne casse aucune donnée existante.
-- ============================================================================

ALTER TABLE "products" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "range"    DROP NOT NULL;

-- ============================================================================
-- 4. Suppression de la contrainte composite unique([operatorId, category, range]) (ADR-V2-001)
-- Seule opération non strictement additive de toute la V2, justifiée :
--   - La contrainte est incompatible avec 9 produits KITS (collisions inévitables).
--   - L'unicité métier est portée par Product.slug (index unique ci-dessus).
--   - Aucune donnée détruite — on retire une garantie d'unicité désormais inadaptée.
-- ============================================================================

-- L'unicité a été créée par CREATE UNIQUE INDEX (migration init), pas par une contrainte.
-- On retire d'abord une éventuelle contrainte homonyme (ceinture + bretelles) puis l'index.
ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_operator_id_category_range_key";

DROP INDEX IF EXISTS "products_operator_id_category_range_key";

-- Index simples category / range conservés (ils existent déjà depuis la migration init).
-- Si l'index n'existait pas encore, le créer ici :
CREATE INDEX IF NOT EXISTS "products_kind_idx" ON "products"("kind");

-- ============================================================================
-- 5. Table SubscriptionConfig (ADR-V2-002)
-- 1 ligne par opérateur — paramètres du Pack Sérénité.
-- ============================================================================

CREATE TABLE "subscription_configs" (
    "id"                     UUID        NOT NULL DEFAULT gen_random_uuid(),
    "operator_id"            UUID        NOT NULL,
    "plan_name"              VARCHAR(100) NOT NULL DEFAULT 'Pack Sérénité',
    "price_cents"            INTEGER     NOT NULL DEFAULT 8900,
    "kit_bain_qty"           INTEGER     NOT NULL DEFAULT 8,
    "kit_lit_qty"            INTEGER     NOT NULL DEFAULT 4,
    "min_engagement_months"  INTEGER     NOT NULL DEFAULT 3,
    "notice_period_days"     INTEGER     NOT NULL DEFAULT 30,
    "is_active"              BOOLEAN     NOT NULL DEFAULT true,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_configs_operator_id_key"
  ON "subscription_configs"("operator_id");

ALTER TABLE "subscription_configs"
  ADD CONSTRAINT "subscription_configs_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 6. Modifications sur Subscription (ADR-V2-003 + ADR-V2-006)
-- ============================================================================

-- plan rendu nullable : les nouvelles souscriptions Pack Sérénité ont plan=null.
-- Le client réel (PRESTIGE) garde sa valeur.
ALTER TABLE "subscriptions" ALTER COLUMN "plan" DROP NOT NULL;

-- Champs snapshot immuables — tous nullable ou avec default (rollback-safe)
ALTER TABLE "subscriptions"
  ADD COLUMN "price_cents"           INTEGER;          -- snapshot prix mensuel (null = legacy non migré)

ALTER TABLE "subscriptions"
  ADD COLUMN "min_engagement_months" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "subscriptions"
  ADD COLUMN "committed_until"       TIMESTAMP(3);     -- startDate + minEngagementMonths (calendaire)

ALTER TABLE "subscriptions"
  ADD COLUMN "kit_bain_qty"          INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "subscriptions"
  ADD COLUMN "kit_lit_qty"           INTEGER NOT NULL DEFAULT 4;
