/**
 * Passage groupé — la seule remise de livraison de l'entreprise.
 *
 * Ce qui est verrouillé ici tient en une phrase : la remise ne peut PAS exister
 * sans un passage réellement planifié, dans la bonne commune, à la bonne date,
 * et sans un client qui a dit oui. Chacune de ces quatre conditions a sa raison
 * d'être — les relâcher transformerait une offre ponctuelle en tarif permanent
 * que personne n'a décidé.
 *
 * Faux Prisma en mémoire : ni base, ni Redis, ni réseau.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PassagesService } from "./passages.service.ts";

const OPERATOR_ID = "op-1";
const ROUND_ID = "round-1";
const AVIGNON = "84007";
const ORANGE = "84087";

/** 2026-08-04, minuit UTC — le jour du passage dans les scénarios. */
const DEMAIN = new Date("2026-08-04T00:00:00.000Z");
/** La veille à 18 h 05, heure du cron. */
const VEILLE_18H = new Date("2026-08-03T16:05:00.000Z");

interface FakeOptions {
  rounds?: {
    id: string;
    date: Date;
    status: string;
    operatorId: string;
    stops: { clientId: string; client: { communeInsee: string | null } }[];
  }[];
  users?: Record<string, { communeInsee: string | null; postalCode?: string | null }>;
  clientsParCommune?: Record<
    string,
    { id: string; name: string; communeInsee: string; postalCode: string | null }[]
  >;
  notificationsRecentes?: { userId: string }[];
  responses?: { opportunityId: string; userId: string; kind: string }[];
  opportunities?: { id: string; communeInsee: string; date: Date; expiresAt: Date }[];
}

