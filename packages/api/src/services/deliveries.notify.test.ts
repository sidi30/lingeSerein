/**
 * Notification du client sur le statut de sa livraison.
 *
 * `deliveries.service.ts` n'appelait `notify()` nulle part : un client ne savait
 * jamais que son linge était arrivé, ni que son passage avait été sauté. Ces
 * tests échouent tous sur la version d'avant — non pas sur une assertion de
 * confort, mais parce qu'AUCUNE notification n'était créée.
 *
 * Trois propriétés valent d'être verrouillées, parce que leur violation est
 * invisible en production :
 *   1. la notification part bien, avec de quoi ouvrir le bon écran au tap ;
 *   2. elle part APRÈS le commit, hors transaction — une transaction qui reste
 *      ouverte le temps d'un appel Expo (jusqu'à 10 s de timeout) verrouille des
 *      lignes pour rien ;
 *   3. son échec ne fait JAMAIS échouer l'appel. L'arrêt est déjà validé en
 *      base : renvoyer une erreur au livreur le pousserait à re-valider, et le
 *      second appel se heurterait à `ALREADY_COMPLETED`, le bloquant pour de bon.
 *
 * Faux Prisma en mémoire : ni base, ni Redis, ni réseau.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { DeliveriesService } from "./deliveries.service.ts";
import { setPushQueue } from "../jobs/push-queue.ts";

const STOP_ID = "stop-1";
const ROUND_ID = "round-1";
const DRIVER_ID = "driver-1";
const CLIENT_ID = "client-1";

interface NotificationCreee {
  userId: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  dansTransaction: boolean;
}

/**
 * Faux Prisma partagé par les deux scénarios.
 *
 * `dansTransaction` bascule à `true` pendant l'exécution du callback de
 * `$transaction` : c'est ce drapeau qui prouve que la notification est bien
 * émise après le commit, et non pendant.
 */
function fakePrisma(
  options: {
    orderId?: string | null;
    stops?: { id: string; status: string; clientId: string }[];
  } = {},
) {
  const notifications: NotificationCreee[] = [];
  let dansTransaction = false;

  const orderId = options.orderId === undefined ? "order-1" : options.orderId;

  const tx = {
    deliveryStop: {
      update: () => Promise.resolve({ id: STOP_ID, status: "COMPLETED" }),
      updateMany: () => Promise.resolve({ count: 1 }),
    },
    deliveryRound: {
      update: () => Promise.resolve({ id: ROUND_ID, status: "COMPLETED" }),
    },
    stockMovement: { create: () => Promise.resolve({ id: "mvt-1" }) },
    stockItem: { upsert: () => Promise.resolve({ id: "item-1" }) },
    auditLog: { create: () => Promise.resolve({ id: "audit-1" }) },
    rotation: { findFirst: () => Promise.resolve(null) },
  };

  const client = {
    notifications,
    deliveryStop: {
      findUnique: () =>
        Promise.resolve({
          id: STOP_ID,
          roundId: ROUND_ID,
          clientId: CLIENT_ID,
          orderId,
          driverId: DRIVER_ID,
          status: "PENDING",
          round: { status: "PLANNED", operatorId: "op-1" },
        }),
    },
    deliveryRound: {
      findUnique: () =>
        Promise.resolve({
          id: ROUND_ID,
          driverId: DRIVER_ID,
          status: "IN_PROGRESS",
          stops: options.stops ?? [],
        }),
    },
    order: {
      findUnique: () =>
        Promise.resolve({ id: "order-1", items: [{ quantity: 6, product: { range: "CONFORT" } }] }),
    },
    // ---- Modèles lus par `notify` / `deliverPush` ----
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notification: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        notifications.push({
          userId: String(data["userId"]),
          type: String(data["type"]),
          channel: String(data["channel"]),
          title: String(data["title"]),
          body: String(data["body"]),
          data: (data["data"] ?? {}) as Record<string, unknown>,
          dansTransaction,
        });
        return Promise.resolve({ ...data, id: `notif-${notifications.length}` });
      },
      count: () => Promise.resolve(notifications.length),
    },
    // Aucun appareil enregistré ⇒ `deliverPush` sort avant tout appel réseau.
    deviceToken: { findMany: () => Promise.resolve([]) },
    $transaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> => {
      dansTransaction = true;
      try {
        return await fn(tx);
      } finally {
        dansTransaction = false;
      }
    },
  };

  return client;
}

