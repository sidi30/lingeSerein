/**
 * Idempotence des crons de rotation.
 *
 * C'est LA propriété qui distingue un service qui prévient d'un service qui
 * harcèle : un cron rejoué (redémarrage du conteneur, `attempts: 3` de BullMQ,
 * relance manuelle) ne doit produire aucune notification supplémentaire.
 *
 * Les tests s'exécutent contre un faux client Prisma en mémoire — assez fidèle
 * pour les filtres réellement utilisés par les crons, et sans base ni Redis.
 * L'email n'est jamais tenté : `INTERNAL_INTAKE_SECRET` est retiré de
 * l'environnement, `sendTransactionalMail` court-circuite alors sans réseau.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Doit précéder l'import du worker : garantit qu'aucun email ne part et
// qu'aucun appel réseau n'est tenté pendant les tests.
delete process.env["INTERNAL_INTAKE_SECRET"];

import { __rotationCrons } from "./rotation.worker.ts";

// ---------------------------------------------------------------------------
// Faux Prisma — ne couvre que les formes de requête utilisées par les crons.
// ---------------------------------------------------------------------------

interface FakeLine {
  id: string;
  rotationId: string;
  productSlug: string | null;
  designation: string;
  qtyLivree: number;
  qtyReprise: number | null;
  position: number;
}

interface FakeRotation {
  id: string;
  userId: string | null;
  clientNom: string;
  clientEmail: string | null;
  clientAdresse: string | null;
  formule: string;
  status: string;
  dateReprisePrevue: Date;
  dateRepriseReelle: Date | null;
  facturableRemplacement: boolean;
  reminderSentAt: Date | null;
  overdueNotifiedAt: Date | null;
  deletedAt: Date | null;
  lignes: FakeLine[];
}

interface FakeNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

function jour(y: number, m: number, d: number, h = 10): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

function rotation(over: Partial<FakeRotation> = {}): FakeRotation {
  const id = over.id ?? `rot-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    userId: "user-1",
    clientNom: "Gîte des Oliviers",
    clientEmail: "gite@example.test",
    clientAdresse: "12 rue des Oliviers, Orange",
    formule: "PONCTUEL",
    status: "LIVREE",
    dateReprisePrevue: jour(2026, 7, 15),
    dateRepriseReelle: null,
    facturableRemplacement: false,
    reminderSentAt: null,
    overdueNotifiedAt: null,
    deletedAt: null,
    lignes: [
      {
        id: `${id}-l1`,
        rotationId: id,
        productSlug: "kit-bain",
        designation: "Kit Bain",
        qtyLivree: 4,
        qtyReprise: null,
        position: 0,
      },
    ],
    ...over,
  };
}

function createFakePrisma(rotations: FakeRotation[], admins = [{ id: "admin-1", email: null }]) {
  const notifications: FakeNotification[] = [];

  function matchesRotation(r: FakeRotation, where: Record<string, unknown>): boolean {
    if (where["deletedAt"] === null && r.deletedAt !== null) return false;
    if (where["dateRepriseReelle"] === null && r.dateRepriseReelle !== null) return false;

    const status = where["status"] as { notIn?: string[]; in?: string[] } | undefined;
    if (status?.notIn && status.notIn.includes(r.status)) return false;
    if (status?.in && !status.in.includes(r.status)) return false;

    const date = where["dateReprisePrevue"] as { gte?: Date; lt?: Date } | undefined;
    if (date?.gte && r.dateReprisePrevue < date.gte) return false;
    if (date?.lt && r.dateReprisePrevue >= date.lt) return false;

    return true;
  }

  return {
    notifications,
    rotations,
    notification: {
      findMany: async ({ where }: { where: { type: string; createdAt: { gte: Date } } }) =>
        notifications
          .filter((n) => n.type === where.type && n.createdAt >= where.createdAt.gte)
          .map((n) => ({ data: n.data })),
      create: async ({ data }: { data: Omit<FakeNotification, "id" | "createdAt"> }) => {
        const created: FakeNotification = {
          ...data,
          id: `notif-${notifications.length + 1}`,
          createdAt: new Date(),
        };
        notifications.push(created);
        return created;
      },
    },
    notificationSetting: {
      findUnique: async () => null,
    },
    rotation: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rotations.filter((r) => matchesRotation(r, where)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeRotation> }) => {
        const target = rotations.find((r) => r.id === where.id);
        if (target) Object.assign(target, data);
        return target;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: Partial<FakeRotation>;
      }) => {
        let count = 0;
        for (const r of rotations) {
          if (where.id.in.includes(r.id)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
    },
    user: {
      findMany: async () => admins,
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asPrisma = (fake: ReturnType<typeof createFakePrisma>) => fake as any;

// ---------------------------------------------------------------------------

describe("cron rappel J-1 (18:00)", () => {
  const veille = jour(2026, 7, 14, 18);
  let fake: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    fake = createFakePrisma([rotation({ id: "rot-1", dateReprisePrevue: jour(2026, 7, 15) })]);
  });

  it("notifie le client dont la reprise est prévue demain", async () => {
    const result = await __rotationCrons.runReminder(asPrisma(fake), veille);
    assert.equal(result.passages, 1);
    assert.equal(result.clients, 1);

    const clientNotif = fake.notifications.find((n) => n.userId === "user-1");
    assert.ok(clientNotif, "le client doit être notifié");
    assert.equal(clientNotif.type, "ROTATION_REMINDER");
  });

  it("ne renotifie personne si le cron est rejoué le même jour", async () => {
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    const apresPremier = fake.notifications.length;

    await __rotationCrons.runReminder(asPrisma(fake), veille);
    assert.equal(
      fake.notifications.length,
      apresPremier,
      "un second passage ne doit créer aucune notification",
    );
  });

  it("reste idempotent sur trois passages consécutifs", async () => {
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    const attendu = fake.notifications.length;
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    assert.equal(fake.notifications.length, attendu);
  });

  it("remplit data.type et data.rotationId (deep-link mobile)", async () => {
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    const clientNotif = fake.notifications.find((n) => n.userId === "user-1");
    assert.equal(clientNotif?.data["type"], "ROTATION_REMINDER");
    assert.equal(clientNotif?.data["rotationId"], "rot-1");
  });

  it("envoie un récapitulatif au gestionnaire, une seule fois", async () => {
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    const recaps = fake.notifications.filter((n) => n.userId === "admin-1");
    assert.equal(recaps.length, 1);
    assert.match(String(recaps[0]?.data["rotationId"]), /^recap-2026-07-15$/);

    await __rotationCrons.runReminder(asPrisma(fake), veille);
    assert.equal(fake.notifications.filter((n) => n.userId === "admin-1").length, 1);
  });

  it("ignore les rotations déjà reprises ou annulées", async () => {
    const f = createFakePrisma([
      rotation({ id: "a", status: "REPRISE", dateReprisePrevue: jour(2026, 7, 15) }),
      rotation({ id: "b", status: "ANNULEE", dateReprisePrevue: jour(2026, 7, 15) }),
    ]);
    const result = await __rotationCrons.runReminder(asPrisma(f), veille);
    assert.equal(result.passages, 0);
    assert.equal(f.notifications.length, 0);
  });

  it("ne notifie pas pour un passage qui n'est pas demain", async () => {
    const f = createFakePrisma([rotation({ dateReprisePrevue: jour(2026, 7, 20) })]);
    const result = await __rotationCrons.runReminder(asPrisma(f), veille);
    assert.equal(result.passages, 0);
  });

  it("n'échoue pas sur un client sans compte, et le fait quand même remonter au gestionnaire", async () => {
    const f = createFakePrisma([
      rotation({ id: "sans-compte", userId: null, dateReprisePrevue: jour(2026, 7, 15) }),
    ]);
    const result = await __rotationCrons.runReminder(asPrisma(f), veille);
    assert.equal(result.passages, 1);
    assert.equal(result.clients, 0, "aucune notification in-app sans compte");
    assert.equal(
      f.notifications.filter((n) => n.userId === "admin-1").length,
      1,
      "le gestionnaire doit être prévenu pour rappeler ce client",
    );
  });

  it("ne marque pas reminderSentAt quand l'email n'a pas pu partir", async () => {
    // INTERNAL_INTAKE_SECRET est absent : l'envoi échoue. L'horodatage doit rester
    // vide pour autoriser une nouvelle tentative, plutôt que d'éteindre le rappel.
    await __rotationCrons.runReminder(asPrisma(fake), veille);
    assert.equal(fake.rotations[0]?.reminderSentAt, null);
  });
});

describe("cron du jour J (07:00)", () => {
  const matin = jour(2026, 7, 15, 7);

  it("notifie le client le matin du passage", async () => {
    const f = createFakePrisma([rotation({ id: "rot-1", dateReprisePrevue: jour(2026, 7, 15) })]);
    const result = await __rotationCrons.runMorning(asPrisma(f), matin);
    assert.equal(result.passages, 1);
    assert.equal(result.clients, 1);
    assert.equal(f.notifications[0]?.type, "ROTATION_TODAY");
  });

  it("ne renotifie pas si rejoué le même jour", async () => {
    const f = createFakePrisma([rotation({ dateReprisePrevue: jour(2026, 7, 15) })]);
    await __rotationCrons.runMorning(asPrisma(f), matin);
    await __rotationCrons.runMorning(asPrisma(f), matin);
    assert.equal(f.notifications.length, 1);
  });

  it("n'interfère pas avec le rappel de la veille (types distincts)", async () => {
    const f = createFakePrisma([rotation({ dateReprisePrevue: jour(2026, 7, 15) })]);
    await __rotationCrons.runReminder(asPrisma(f), jour(2026, 7, 14, 18));
    const apresVeille = f.notifications.length;

    await __rotationCrons.runMorning(asPrisma(f), matin);
    assert.ok(
      f.notifications.length > apresVeille,
      "le rappel du jour J doit partir malgré celui de la veille",
    );
  });
});

describe("cron des retards (09:00)", () => {
  const now = jour(2026, 7, 20, 9);

  it("bascule en EN_RETARD une rotation échue", async () => {
    const f = createFakePrisma([
      rotation({ id: "r", status: "LIVREE", dateReprisePrevue: jour(2026, 7, 18) }),
    ]);
    const result = await __rotationCrons.runOverdue(asPrisma(f), now);
    assert.equal(result.basculees, 1);
    assert.equal(f.rotations[0]?.status, "EN_RETARD");
  });

  it("lève le drapeau de facturation au-delà de 3 jours, pas avant", async () => {
    // 18 juillet + 3 j = 21 : au 20, on est à 2 jours de retard → pas d'escalade.
    const f = createFakePrisma([
      rotation({ id: "recent", dateReprisePrevue: jour(2026, 7, 18) }),
      rotation({ id: "ancien", dateReprisePrevue: jour(2026, 7, 10) }),
    ]);
    const result = await __rotationCrons.runOverdue(asPrisma(f), now);

    assert.equal(result.escaladees, 1);
    assert.equal(f.rotations.find((r) => r.id === "recent")?.facturableRemplacement, false);
    assert.equal(f.rotations.find((r) => r.id === "ancien")?.facturableRemplacement, true);
  });

  it("ne facture jamais automatiquement — il ne fait que lever un indicateur", async () => {
    const f = createFakePrisma([rotation({ dateReprisePrevue: jour(2026, 7, 10) })]);
    const result = await __rotationCrons.runOverdue(asPrisma(f), now);
    assert.equal(result.escaladees, 1);
    // Aucun effet autre que le drapeau : pas de montant, pas de pièce comptable.
    assert.equal(f.rotations[0]?.facturableRemplacement, true);
  });

  it("n'alerte le gestionnaire qu'une fois par jour", async () => {
    const f = createFakePrisma([rotation({ dateReprisePrevue: jour(2026, 7, 18) })]);
    await __rotationCrons.runOverdue(asPrisma(f), now);
    const premier = f.notifications.filter((n) => n.userId === "admin-1").length;
    assert.equal(premier, 1);

    await __rotationCrons.runOverdue(asPrisma(f), now);
    assert.equal(f.notifications.filter((n) => n.userId === "admin-1").length, 1);
  });

  it("ne bascule pas une rotation encore dans les temps", async () => {
    const f = createFakePrisma([rotation({ dateReprisePrevue: jour(2026, 7, 25) })]);
    const result = await __rotationCrons.runOverdue(asPrisma(f), now);
    assert.equal(result.enRetard, 0);
    assert.equal(f.rotations[0]?.status, "LIVREE");
  });

  it("ignore une rotation déjà reprise, même échue", async () => {
    const f = createFakePrisma([
      rotation({
        status: "REPRISE",
        dateReprisePrevue: jour(2026, 7, 10),
        dateRepriseReelle: jour(2026, 7, 12),
      }),
    ]);
    const result = await __rotationCrons.runOverdue(asPrisma(f), now);
    assert.equal(result.enRetard, 0);
  });
});
