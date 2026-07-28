-- Migration: 20260728000000_invoice_from_quote
--
-- Objectif : rendre la table `invoices` utilisable pour facturer un DEVIS B2B,
-- alors qu'elle n'était taillée que pour la facturation d'abonnement mobile.
--
-- Deux origines cohabitent désormais sur la même table et la MÊME séquence de
-- numérotation (exigence légale : une seule suite chronologique par exercice) :
--   - abonnement (worker mensuel) : user_id + period_start/period_end ;
--   - devis B2B (admin)           : quote_id + snapshot client dénormalisé.
-- Le client d'un devis n'a très souvent aucun compte dans `users` (rencontré sur
-- un marché, au téléphone) : d'où user_id nullable + snapshot client, exactement
-- le même parti pris que la table `quotes`.
--
-- TOUTES LES MODIFICATIONS SONT ADDITIVES OU DES RELÂCHEMENTS DE CONTRAINTE.
-- Aucune donnée supprimée, aucune colonne renommée, aucune valeur d'enum retirée.
-- Les factures d'abonnement existantes restent valides telles quelles : elles
-- portent toujours user_id + period_start/period_end, désormais simplement non
-- obligatoires au niveau du schéma.
--
-- Rollback : réversible tant qu'aucune facture issue d'un devis n'a été émise
-- (il faudrait sinon inventer un user_id et une période pour ces lignes).
-- Prisma n'a pas de down-migration — voir docs/runbook-migration.md.

SET lock_timeout = '5s';

-- ============================================================================
-- 1. Le compte client devient optionnel
-- ============================================================================
-- Une facture issue d'un devis vise un client hors table `users`. La contrainte
-- de clé étrangère reste ON DELETE RESTRICT (inchangée) : une facture émise ne
-- doit jamais perdre son rattachement client par effet de bord d'une suppression.

ALTER TABLE "invoices" ALTER COLUMN "user_id" DROP NOT NULL;

-- ============================================================================
-- 2. Devis source
-- ============================================================================

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "quote_id" UUID;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "invoices_quote_id_idx" ON "invoices"("quote_id");

-- ============================================================================
-- 3. Snapshot client dénormalisé
-- ============================================================================
-- Figé à l'émission, comme sur `quotes` : modifier la fiche client plus tard ne
-- doit pas réécrire rétroactivement une facture déjà envoyée.

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "client_nom"     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "client_email"   VARCHAR(320),
  ADD COLUMN IF NOT EXISTS "client_adresse" TEXT;

-- ============================================================================
-- 4. Période de facturation optionnelle
-- ============================================================================
-- Une facture de devis ponctuel ne couvre aucune période d'abonnement.

ALTER TABLE "invoices" ALTER COLUMN "period_start" DROP NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "period_end"   DROP NOT NULL;

-- ============================================================================
-- 5. Soft-delete
-- ============================================================================
-- Aligné sur `quotes`. Réservé aux BROUILLONS côté applicatif : à partir de SENT,
-- une facture ne peut plus être supprimée (obligation de conservation), seulement
-- annulée via le statut CANCELLED.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
