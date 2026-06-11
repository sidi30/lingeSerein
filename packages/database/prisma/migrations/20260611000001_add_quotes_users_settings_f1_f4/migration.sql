-- Migration: add_quotes_users_settings_f1_f4
-- Toutes les modifications sont ADDITIVES (nullable / default) — aucune colonne existante supprimée.

-- ============================================================================
-- Nouveaux enums
-- ============================================================================

CREATE TYPE "OrderSource" AS ENUM ('MOBILE', 'QUOTE_CONVERSION', 'MANUAL');
CREATE TYPE "QuoteStatus" AS ENUM ('BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE');

-- ============================================================================
-- Colonnes additives sur tables existantes
-- ============================================================================

-- Order.source (default MOBILE pour les lignes existantes)
ALTER TABLE "orders" ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'MOBILE';

-- DeliveryZone.deliveryFeeCents
ALTER TABLE "delivery_zones" ADD COLUMN "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0;

-- Operator.siret + legalMentions
ALTER TABLE "operators" ADD COLUMN "siret" VARCHAR(14);
ALTER TABLE "operators" ADD COLUMN "legal_mentions" TEXT;

-- Product.stockAlertThreshold
ALTER TABLE "products" ADD COLUMN "stock_alert_threshold" INTEGER NOT NULL DEFAULT 3;

-- ============================================================================
-- Nouveaux modèles Quote + QuoteLine
-- ============================================================================

CREATE TABLE "quotes" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero"                VARCHAR(20) NOT NULL,
    "operator_id"           UUID NOT NULL,
    "status"                "QuoteStatus" NOT NULL DEFAULT 'BROUILLON',
    "client_nom"            VARCHAR(200) NOT NULL,
    "client_email"          VARCHAR(320),
    "client_tel"            VARCHAR(20),
    "client_adresse"        TEXT,
    "user_id"               UUID,
    "remise_pct"            INTEGER NOT NULL DEFAULT 0,
    "livraison_cents"       INTEGER NOT NULL DEFAULT 0,
    "tva_applicable"        BOOLEAN NOT NULL DEFAULT false,
    "notes"                 TEXT,
    "validite_jours"        INTEGER NOT NULL DEFAULT 30,
    "date_envoi"            TIMESTAMP(3),
    "date_reponse"          TIMESTAMP(3),
    "converted_to_order_id" UUID,
    "created_by"            UUID NOT NULL,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,
    "deleted_at"            TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_lines" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id"    UUID NOT NULL,
    "designation" VARCHAR(300) NOT NULL,
    "qty"         INTEGER NOT NULL,
    "unit_cents"  INTEGER NOT NULL,
    "position"    INTEGER NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Contraintes d'unicité
-- ============================================================================

CREATE UNIQUE INDEX "quotes_numero_key" ON "quotes"("numero");
CREATE UNIQUE INDEX "quotes_converted_to_order_id_key" ON "quotes"("converted_to_order_id");

-- ============================================================================
-- Index
-- ============================================================================

CREATE INDEX "quotes_operator_id_idx" ON "quotes"("operator_id");
CREATE INDEX "quotes_status_idx" ON "quotes"("status");
CREATE INDEX "quotes_user_id_idx" ON "quotes"("user_id");
CREATE INDEX "quotes_numero_idx" ON "quotes"("numero");
CREATE INDEX "quotes_created_at_idx" ON "quotes"("created_at");
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");
CREATE INDEX "orders_source_idx" ON "orders"("source");

-- ============================================================================
-- Clés étrangères
-- ============================================================================

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_to_order_id_fkey"
    FOREIGN KEY ("converted_to_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
