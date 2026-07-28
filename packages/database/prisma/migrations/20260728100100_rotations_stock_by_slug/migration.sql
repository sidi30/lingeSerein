-- Migration: 20260728100100_rotations_stock_by_slug
--
-- Objectif : suivre le CYCLE DE VIE du linge loué, qui n'était nulle part.
--
-- Le linge part chez le client et doit revenir. Jusqu'ici la chaîne s'arrêtait à
-- la livraison (devis → facture → bon de livraison → tournée) : rien ne disait
-- quand le linge devait être repris, ni ce qui était effectivement revenu.
-- Trois tables comblent ce trou :
--
--   * `rotations`      — un aller-retour : ce qui est sorti, quand, échéance de
--                        reprise, et l'état d'avancement ;
--   * `rotation_lines` — le détail des articles sortis / repris ;
--   * `stock_items`    — le parc de l'opérateur PAR SLUG catalogue.
--
-- L'échéance `date_reprise_prevue` = `date_livraison` + durée de détention :
-- 7 jours en location ponctuelle (seuil du renouvellement hebdomadaire
-- para-hôtelier — BOFiP, TVA meublés de tourisme, que les clients hôtes doivent
-- pouvoir prouver) et 14 jours sous Pack Sérénité (article 7 du contrat). La
-- règle vit dans @lingengo/shared/rotation (DETENTION_DAYS), jamais en base :
-- aucune valeur par défaut SQL ne la duplique ici.
--
-- TOUT EST ADDITIF. Aucune table existante n'est modifiée, aucune colonne
-- renommée, aucune donnée déplacée. En particulier, `stock_movements`,
-- `client_stocks` et `operator_stocks` — clés par ProductRange
-- (CONFORT/HOTEL/PRESTIGE), gammes héritées de la v1 qui ne décrivent plus le
-- catalogue vendu — restent EN PLACE et INTACTES. `stock_items` s'ajoute à
-- côté pour le stock par slug (kit-bain, kit-complet…) ; les deux cohabitent,
-- le mobile continue de lire les tables existantes sans changement.
--
-- Prérequis : 20260728100000_rotation_notification_types doit être appliquée
-- avant (valeurs d'enum NotificationType utilisées par les crons de rappel).
--
-- Rollback : réversible sans perte tant qu'aucune rotation n'a été créée
-- (DROP des trois tables puis des deux types). Prisma n'a pas de down-migration
-- — voir docs/runbook-migration.md.

SET lock_timeout = '5s';

-- ============================================================================
-- 1. Types énumérés
-- ============================================================================
-- Types NEUFS : leur création est transactionnelle sans restriction, contrairement
-- à l'ajout d'une valeur à un type existant (fait dans la migration précédente).
-- DO/EXCEPTION plutôt que IF NOT EXISTS : CREATE TYPE ne supporte pas IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "RotationFormule" AS ENUM ('PONCTUEL', 'ABONNEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RotationStatus" AS ENUM ('PLANIFIEE', 'LIVREE', 'REPRISE', 'EN_RETARD', 'ANNULEE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. Table `rotations`
-- ============================================================================
-- `user_id` nullable + snapshot client dénormalisé : même parti pris que `quotes`
-- et `invoices`. Le client d'un devis n'a très souvent aucun compte dans `users`
-- (rencontré sur un marché, au téléphone), et une tournée déjà effectuée ne doit
-- pas changer d'adresse parce que la fiche client a été corrigée depuis.
--
-- Les dates sont des DATE et non des TIMESTAMP : une reprise est prévue « le 12 »,
-- pas « le 12 à 09 h 03 ». Comparer des instants ferait passer un rappel du jour
-- pour un retard.

CREATE TABLE IF NOT EXISTS "rotations" (
    "id"                      UUID NOT NULL,
    "operator_id"             UUID NOT NULL,
    "user_id"                 UUID,
    "client_nom"              VARCHAR(200) NOT NULL,
    "client_email"            VARCHAR(320),
    "client_adresse"          TEXT,
    "quote_id"                UUID,
    "invoice_id"              UUID,
    "delivery_stop_id"        UUID,
    "formule"                 "RotationFormule" NOT NULL DEFAULT 'PONCTUEL',
    "status"                  "RotationStatus"  NOT NULL DEFAULT 'PLANIFIEE',
    "date_livraison"          DATE NOT NULL,
    "date_reprise_prevue"     DATE NOT NULL,
    "date_reprise_reelle"     DATE,
    "passage"                 INTEGER,
    "facturable_remplacement" BOOLEAN NOT NULL DEFAULT false,
    "notes"                   TEXT,
    "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMP(3) NOT NULL,
    "deleted_at"              TIMESTAMP(3),

    CONSTRAINT "rotations_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 3. Table `rotation_lines`
-- ============================================================================
-- `product_slug` est NULLABLE et SANS clé étrangère vers `products` : il vaut NULL
-- quand la désignation libre de la facture n'a pas pu être rapprochée du catalogue
-- (resolveProductSlug ne devine pas). La ligne reste valide pour le suivi de
-- reprise, elle ne bouge simplement pas le stock — mieux vaut un stock incomplet
-- qu'un stock faux. Pas de FK non plus parce qu'un slug peut désigner un produit
-- désactivé ou renommé sans invalider une rotation passée.
--
-- `qty_reprise` NULL = reprise pas encore saisie ; 0 = rien n'est revenu. La
-- distinction porte l'information : un 0 est un constat, un NULL une attente.

CREATE TABLE IF NOT EXISTS "rotation_lines" (
    "id"           UUID NOT NULL,
    "rotation_id"  UUID NOT NULL,
    "product_slug" VARCHAR(60),
    "designation"  VARCHAR(300) NOT NULL,
    "qty_livree"   INTEGER NOT NULL,
    "qty_reprise"  INTEGER,
    "position"     INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rotation_lines_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 4. Table `stock_items` — parc par slug catalogue
-- ============================================================================
-- Le disponible n'est PAS stocké : il vaut
--   total_owned − in_circulation − dirty_pending − retired,
-- calculé à la lecture. Une quantité dérivée qu'on persiste finit toujours par
-- mentir le jour où l'une des quatre autres bouge sans elle.

CREATE TABLE IF NOT EXISTS "stock_items" (
    "id"             UUID NOT NULL,
    "operator_id"    UUID NOT NULL,
    "product_slug"   VARCHAR(60) NOT NULL,
    "total_owned"    INTEGER NOT NULL DEFAULT 0,
    "in_circulation" INTEGER NOT NULL DEFAULT 0,
    "dirty_pending"  INTEGER NOT NULL DEFAULT 0,
    "retired"        INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 5. Index
-- ============================================================================
-- (operator_id, date_reprise_prevue) sert la vue calendrier de l'admin ET les
-- trois crons quotidiens, qui balaient tous une plage de dates pour un opérateur.

CREATE INDEX IF NOT EXISTS "rotations_operator_id_status_idx"
  ON "rotations"("operator_id", "status");
CREATE INDEX IF NOT EXISTS "rotations_operator_id_date_reprise_prevue_idx"
  ON "rotations"("operator_id", "date_reprise_prevue");
CREATE INDEX IF NOT EXISTS "rotations_date_reprise_prevue_idx"
  ON "rotations"("date_reprise_prevue");
CREATE INDEX IF NOT EXISTS "rotations_user_id_idx"          ON "rotations"("user_id");
CREATE INDEX IF NOT EXISTS "rotations_invoice_id_idx"       ON "rotations"("invoice_id");
CREATE INDEX IF NOT EXISTS "rotations_delivery_stop_id_idx" ON "rotations"("delivery_stop_id");

CREATE INDEX IF NOT EXISTS "rotation_lines_rotation_id_idx"  ON "rotation_lines"("rotation_id");
CREATE INDEX IF NOT EXISTS "rotation_lines_product_slug_idx" ON "rotation_lines"("product_slug");

CREATE INDEX IF NOT EXISTS "stock_items_operator_id_idx" ON "stock_items"("operator_id");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_operator_id_product_slug_key"
  ON "stock_items"("operator_id", "product_slug");

-- ============================================================================
-- 6. Clés étrangères
-- ============================================================================
-- ON DELETE SET NULL sur user / quote / invoice / delivery_stop : supprimer une
-- pièce en amont ne doit pas effacer la trace du linge encore dehors. Le snapshot
-- nominatif porté par la rotation suffit à savoir chez qui aller le reprendre.
-- CASCADE sur rotation_lines : les lignes n'ont aucun sens sans leur rotation.

DO $$ BEGIN
  ALTER TABLE "rotations"
    ADD CONSTRAINT "rotations_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rotations"
    ADD CONSTRAINT "rotations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rotations"
    ADD CONSTRAINT "rotations_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rotations"
    ADD CONSTRAINT "rotations_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rotations"
    ADD CONSTRAINT "rotations_delivery_stop_id_fkey"
    FOREIGN KEY ("delivery_stop_id") REFERENCES "delivery_stops"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rotation_lines"
    ADD CONSTRAINT "rotation_lines_rotation_id_fkey"
    FOREIGN KEY ("rotation_id") REFERENCES "rotations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_items"
    ADD CONSTRAINT "stock_items_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operators"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 7. Garde-fous d'intégrité
-- ============================================================================
-- Ces CHECK ne remplacent pas la validation applicative, ils empêchent qu'un
-- import ou une correction SQL à la main produise un stock négatif ou une
-- échéance antérieure à la livraison — des états dont aucun écran ne sait sortir.

DO $$ BEGIN
  ALTER TABLE "rotations"
    ADD CONSTRAINT "rotations_reprise_after_livraison"
    CHECK ("date_reprise_prevue" >= "date_livraison");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rotation_lines"
    ADD CONSTRAINT "rotation_lines_qty_positive"
    CHECK ("qty_livree" >= 0 AND ("qty_reprise" IS NULL OR "qty_reprise" >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_items"
    ADD CONSTRAINT "stock_items_quantities_positive"
    CHECK ("total_owned" >= 0 AND "in_circulation" >= 0
           AND "dirty_pending" >= 0 AND "retired" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