const DONNEES = {
  setsDelivered: 8,
  dirtyPickedUp: 5,
  qrCodeScanned: true,
  photoUrl: undefined,
  signatureUrl: undefined,
  signatureDataUrl: undefined,
  signataireNom: "M. Durand",
  conforme: true,
  reserves: undefined,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const service = (fake: ReturnType<typeof fakePrisma>) => new DeliveriesService(fake as any);

beforeEach(() => {
  // Pas de Redis en test : `notify` retombe sur l'envoi direct, qui sort
  // immédiatement faute d'appareil enregistré.
  setPushQueue(null);
});

afterEach(() => {
  setPushQueue(null);
});

// ---------------------------------------------------------------------------

describe("completeStop — le client est prévenu", () => {
  it("crée une notification DELIVERY_CONFIRMED pour le client de l'arrêt", async () => {
    const fake = fakePrisma();

    await service(fake).completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    assert.equal(fake.notifications.length, 1, "le client doit être prévenu de sa livraison");
    const notif = fake.notifications[0];
    assert.ok(notif);
    assert.equal(notif.userId, CLIENT_ID, "le destinataire est le CLIENT, pas le livreur");
    assert.equal(notif.type, "DELIVERY_CONFIRMED");
    assert.equal(notif.channel, "BOTH");
  });

  it("annonce les quantités livrées et reprises", async () => {
    const fake = fakePrisma();

    await service(fake).completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    const notif = fake.notifications[0];
    assert.ok(notif);
    assert.match(notif.body, /8/, "le nombre d'ensembles livrés doit figurer dans le message");
    assert.match(notif.body, /5/, "le nombre d'ensembles repris doit figurer dans le message");
    assert.equal(notif.data["setsDelivered"], 8);
    assert.equal(notif.data["dirtyPickedUp"], 5);
  });

  it("porte de quoi ouvrir le bon écran au tap", async () => {
    const fake = fakePrisma();

    await service(fake).completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    const data = fake.notifications[0]?.data ?? {};
    // Sans `type` + identifiant, le tap sur la notification n'ouvre rien côté
    // mobile — et personne ne s'en plaint : l'utilisateur croit juste que
    // l'application est lente.
    assert.equal(data["type"], "DELIVERY_CONFIRMED");
    assert.equal(data["deliveryStopId"], STOP_ID);
    assert.equal(data["roundId"], ROUND_ID);
    assert.equal(data["orderId"], "order-1");
    assert.equal(data["path"], "/orders/order-1");
  });

  it("omet le chemin quand l'arrêt n'a pas de commande (arrêt créé à la main)", async () => {
    const fake = fakePrisma({ orderId: null });

    await service(fake).completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    const data = fake.notifications[0]?.data ?? {};
    // Un chemin vers une page inexistante est pire qu'une absence de chemin :
    // il ouvre un écran vide.
    assert.equal(data["path"], undefined);
    assert.equal(data["deliveryStopId"], STOP_ID, "l'identifiant de l'arrêt reste transmis");
  });

  it("notifie APRÈS le commit, jamais pendant la transaction", async () => {
    const fake = fakePrisma();

    await service(fake).completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    assert.equal(
      fake.notifications[0]?.dansTransaction,
      false,
      "un appel réseau dans la transaction la garde ouverte le temps du timeout Expo",
    );
  });

  it("valide l'arrêt même si la notification échoue", async () => {
    const fake = fakePrisma();
    fake.notification.create = () => Promise.reject(new Error("Postgres injoignable"));

    // Sur un `notify` non protégé, cet appel lèverait : le livreur verrait une
    // erreur sur une livraison pourtant enregistrée, et sa seconde tentative se
    // heurterait à ALREADY_COMPLETED.
    const stop = await service(fake).completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    assert.equal(stop.status, "COMPLETED");
  });
});

// ---------------------------------------------------------------------------

describe("completeRound — seuls les clients non servis sont prévenus", () => {
  it("prévient le client dont l'arrêt vient d'être sauté", async () => {
    const fake = fakePrisma({
      stops: [{ id: "stop-2", status: "PENDING", clientId: "client-2" }],
    });

    await service(fake).completeRound(ROUND_ID, DRIVER_ID);

    assert.equal(fake.notifications.length, 1);
    const notif = fake.notifications[0];
    assert.ok(notif);
    assert.equal(notif.userId, "client-2");
    assert.equal(notif.type, "DELIVERY_DELAYED");
    assert.equal(notif.dansTransaction, false);
    assert.equal(notif.data["roundId"], ROUND_ID);
  });

  it("ne renotifie pas les clients déjà livrés", async () => {
    const fake = fakePrisma({
      stops: [
        { id: "stop-1", status: "COMPLETED", clientId: CLIENT_ID },
        { id: "stop-3", status: "SKIPPED", clientId: "client-3" },
      ],
    });

    await service(fake).completeRound(ROUND_ID, DRIVER_ID);

    // Le client livré a déjà reçu sa notification à son arrêt ; celui déjà
    // SKIPPED avant la clôture n'a pas été sauté par CE geste.
    assert.equal(fake.notifications.length, 0);
  });

  it("n'envoie qu'un message à un client ayant deux arrêts sautés", async () => {
    const fake = fakePrisma({
      stops: [
        { id: "stop-4", status: "PENDING", clientId: "client-4" },
        { id: "stop-5", status: "PENDING", clientId: "client-4" },
      ],
    });

    await service(fake).completeRound(ROUND_ID, DRIVER_ID);

    assert.equal(fake.notifications.length, 1, "deux arrêts, un seul client, un seul message");
  });

  it("clôture la tournée même si la notification échoue", async () => {
    const fake = fakePrisma({
      stops: [{ id: "stop-2", status: "PENDING", clientId: "client-2" }],
    });
    fake.notification.create = () => Promise.reject(new Error("Postgres injoignable"));

    const round = await service(fake).completeRound(ROUND_ID, DRIVER_ID);

    assert.equal(round.status, "COMPLETED");
  });
});
