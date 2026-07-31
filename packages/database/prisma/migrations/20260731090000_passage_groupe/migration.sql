-- Passage groupé : « nous passons déjà dans votre commune ».
--
-- Écrite à la main plutôt que générée : un `migrate diff` sur cette base
-- rapportait aussi de la dérive sans rapport (index et DEFAULT hérités d'anciens
-- correctifs appliqués à chaud). Une migration ne doit contenir QUE l'intention
-- du jour, sinon elle emporte en production des changements que personne n'a
-- décidés.

-- Réponse possible du client. LIVRAISON_ET_REPRISE existe parce que c'est le cas
-- le plus fréquent d'une rotation : reprendre le sale ET reposer du propre.
CREATE TYPE "PassageResponseKind" AS ENUM ('LIVRAISON', 'REPRISE', 'LIVRAISON_ET_REPRISE', 'AUCUN');

-- Canal de la réponse. Le téléphone reste le canal réel de beaucoup d'hôteliers :
-- l'admin saisit à leur place, et la trace du canal est conservée.
CREATE TYPE "PassageResponseSource" AS ENUM ('MOBILE', 'TELEPHONE', 'ADMIN');

-- Sollicitation COMMERCIALE, distincte des rappels de rotation : elle doit
-- pouvoir être désactivée séparément par le client.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PASSAGE_OPPORTUNITY';

CREATE TABLE "passage_opportunities" (
    "id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "commune_insee" VARCHAR(5) NOT NULL,
    "commune_nom" VARCHAR(120) NOT NULL,
    "date" DATE NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passage_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "passage_responses" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "PassageResponseKind" NOT NULL,
    "source" "PassageResponseSource" NOT NULL DEFAULT 'MOBILE',
    "message" TEXT,
    "order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passage_responses_pkey" PRIMARY KEY ("id")
);

-- Idempotence du cron : une seule proposition par (tournée, commune), même si le
-- cron est rejoué à la main ou retenté par BullMQ.
CREATE UNIQUE INDEX "passage_opportunities_round_id_commune_insee_key" ON "passage_opportunities"("round_id", "commune_insee");
CREATE INDEX "passage_opportunities_date_idx" ON "passage_opportunities"("date");
CREATE INDEX "passage_opportunities_commune_insee_date_idx" ON "passage_opportunities"("commune_insee", "date");

-- Un client, une réponse par créneau : répondre à nouveau CORRIGE la réponse au
-- lieu d'en empiler une seconde, qui laisserait le livreur arbitrer entre deux
-- intentions contradictoires.
CREATE UNIQUE INDEX "passage_responses_opportunity_id_user_id_key" ON "passage_responses"("opportunity_id", "user_id");
CREATE INDEX "passage_responses_user_id_idx" ON "passage_responses"("user_id");

ALTER TABLE "passage_opportunities" ADD CONSTRAINT "passage_opportunities_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- La proposition n'a aucun sens sans sa tournée : supprimer la tournée emporte
-- les propositions qu'elle avait ouvertes.
ALTER TABLE "passage_opportunities" ADD CONSTRAINT "passage_opportunities_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "delivery_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "passage_responses" ADD CONSTRAINT "passage_responses_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "passage_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "passage_responses" ADD CONSTRAINT "passage_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