function fakePrisma(options: FakeOptions = {}) {
  const notifications: { userId: string; type: string; title: string; body: string }[] = [];
  const opportunities = [...(options.opportunities ?? [])].map((o) => ({
    ...o,
    operatorId: OPERATOR_ID,
    roundId: ROUND_ID,
    communeNom: o.communeInsee === AVIGNON ? "Avignon" : "Orange",
    responses: [] as { userId: string; kind: string; message: string | null }[],
  }));
  const responses = [...(options.responses ?? [])];

  const client = {
    deliveryRound: {
      findMany: async ({ where }: { where: { date: Date; status: { in: string[] } } }) =>
        (options.rounds ?? []).filter(
          (r) => r.date.getTime() === where.date.getTime() && where.status.in.includes(r.status),
        ),
    },
    passageOpportunity: {
      upsert: async ({ where, create }: { where: unknown; create: Record<string, unknown> }) => {
        const cle = where as { roundId_communeInsee: { roundId: string; communeInsee: string } };
        const existante = opportunities.find(
          (o) =>
            o.roundId === cle.roundId_communeInsee.roundId &&
            o.communeInsee === cle.roundId_communeInsee.communeInsee,
        );
        if (existante) return existante;
        const creee = {
          id: `opp-${opportunities.length + 1}`,
          ...(create as Record<string, unknown>),
          responses: [],
        } as unknown as (typeof opportunities)[number];
        opportunities.push(creee);
        return creee;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        opportunities.filter((o) => {
          const insee = where["communeInsee"] as string | undefined;
          const expires = where["expiresAt"] as { gt: Date } | undefined;
          if (insee && o.communeInsee !== insee) return false;
          if (expires && o.expiresAt <= expires.gt) return false;
          return true;
        }),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const insee = where["communeInsee"] as string;
        const date = where["date"] as Date;
        const expires = where["expiresAt"] as { gt: Date };
        const besoin = where["responses"] as
          | { some: { userId: string; kind: { in: string[] } } }
          | undefined;

        const trouvee = opportunities.find((o) => {
          if (o.communeInsee !== insee) return false;
          if (o.date.getTime() !== date.getTime()) return false;
          if (o.expiresAt <= expires.gt) return false;
          if (besoin) {
            return responses.some(
              (r) =>
                r.opportunityId === o.id &&
                r.userId === besoin.some.userId &&
                besoin.some.kind.in.includes(r.kind),
            );
          }
          return true;
        });
        return trouvee ? { id: trouvee.id } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        opportunities.find((o) => o.id === where.id) ?? null,
    },
    passageResponse: {
      upsert: async ({ where, create }: { where: unknown; create: Record<string, unknown> }) => {
        const cle = where as { opportunityId_userId: { opportunityId: string; userId: string } };
        const existante = responses.find(
          (r) =>
            r.opportunityId === cle.opportunityId_userId.opportunityId &&
            r.userId === cle.opportunityId_userId.userId,
        );
        if (existante) {
          existante.kind = (create as { kind: string }).kind;
          return existante;
        }
        const creee = { ...(create as { opportunityId: string; userId: string; kind: string }) };
        responses.push(creee);
        return creee;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => options.users?.[where.id] ?? null,
      findMany: async ({ where }: { where: { communeInsee: string } }) =>
        options.clientsParCommune?.[where.communeInsee] ?? [],
    },
    notification: {
      findMany: async () => options.notificationsRecentes ?? [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push({
          userId: data["userId"] as string,
          type: data["type"] as string,
          title: data["title"] as string,
          body: data["body"] as string,
        });
        return { id: `notif-${notifications.length}`, ...data };
      },
    },
    notificationSetting: {
      findUnique: async () => null,
    },
    deviceToken: {
      findMany: async () => [],
    },
  };

  return { client, notifications, opportunities, responses };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrisma = (fake: ReturnType<typeof fakePrisma>) => fake.client as any;

function roundAvignon() {
  return {
    id: ROUND_ID,
    date: DEMAIN,
    status: "PLANNED",
    operatorId: OPERATOR_ID,
    stops: [{ clientId: "client-servi", client: { communeInsee: AVIGNON } }],
  };
}

describe("PassagesService.ouvrirPourLendemain", () => {
  it("ouvre une proposition par commune desservie et prévient les autres clients", async () => {
    const fake = fakePrisma({
      rounds: [roundAvignon()],
      clientsParCommune: {
        [AVIGNON]: [
          { id: "client-2", name: "Hôtel du Palais", communeInsee: AVIGNON, postalCode: "84000" },
        ],
      },
    });

    const bilan = await new PassagesService(asPrisma(fake)).ouvrirPourLendemain(VEILLE_18H);

    assert.equal(bilan.opportunites, 1);
    assert.equal(bilan.notifies, 1);
    assert.equal(fake.notifications.length, 1);
    assert.equal(fake.notifications[0]?.userId, "client-2");
    assert.match(fake.notifications[0]?.title ?? "", /Avignon/);
    // Le message chiffre l'offre : 7,50 € au lieu de 15 € à Avignon, reprise gratuite.
    assert.match(fake.notifications[0]?.body ?? "", /7,50 €/);
    assert.match(fake.notifications[0]?.body ?? "", /15,00 €/);
    assert.match(fake.notifications[0]?.body ?? "", /gratuite/i);
  });

  it("NE sollicite PAS le client que la tournée sert déjà", async () => {
    // Il a son créneau : lui proposer de « profiter du passage » serait absurde.
    const fake = fakePrisma({
      rounds: [roundAvignon()],
      clientsParCommune: {
        [AVIGNON]: [
          { id: "client-servi", name: "Déjà prévu", communeInsee: AVIGNON, postalCode: "84000" },
        ],
      },
    });

    const bilan = await new PassagesService(asPrisma(fake)).ouvrirPourLendemain(VEILLE_18H);
    assert.equal(bilan.notifies, 0);
    assert.equal(fake.notifications.length, 0);
  });

  it("respecte le plafond d'une sollicitation par semaine", async () => {
    // Trois tournées dans la semaine ne font pas trois messages : au-delà, ce
    // n'est plus une offre, c'est du harcèlement — et le client coupe tout.
    const fake = fakePrisma({
      rounds: [roundAvignon()],
      clientsParCommune: {
        [AVIGNON]: [
          { id: "client-2", name: "Hôtel du Palais", communeInsee: AVIGNON, postalCode: "84000" },
        ],
      },
      notificationsRecentes: [{ userId: "client-2" }],
    });

    const bilan = await new PassagesService(asPrisma(fake)).ouvrirPourLendemain(VEILLE_18H);
    assert.equal(bilan.notifies, 0);
  });

  it("ignore un arrêt dont le client n'a pas de commune confirmée", async () => {
    // Deviner la commune reviendrait à promettre un passage là où personne n'a
    // prévu d'aller.
    const fake = fakePrisma({
      rounds: [
        {
          ...roundAvignon(),
          stops: [{ clientId: "client-servi", client: { communeInsee: null } }],
        },
      ],
      clientsParCommune: { [AVIGNON]: [] },
    });

    const bilan = await new PassagesService(asPrisma(fake)).ouvrirPourLendemain(VEILLE_18H);
    assert.equal(bilan.opportunites, 0);
    assert.equal(bilan.notifies, 0);
  });

  it("reste idempotent : rejouer le cron ne réouvre pas la commune", async () => {
    const fake = fakePrisma({
      rounds: [roundAvignon()],
      clientsParCommune: { [AVIGNON]: [] },
    });
    const service = new PassagesService(asPrisma(fake));

    await service.ouvrirPourLendemain(VEILLE_18H);
    await service.ouvrirPourLendemain(VEILLE_18H);

    assert.equal(fake.opportunities.length, 1);
  });
});

describe("PassagesService.repondre", () => {
  const opportunite = {
    id: "opp-1",
    communeInsee: AVIGNON,
    date: DEMAIN,
    expiresAt: new Date("2026-08-04T08:00:00.000Z"),
  };

  it("enregistre la réponse d'un client de la commune", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
    });

    await new PassagesService(asPrisma(fake)).repondre(
      "opp-1",
      "client-2",
      { kind: "LIVRAISON_ET_REPRISE" },
      VEILLE_18H,
    );

    assert.equal(fake.responses.length, 1);
    assert.equal(fake.responses[0]?.kind, "LIVRAISON_ET_REPRISE");
  });

  it("CORRIGE la réponse au lieu d'en empiler une seconde", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
    });
    const service = new PassagesService(asPrisma(fake));

    await service.repondre("opp-1", "client-2", { kind: "LIVRAISON" }, VEILLE_18H);
    await service.repondre("opp-1", "client-2", { kind: "AUCUN" }, VEILLE_18H);

    // Une seule intention par client : le livreur n'a pas à arbitrer.
    assert.equal(fake.responses.length, 1);
    assert.equal(fake.responses[0]?.kind, "AUCUN");
  });

  it("refuse une réponse d'une AUTRE commune", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-orange": { communeInsee: ORANGE } },
    });

    await assert.rejects(
      () =>
        new PassagesService(asPrisma(fake)).repondre(
          "opp-1",
          "client-orange",
          { kind: "LIVRAISON" },
          VEILLE_18H,
        ),
      /commune/i,
    );
  });

  it("refuse une réponse après le départ du camion", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
    });

    await assert.rejects(
      () =>
        new PassagesService(asPrisma(fake)).repondre(
          "opp-1",
          "client-2",
          { kind: "LIVRAISON" },
          new Date("2026-08-04T10:00:00.000Z"),
        ),
      /plus valable/i,
    );
  });

  it("accepte une réponse prise par TÉLÉPHONE, saisie par l'admin", async () => {
    // Beaucoup d'hôteliers appellent : refuser leur réponse parce qu'elle n'est
    // pas passée par l'application ferait perdre l'essentiel du bénéfice.
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: null } },
    });

    await new PassagesService(asPrisma(fake)).repondre(
      "opp-1",
      "client-2",
      { kind: "REPRISE", source: "TELEPHONE" },
      VEILLE_18H,
    );

    assert.equal(fake.responses.length, 1);
  });
});

