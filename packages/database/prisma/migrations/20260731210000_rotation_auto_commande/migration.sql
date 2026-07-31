-- Rotation automatique depuis la commande.
--
-- Jusqu'ici une rotation ne naissait QUE d'un geste manuel (bouton « Créer une
-- rotation », ou depuis une facture). Conséquence observée en production : trois
-- commandes portant chacune une date de livraison, et un calendrier vide —
-- aucune date de reprise nulle part, donc aucun rappel J-1, donc du linge qui
-- part sans que rien ne dise quand il revient.
--
-- Écrite à la main comme les précédentes : `migrate diff` sur cette base
-- rapporte de la dérive héritée de correctifs appliqués à chaud, et une
-- migration ne doit contenir que l'intention du jour.

-- Commande d'origine. UNIQUE : c'est la base qui garantit « une seule rotation
-- par commande ». Deux crons concurrents, un rejeu de job BullMQ ou un double
-- changement de statut ne peuvent donc pas sortir deux fois le même linge.
ALTER TABLE "rotations" ADD COLUMN IF NOT EXISTS "order_id" UUID;

-- Instant du mouvement de stock RÉEL (sortie de `in_circulation`).
--
-- Une rotation créée d'avance depuis une commande est PLANIFIEE : le linge n'est
-- pas encore sorti, le parc ne doit pas bouger. Il sort à la livraison. Cette
-- colonne est la garde d'idempotence de ce mouvement — sans elle, une bascule
-- LIVREE rejouée décrémenterait le parc autant de fois qu'elle est appelée.
--
-- Rétro-remplissage : toutes les rotations existantes ont été créées par les
-- deux chemins manuels, qui décrémentaient le stock DÈS la création. Les laisser
-- à NULL ferait croire que leur linge est encore en réserve et provoquerait une
-- seconde sortie au premier passage à LIVREE.
ALTER TABLE "rotations" ADD COLUMN IF NOT EXISTS "sortie_stock_at" TIMESTAMP(3);
UPDATE "rotations" SET "sortie_stock_at" = "created_at" WHERE "sortie_stock_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "rotations_order_id_key" ON "rotations" ("order_id");

-- SetNull : le linge dehors doit survivre à la disparition de la commande qui
-- l'a fait sortir, sinon plus rien ne dit ce qu'il faut aller reprendre.
-- Bloc conditionnel : `ADD CONSTRAINT` n'a pas d'`IF NOT EXISTS`, et cette
-- migration doit rester rejouable à la main sur un environnement déjà à moitié
-- rattrapé (c'est arrivé sur ce projet).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rotations_order_id_fkey'
  ) THEN
    ALTER TABLE "rotations"
      ADD CONSTRAINT "rotations_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Le calendrier interroge désormais aussi la date de LIVRAISON (une livraison à
-- venir doit s'afficher avant que sa reprise n'entre dans la fenêtre demandée).
CREATE INDEX IF NOT EXISTS "rotations_operator_id_date_livraison_idx"
  ON "rotations" ("operator_id", "date_livraison");
