-- Migration: 20260730120000_quote_livraison_sur_devis
--
-- `quotes.livraison_sur_devis` — pendant de `orders.delivery_fee_sur_devis`.
--
-- Le devis émis depuis une commande recopiait `delivery_fee_cents` (0 € pour une
-- course hors zone ou une urgence Flash) SANS reporter le drapeau qui explique ce
-- zéro. Le modèle Quote n'avait aucun équivalent, si bien que le PDF déduisait le
-- libellé du seul montant : 0 € ⇒ « Livraison offerte », imprimé dans le tableau
-- des totaux du document que le CLIENT SIGNE. Autrement dit, une promesse de
-- gratuité sur une course qui n'a jamais eu de tarif public. La note libre du
-- devis le disait bien, mais elle vit hors des totaux : personne ne lit un bloc
-- de notes pour vérifier une ligne de prix.
--
-- La valeur redescend ensuite dans la facture (`invoices.metadata.livraisonLabel`,
-- figé à l'émission), d'où l'intérêt de la porter en base plutôt que de la
-- recalculer à chaque impression.
--
-- ADDITIF : colonne à DEFAULT, aucune réécriture des devis existants. Ils
-- gardent exactement le sens qu'ils avaient — livraison réellement offerte à 0 €.
-- Ceux émis depuis une commande hors zone AVANT cette migration restent donc
-- faux ; ils ne sont pas rattrapés ici, faute de savoir lesquels ont déjà été
-- envoyés au client (réécrire un devis signé serait pire que le laisser tel quel).
--
-- Rollback : la colonne se supprime sans perte de donnée métier antérieure.
-- Prisma n'a pas de down-migration — voir docs/runbook-migration.md.

SET lock_timeout = '5s';

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "livraison_sur_devis" BOOLEAN NOT NULL DEFAULT false;
