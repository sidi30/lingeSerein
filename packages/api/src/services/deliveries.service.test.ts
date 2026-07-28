/**
 * Atomicité de la validation d'un arrêt de tournée.
 *
 * `completeStop` enchaînait six écritures indépendantes : l'arrêt, la tournée,
 * deux mouvements de stock par gamme, le stock par slug (dans sa PROPRE
 * transaction) et le journal d'audit. Une coupure entre deux lignes — réseau du
 * livreur, redémarrage du conteneur — laissait un arrêt marqué LIVRÉ dont le
 * stock n'avait pas bougé. C'est le pire état possible : le linge est chez le
 * client, le parc affirme qu'il est en réserve, et rien ne signale l'écart
 * puisque l'arrêt s'affiche comme fait.
 *
 * Le faux Prisma ci-dessous ne sait faire qu'une chose, et c'est la seule qui
 * compte ici : **refuser toute écriture hors transaction**. Un test qui se
 * contenterait de vérifier le résultat final passerait aussi bien avant qu'après
 * le correctif.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { DeliveriesService } from "./deliveries.service.ts";

const STOP_ID = "stop-1";
const DRIVER_ID = "driver-1";

interface Ecriture {
  modele: string;
  operation: string;
  dansTransaction: boolean;
}

/**
 * Faux client de transaction : enregistre chaque écriture en la marquant comme
 * transactionnelle.
 */
function clientTransactionnel(journal: Ecriture[], rotationLignes: unknown[]) {
  const ecrire = (modele: string, operation: string) => () => {
    journal.push({ modele, operation, dansTransaction: true });
    return Promise.resolve({ id: `${modele}-x` });
  };

  return {
    deliveryStop: {
      update: (args: { include?: unknown }) => {
        journal.push({ modele: "deliveryStop", operation: "update", dansTransaction: true });
        return Promise.resolve({ id: STOP_ID, status: "COMPLETED", include: args.include });
      },
      updateMany: ecrire("deliveryStop", "updateMany"),
    },
    deliveryRound: { update: ecrire("deliveryRound", "update") },
    stockMovement: { create: ecrire("stockMovement", "create") },
    stockItem: { upsert: ecrire("stockItem", "upsert") },
    auditLog: { create: ecrire("auditLog", "create") },
    rotation: {
      findFirst: () =>
        Promise.resolve(rotationLignes.length > 0 ? { id: "rot-1", lignes: rotationLignes } : null),
    },
  };
}

/**
 * Faux client principal : les LECTURES répondent, les ÉCRITURES lèvent.
 *
 * C'est tout le test — si `completeStop` écrit encore quoi que ce soit en dehors
 * de `$transaction`, l'appel échoue au lieu de passer discrètement.
 */
function fakePrisma(options: { roundStatus?: string; rotationLignes?: unknown[] } = {}) {
  const journal: Ecriture[] = [];
  const rotationLignes = options.rotationLignes ?? [
    { productSlug: "kit-bain", qtyLivree: 6 },
    { productSlug: "kit-lit", qtyLivree: 2 },
  ];

  const interdit = (modele: string, operation: string) => () => {
    journal.push({ modele, operation, dansTransaction: false });
    throw new Error(`Écriture HORS transaction : ${modele}.${operation}`);
  };

  return {
    journal,
    client: {
      deliveryStop: {
        findUnique: () =>
          Promise.resolve({
            id: STOP_ID,
            roundId: "round-1",
            clientId: "client-1",
            orderId: "order-1",
            driverId: DRIVER_ID,
            status: "PENDING",
            round: { status: options.roundStatus ?? "PLANNED", operatorId: "op-1" },
          }),
        update: interdit("deliveryStop", "update"),
        updateMany: interdit("deliveryStop", "updateMany"),
      },
      order: {
        findUnique: () =>
          Promise.resolve({
            id: "order-1",
            items: [
              { quantity: 6, product: { range: "CONFORT" } },
              { quantity: 2, product: { range: "PRESTIGE" } },
            ],
          }),
      },
      deliveryRound: { update: interdit("deliveryRound", "update") },
      stockMovement: { create: interdit("stockMovement", "create") },
      stockItem: { upsert: interdit("stockItem", "upsert") },
      auditLog: { create: interdit("auditLog", "create") },
      rotation: { findFirst: () => Promise.resolve(null) },
      $transaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
        fn(clientTransactionnel(journal, rotationLignes)),
    },
  };
}

