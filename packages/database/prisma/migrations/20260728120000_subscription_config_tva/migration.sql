-- Facturation récurrente : TVA appliquée ou non, par opérateur.
--
-- Le worker de facturation d'abonnement appliquait 20 % en dur. L'opérateur
-- relève de la franchise en base (art. 293 B du CGI) — ses devis sont émis
-- sans TVA par défaut — et lui faire collecter une TVA qu'il n'est pas
-- autorisé à percevoir est une faute autrement plus lourde que l'inverse.
-- Défaut `false` : le comportement des lignes existantes est donc celui des
-- devis, et bascule d'un clic depuis Réglages le jour de l'assujettissement.
ALTER TABLE "subscription_configs"
  ADD COLUMN "tva_applicable" BOOLEAN NOT NULL DEFAULT false;
