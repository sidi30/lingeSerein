-- Migration: 20260728010000_operator_iban_bic
--
-- Coordonnées bancaires de l'opérateur, imprimées sur les factures (« Règlement
-- par virement bancaire — IBAN … »). Elles vivent sur `operators`, au même
-- endroit que le reste de l'identité de l'entreprise (SIRET, mentions légales)
-- déjà servi par GET/PATCH /settings/operator.
--
-- Migration SÉPARÉE de 20260728000000_invoice_from_quote, volontairement : ce
-- sont deux sujets distincts, et une migration séparée s'applique correctement
-- que la précédente ait déjà été déployée ou non.
--
-- Additive et réversible : deux colonnes nullable, aucune donnée touchée.
--
-- Stockage NORMALISÉ (sans espaces, en majuscules) — la normalisation est faite
-- à l'écriture par le schéma Zod de l'API. 34 = longueur maximale d'un IBAN
-- (ISO 13616) ; 11 = BIC long (8 caractères + code branche facultatif sur 3).
--
-- NB : contrairement à `phone`/`address`, ces colonnes ne sont PAS chiffrées en
-- application. Un IBAN de créancier est destiné à être imprimé sur chaque
-- facture envoyée au client — ce n'est pas un secret, et le chiffrer empêcherait
-- la lecture directe en base sans bénéfice réel.

SET lock_timeout = '5s';

ALTER TABLE "operators"
  ADD COLUMN IF NOT EXISTS "iban" VARCHAR(34),
  ADD COLUMN IF NOT EXISTS "bic"  VARCHAR(11);