const DONNEES = {
  setsDelivered: 8,
  dirtyPickedUp: 5,
  qrCodeScanned: true,
  photoUrl: undefined,
  signatureUrl: undefined,
  signatureDataUrl: "data:image/svg+xml,<svg/>",
  signataireNom: "M. Durand",
  conforme: true,
  reserves: undefined,
};

describe("completeStop — atomicité", () => {
  let fake: ReturnType<typeof fakePrisma>;

  beforeEach(() => {
    fake = fakePrisma();
  });

  it("n'écrit RIEN en dehors de la transaction", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DeliveriesService(fake.client as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.completeStop(STOP_ID, DONNEES as any, DRIVER_ID, "1.2.3.4", "test");

    const horsTransaction = fake.journal.filter((e) => !e.dansTransaction);
    assert.deepEqual(horsTransaction, [], "toutes les écritures doivent être transactionnelles");
    assert.ok(fake.journal.length > 0, "le test doit avoir observé des écritures");
  });

  it("écrit bien l'arrêt, la tournée, les mouvements, le stock par slug et l'audit", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DeliveriesService(fake.client as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    const ecrits = new Set(fake.journal.map((e) => `${e.modele}.${e.operation}`));
    for (const attendu of [
      "deliveryStop.update",
      "deliveryRound.update", // la tournée passe de PLANNED à IN_PROGRESS
      "stockMovement.create",
      "stockItem.upsert", // stock par slug, plus dans sa propre transaction
      "auditLog.create",
    ]) {
      assert.ok(ecrits.has(attendu), `${attendu} attendu dans la transaction`);
    }
  });

  it("ventile les mouvements de livraison par gamme réelle, sans en inventer", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DeliveriesService(fake.client as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    // Deux gammes dans la commande ⇒ deux mouvements DELIVERY, plus un seul
    // PICKUP_DIRTY imputé à la gamme majoritaire.
    const mouvements = fake.journal.filter((e) => e.modele === "stockMovement");
    assert.equal(mouvements.length, 3);
  });

  it("n'écrit aucun mouvement de gamme quand la commande est absente", async () => {
    const sansCommande = fakePrisma();
    sansCommande.client.order.findUnique = () => Promise.resolve(null as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DeliveriesService(sansCommande.client as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    const mouvements = sansCommande.journal.filter((e) => e.modele === "stockMovement");
    assert.equal(mouvements.length, 0, "aucune gamme connue ⇒ aucun mouvement inventé");
    // Le stock par slug, lui, reste alimenté : c'est la comptabilité qui fait foi.
    assert.ok(sansCommande.journal.some((e) => e.modele === "stockItem"));
  });

  it("laisse la tournée en l'état si elle a déjà démarré", async () => {
    const enCours = fakePrisma({ roundStatus: "IN_PROGRESS" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DeliveriesService(enCours.client as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.completeStop(STOP_ID, DONNEES as any, DRIVER_ID);

    assert.ok(!enCours.journal.some((e) => e.modele === "deliveryRound"));
  });

  it("propage l'échec sans laisser l'arrêt marqué livré", async () => {
    const casse = fakePrisma();
    // Panne au milieu de la séquence : sur l'ancien code, l'arrêt était déjà
    // COMPLETED et le stock ne bougeait jamais.
    casse.client.$transaction = () => Promise.reject(new Error("connexion perdue"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DeliveriesService(casse.client as any);

    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => service.completeStop(STOP_ID, DONNEES as any, DRIVER_ID),
      /connexion perdue/,
    );
    assert.deepEqual(
      casse.journal.filter((e) => !e.dansTransaction),
      [],
    );
  });
});
