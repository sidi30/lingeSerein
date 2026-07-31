/**
 * Annulation d'une tournée.
 *
 * Le modèle portait `DeliveryRoundStatus.CANCELLED` depuis le début, mais aucun
 * chemin de code ne l'atteignait : l'admin n'avait que la SUPPRESSION, refusée
 * dès qu'un arrêt était livré. Une tournée entamée puis interrompue — livreur
 * souffrant, camion en panne — restait donc éternellement « en cours », avec ses
 * arrêts restants affichés comme à faire.
 *
 * Ce qui se joue ici n'est pas le changement de statut, qui est trivial, mais
 * les trois conséquences qui doivent l'accompagner sans exception : les arrêts
 * restants ne sont plus à faire, les propositions de passage groupé de cette
 * tournée n'ont plus d'objet, et les gens concernés l'apprennent. Une annulation
 * qui oublie l'une des trois est pire que pas d'annulation du tout : elle donne
 * à l'admin la certitude d'avoir agi.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DeliveriesService } from "./deliveries.service.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROUND = "round-1";
const DRIVER = "driver-1";
const ADMIN = "admin-1";

interface Options {
  status?: string;
  stops?: Array<{ id: string; status: string; clientId: string }>;
  notes?: string | null;
}

function fakePrisma(o: Options = {}) {
  const journal = {
    stopsUpdated: [] as any[],
    opportunitesSupprimees: [] as any[],
    roundUpdate: null as any,
    audits: [] as any[],
    notifications: [] as any[],
  };

  const round = {
    id: ROUND,
    driverId: DRIVER,
    date: new Date("2026-08-12T00:00:00.000Z"),
    status: o.status ?? "PLANNED",
    notes: o.notes ?? null,
    stops: o.stops ?? [
      { id: "s1", status: "PENDING", clientId: "client-1" },
      { id: "s2", status: "PENDING", clientId: "client-1" }, // même client, deux arrêts
      { id: "s3", status: "PENDING", clientId: "client-2" },
      { id: "s4", status: "COMPLETED", clientId: "client-3" },
    ],
    driver: { id: DRIVER, name: "Karim", email: "karim@example.test" },
    zone: { name: "Orange" },
  };

  const tx = {
    deliveryStop: {
      updateMany: async (args: any) => {
        journal.stopsUpdated.push(args);
        return { count: round.stops.filter((s) => s.status === "PENDING").length };
      },
    },
    passageOpportunity: {
      deleteMany: async (args: any) => {
        journal.opportunitesSupprimees.push(args);
        return { count: 2 };
      },
    },
    deliveryRound: {
      update: async (args: any) => {
        journal.roundUpdate = args;
        return { ...round, ...args.data };
      },
    },
  };

  const prisma: any = {
    deliveryRound: {
      findUnique: async () => round,
    },
    auditLog: {
      create: async ({ data }: any) => {
        journal.audits.push(data);
        return data;
      },
    },
    // `notify` écrit une notification puis lit les préférences ; le minimum pour
    // qu'il aboutisse sans base.
    notification: {
      create: async ({ data }: any) => {
        journal.notifications.push(data);
        return { id: "n-x", ...data };
      },
    },
    notificationSetting: { findUnique: async () => null },
    deviceToken: { findMany: async () => [] },
    $transaction: async (fn: any) => fn(tx),
  };

  return { prisma, journal, round };
}

const service = (prisma: any) =>
  new DeliveriesService(prisma, { sendMail: async () => ({}) as any });

describe("annulation d'une tournée", () => {
  it("bascule la tournée en CANCELLED", async () => {
    const { prisma, journal } = fakePrisma();
    const result = await service(prisma).cancelRound(ROUND, ADMIN);

    assert.equal(result.status, "CANCELLED");
    assert.equal(journal.roundUpdate.data.status, "CANCELLED");
  });

  it("solde les arrêts restants en SKIPPED", async () => {
    // Un arrêt laissé PENDING dans une tournée annulée reste affiché « à faire »
    // dans l'application du livreur : l'annulation n'aurait rien annulé pour lui.
    const { prisma, journal } = fakePrisma();
    await service(prisma).cancelRound(ROUND, ADMIN);

    assert.equal(journal.stopsUpdated.length, 1);
    assert.deepEqual(journal.stopsUpdated[0].where, { roundId: ROUND, status: "PENDING" });
    assert.deepEqual(journal.stopsUpdated[0].data, { status: "SKIPPED" });
  });

  it("ne touche pas aux arrêts déjà livrés", async () => {
    // Le filtre `status: "PENDING"` est ce qui protège les preuves de remise.
    const { prisma, journal } = fakePrisma();
    await service(prisma).cancelRound(ROUND, ADMIN);

    assert.equal(journal.stopsUpdated[0].where.status, "PENDING");
  });

  it("supprime les propositions de passage groupé de la tournée", async () => {
    // Elles n'existent QUE parce qu'un camion passe. Les laisser vivantes
    // proposerait une remise de 50 % pour un passage qui n'aura pas lieu.
    const { prisma, journal } = fakePrisma();
    const result = await service(prisma).cancelRound(ROUND, ADMIN);

    assert.deepEqual(journal.opportunitesSupprimees[0].where, { roundId: ROUND });
    assert.equal(result.opportunitesSupprimees, 2);
  });

  it("prévient le livreur", async () => {
    const { prisma, journal } = fakePrisma();
    await service(prisma).cancelRound(ROUND, ADMIN);

    const auLivreur = journal.notifications.filter((n) => n.userId === DRIVER);
    assert.equal(auLivreur.length, 1);
    assert.match(auLivreur[0].title, /annul/i);
  });

  it("prévient chaque client non servi UNE seule fois", async () => {
    // client-1 a deux arrêts dans la tournée : il ne doit pas recevoir deux
    // messages. client-3 est déjà livré : il n'a rien à apprendre.
    const { prisma, journal } = fakePrisma();
    const result = await service(prisma).cancelRound(ROUND, ADMIN);

    const clients = journal.notifications.filter((n) => n.userId !== DRIVER).map((n) => n.userId);
    assert.deepEqual([...clients].sort(), ["client-1", "client-2"]);
    assert.equal(result.clientsPrevenus, 2);
  });

  it("ajoute le motif aux notes sans écraser les consignes existantes", async () => {
    const { prisma, journal } = fakePrisma({ notes: "Charger 12 kits bain" });
    await service(prisma).cancelRound(ROUND, ADMIN, "camion en panne");

    assert.match(journal.roundUpdate.data.notes, /Charger 12 kits bain/);
    assert.match(journal.roundUpdate.data.notes, /Annulée : camion en panne/);
  });

  it("laisse les notes intactes quand aucun motif n'est donné", async () => {
    // Le motif est facultatif : l'exiger ferait renoncer un admin pressé, qui
    // laisserait alors une tournée fantôme au planning.
    const { prisma, journal } = fakePrisma({ notes: "Charger 12 kits bain" });
    await service(prisma).cancelRound(ROUND, ADMIN);

    assert.equal(journal.roundUpdate.data.notes, undefined);
  });

  it("trace l'annulation, son motif et son ampleur", async () => {
    const { prisma, journal } = fakePrisma();
    await service(prisma).cancelRound(ROUND, ADMIN, "livreur souffrant");

    const audit = journal.audits[0];
    assert.equal(audit.entity, "DeliveryRound");
    assert.equal(audit.entityId, ROUND);
    assert.equal(audit.changes.cancelled, true);
    assert.equal(audit.changes.previousStatus, "PLANNED");
    assert.equal(audit.changes.motif, "livreur souffrant");
  });

  it("annule une tournée DÉJÀ COMMENCÉE — c'est son cas d'usage principal", async () => {
    // La suppression est refusée dès qu'un arrêt est livré ; l'annulation est
    // alors la seule façon de solder la journée.
    const { prisma } = fakePrisma({
      status: "IN_PROGRESS",
      stops: [
        { id: "s1", status: "COMPLETED", clientId: "client-1" },
        { id: "s2", status: "PENDING", clientId: "client-2" },
      ],
    });

    const result = await service(prisma).cancelRound(ROUND, ADMIN);
    assert.equal(result.status, "CANCELLED");
    assert.equal(result.clientsPrevenus, 1);
  });

  it("refuse une tournée terminée", async () => {
    // L'annuler après coup contredirait des arrêts signés et des mouvements de
    // stock déjà enregistrés.
    const { prisma } = fakePrisma({ status: "COMPLETED" });
    await assert.rejects(() => service(prisma).cancelRound(ROUND, ADMIN), {
      code: "ROUND_ALREADY_COMPLETED",
    });
  });

  it("refuse une tournée déjà annulée", async () => {
    // Sans ce refus, un second appel renotifierait tout le monde.
    const { prisma } = fakePrisma({ status: "CANCELLED" });
    await assert.rejects(() => service(prisma).cancelRound(ROUND, ADMIN), {
      code: "ROUND_ALREADY_CANCELLED",
    });
  });

  it("n'écrit rien quand elle refuse", async () => {
    const { prisma, journal } = fakePrisma({ status: "COMPLETED" });
    await assert.rejects(() => service(prisma).cancelRound(ROUND, ADMIN));

    assert.equal(journal.roundUpdate, null);
    assert.equal(journal.stopsUpdated.length, 0);
    assert.equal(journal.opportunitesSupprimees.length, 0);
    assert.equal(journal.notifications.length, 0);
  });
});
