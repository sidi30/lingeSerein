-- Migration: 20260730090000_order_delivery_fee_quote_from_order
--
-- Deux ajouts, tous deux ADDITIFS (colonnes nullables ou à DEFAULT) :
--
--  1. `orders.delivery_fee_cents` — les frais de livraison n'étaient nulle part.
--     `total_cents` reste le SOUS-TOTAL DES ARTICLES : plusieurs écrans (mobile,
--     admin, facturation) le lisent comme tel, en changer la sémantique aurait
--     réécrit rétroactivement le montant de toutes les commandes passées.
--     Le total à payer vaut donc total_cents + delivery_fee_cents.
--     `delivery_fee_sur_devis` distingue « livraison offerte » (0 € réellement dû)
--     de « livraison à chiffrer » (hors zone, urgence Flash) : sans lui, les deux
--     situations valent 0 en base et deviennent indiscernables après coup.
--
--  2. `quotes.from_order_id` — devis émis à partir d'une commande.
--     UNIQUE : l'idempotence de POST /quotes/from-order/:orderId est portée par la
--     BASE, pas seulement par un test applicatif que deux requêtes concurrentes
--     (double-clic) contourneraient. Colonne distincte de `converted_to_order_id`,
--     qui décrit le sens inverse (devis → commande) et alimente l'affichage
--     « commande issue du devis … ».
--
-- Rollback : les deux colonnes se suppriment sans perte de donnée métier
-- antérieure (elles n'existaient pas). Prisma n'a pas de down-migration —
-- voir docs/runbook-migration.md.

SET lock_timeout = '5s';

-- ============================================================================
-- 1. Frais de livraison de la commande
-- ============================================================================
-- DEFAULT 0 : les commandes existantes restent exactement ce qu'elles étaient,
-- livraison non facturée. Aucune refacturation rétroactive.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "delivery_fee_sur_devis" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 2. Devis émis depuis une commande
-- ============================================================================

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "from_order_id" UUID;

-- L'unicité est la garantie d'idempotence : une seconde insertion pour la même
-- commande échoue en P2002, que le service rattrape en renvoyant le devis existant.
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_from_order_id_key" ON "quotes"("from_order_id");

-- ON DELETE SET NULL : un devis est une pièce commerciale, il doit survivre à la
-- suppression de la commande d'origine plutôt que de la bloquer (RESTRICT) ou de
-- disparaître avec elle (CASCADE).
DO $$ BEGIN
  ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_from_order_id_fkey"
    FOREIGN KEY ("from_order_id") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
