-- Migration: 20260728110000_signature_device_tokens_schedule
--
-- Quatre ajouts, tous additifs, issus des besoins des lots mobile et notifications :
--
--   1. Preuve de remise signée sur `delivery_stops` (la signature capturée sur
--      mobile était acceptée par l'API puis silencieusement jetée) ;
--   2. `device_tokens` — sans cette table aucun push ne peut partir, faute
--      d'adresse où écrire ;
--   3. horodatage des EMAILS de rappel sur `rotations`, pour ne pas relancer
--      deux fois un client ;
--   4. clé étrangère sur `delivery_schedules`, table seedée depuis l'origine mais
--      jamais jointe à quoi que ce soit.
--
-- Aucune colonne existante n'est modifiée ni supprimée. Aucune donnée réécrite.
--
-- Rollback : DROP des colonnes et de la table ajoutées. Réversible sans perte,
-- hors signatures déjà capturées. Voir docs/runbook-migration.md.

SET lock_timeout = '5s';

-- ============================================================================
-- 1. Preuve de remise signée
-- ============================================================================
-- `signature_data` est en TEXT et NON en VARCHAR(500) : une signature manuscrite
-- exportée en data-URL SVG pèse ~6,4 Ko. La colonne `signature_url` existante
-- (VARCHAR(500), validée comme URL) ne peut pas la recevoir — elle reste en place
-- pour son usage d'origine (image hébergée), elle n'est ni migrée ni supprimée.
--
-- `conforme` est NULLABLE à dessein : null = arrêt antérieur à la capture de
-- signature (information absente), false = le client a explicitement refusé de
-- déclarer la livraison conforme. Un DEFAULT false effacerait cette distinction,
-- qui est précisément celle qui compte en cas de litige.

ALTER TABLE "delivery_stops"
  ADD COLUMN IF NOT EXISTS "signature_data" TEXT,
  ADD COLUMN IF NOT EXISTS "signataire_nom" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "conforme"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "reserves"       TEXT;

-- ============================================================================
-- 2. Jetons de notification push
-- ============================================================================
-- `token` est unique GLOBALEMENT, pas par utilisateur : réinstaller l'application
-- sur un téléphone revendu réattribue le même jeton Expo à une autre personne.
-- L'unicité permet à l'upsert de transférer la propriété au dernier inscrit ;
-- sans elle, l'ancien propriétaire continuerait de recevoir les notifications du
-- nouveau.

CREATE TABLE IF NOT EXISTS "device_tokens" (
    "id"           UUID NOT NULL,
    "user_id"      UUID NOT NULL,
    "token"        VARCHAR(255) NOT NULL,
    "platform"     VARCHAR(20) NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX IF NOT EXISTS "device_tokens_user_id_idx" ON "device_tokens"("user_id");

DO $$ BEGIN
  ALTER TABLE "device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. Idempotence des emails de rappel
-- ============================================================================
-- Ces deux horodatages ne sont posés QUE sur un HTTP 200 du mailer. Ils sont
-- volontairement distincts de la notification in-app : si le mailer est
-- indisponible, la notification part quand même et la colonne reste NULL, ce qui
-- autorise une nouvelle tentative au prochain passage du cron. Les marquer à
-- l'émission ferait taire définitivement un rappel qui n'est jamais parti.

ALTER TABLE "rotations"
  ADD COLUMN IF NOT EXISTS "reminder_sent_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overdue_notified_at" TIMESTAMP(3);

-- ============================================================================
-- 4. Raccordement des jours de tournée
-- ============================================================================
-- `delivery_schedules` est seedée depuis l'origine (lundi+jeudi zone 1,
-- mardi+vendredi zone 2) mais n'a jamais été lue : sans relation déclarée, aucune
-- requête ne pouvait joindre une zone à ses jours de tournée. La clé étrangère
-- rend la table exploitable pour le calendrier des passages.
--
-- Pré-requis : toute ligne existante doit référencer une zone valide. C'est le cas
-- des données seedées. Si un environnement portait des lignes orphelines, l'ajout
-- de la contrainte échouerait — les identifier avant avec :
--   SELECT s.id FROM delivery_schedules s
--   LEFT JOIN delivery_zones z ON z.id = s.zone_id WHERE z.id IS NULL;

CREATE INDEX IF NOT EXISTS "delivery_schedules_zone_id_idx" ON "delivery_schedules"("zone_id");

DO $$ BEGIN
  ALTER TABLE "delivery_schedules"
    ADD CONSTRAINT "delivery_schedules_zone_id_fkey"
    FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