describe("PassagesService.remiseApplicable", () => {
  const opportunite = {
    id: "opp-1",
    communeInsee: AVIGNON,
    date: DEMAIN,
    expiresAt: new Date("2026-08-04T08:00:00.000Z"),
  };

  it("accorde la remise au client qui a demandé du linge pour ce jour-là", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
      responses: [{ opportunityId: "opp-1", userId: "client-2", kind: "LIVRAISON" }],
    });

    const r = await new PassagesService(asPrisma(fake)).remiseApplicable(
      "client-2",
      DEMAIN,
      VEILLE_18H,
    );
    assert.equal(r.applicable, true);
  });

  it("REFUSE la remise sans réponse du client", async () => {
    // Sinon toute commande passée un jour de tournée serait remisée à l'insu de
    // l'exploitant, y compris pour un client qui n'a jamais vu la proposition.
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
      responses: [],
    });

    const r = await new PassagesService(asPrisma(fake)).remiseApplicable(
      "client-2",
      DEMAIN,
      VEILLE_18H,
    );
    assert.equal(r.applicable, false);
  });

  it("REFUSE la remise quand le client a seulement voulu rendre son linge", async () => {
    // La reprise est gratuite ; elle n'ouvre aucun droit sur une livraison.
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
      responses: [{ opportunityId: "opp-1", userId: "client-2", kind: "REPRISE" }],
    });

    const r = await new PassagesService(asPrisma(fake)).remiseApplicable(
      "client-2",
      DEMAIN,
      VEILLE_18H,
    );
    assert.equal(r.applicable, false);
  });

  it("REFUSE la remise pour une AUTRE date que celle du passage", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: AVIGNON } },
      responses: [{ opportunityId: "opp-1", userId: "client-2", kind: "LIVRAISON" }],
    });

    const r = await new PassagesService(asPrisma(fake)).remiseApplicable(
      "client-2",
      new Date("2026-08-06T00:00:00.000Z"),
      VEILLE_18H,
    );
    assert.equal(r.applicable, false);
  });

  it("REFUSE la remise à un client sans commune confirmée", async () => {
    const fake = fakePrisma({
      opportunities: [opportunite],
      users: { "client-2": { communeInsee: null } },
      responses: [{ opportunityId: "opp-1", userId: "client-2", kind: "LIVRAISON" }],
    });

    const r = await new PassagesService(asPrisma(fake)).remiseApplicable(
      "client-2",
      DEMAIN,
      VEILLE_18H,
    );
    assert.equal(r.applicable, false);
  });
});
