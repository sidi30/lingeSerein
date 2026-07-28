/**
 * Une lecture ne doit rien écrire.
 *
 * Trois GET rattrapaient les bascules d'état en tête de requête :
 * `QuotesService.list` expirait les devis, `InvoicesService.list` basculait les
 * impayés, et `GET /rotations` marquait les retards. Conséquences visibles :
 * recharger un écran faisait changer un statut sous les yeux de l'utilisateur
 * sans qu'il ait rien fait, une fiche ouverte juste après contredisait la liste
 * qu'il venait de quitter, et la réponse de `GET /rotations` différait selon le
 * rôle de l'appelant — le filet était réservé aux admins.
 *
 * Le faux Prisma ci-dessous ne sait faire qu'une chose : **lever sur toute
 * écriture**. Un test qui se contenterait de vérifier la liste renvoyée
 * passerait aussi bien avant qu'après le correctif.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { QuotesService } from "./quotes.service.ts";
import { InvoicesService } from "./invoices.service.ts";
import { RotationsService } from "./rotations.service.ts";

const OPERATOR = "op-1";

/** Toute méthode d'écriture lève ; les lectures renvoient du vide. */
function prismaLectureSeule() {
  const ecritures: string[] = [];

  const interdire = (chemin: string) => () => {
    ecritures.push(chemin);
    throw new Error(`Écriture pendant une lecture : ${chemin}`);
  };

  /**
   * Les lectures renvoient une ligne qui DÉCLENCHERAIT la bascule.
   *
   * Point crucial : avec des listes vides, `expireOverdue` et `markOverdue`
   * sortent avant d'écrire, et le test passerait à vide — il validerait le
   * correctif sans rien vérifier. Chaque `findMany` rend donc un enregistrement
   * périmé de longue date, pour que toute bascule oubliée tente réellement son
   * `updateMany` et se fasse prendre.
   */
  const PERIME = new Date("2020-01-01T09:00:00Z");
  const lignesParModele: Record<string, unknown[]> = {
    // Assez complète pour traverser le calcul de totaux de `list()`, et assez
    // ancienne pour qu'`expireOverdue` veuille la basculer.
    quote: [
      {
        id: "q1",
        numero: "DEV-2020-0001",
        createdAt: PERIME,
        dateEnvoi: PERIME,
        validiteJours: 30,
        status: "ENVOYE",
        clientNom: "Hôtel du Port",
        lignes: [{ designation: "Kit bain", qty: 2, unitCents: 2900 }],
        remisePct: 0,
        livraisonCents: 0,
        tvaApplicable: false,
      },
    ],
    rotation: [
      {
        id: "r1",
        status: "PLANIFIEE",
        dateReprisePrevue: PERIME,
        dateRepriseReelle: null,
        facturableRemplacement: false,
        lignes: [],
      },
    ],
  };

  const modele = (nom: string) => ({
    findMany: () => Promise.resolve(lignesParModele[nom] ?? []),
    findFirst: () => Promise.resolve(null),
    findUnique: () => Promise.resolve(null),
    count: () => Promise.resolve(0),
    aggregate: () => Promise.resolve({ _sum: {}, _count: 0 }),
    groupBy: () => Promise.resolve([]),
    update: interdire(`${nom}.update`),
    updateMany: interdire(`${nom}.updateMany`),
    create: interdire(`${nom}.create`),
    createMany: interdire(`${nom}.createMany`),
    upsert: interdire(`${nom}.upsert`),
    delete: interdire(`${nom}.delete`),
    deleteMany: interdire(`${nom}.deleteMany`),
  });

  return {
    ecritures,
    client: {
      quote: modele("quote"),
      invoice: modele("invoice"),
      rotation: modele("rotation"),
      rotationLigne: modele("rotationLigne"),
      user: modele("user"),
      auditLog: modele("auditLog"),
      notification: modele("notification"),
      $transaction: (arg: unknown) => {
        if (typeof arg === "function") {
          throw new Error("Transaction ouverte pendant une lecture");
        }
        // Forme tableau : `$transaction([findMany, count])` — lectures groupées,
        // parfaitement légitime dans un GET.
        return Promise.all(arg as Promise<unknown>[]);
      },
    },
  };
}

const PAGINATION = { page: 1, limit: 20 };

describe("GET — aucune écriture en base", () => {
  it("lister les devis n'expire plus rien", async () => {
    const fake = prismaLectureSeule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.list({ ...PAGINATION } as any, OPERATOR);

    assert.deepEqual(fake.ecritures, []);
  });

  it("lister les factures ne bascule plus les impayés", async () => {
    const fake = prismaLectureSeule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new InvoicesService(fake.client as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.list({ ...PAGINATION, excludeStatus: [] } as any, OPERATOR);

    assert.deepEqual(fake.ecritures, []);
  });

  it("le récapitulatif des rotations ne marque plus les retards", async () => {
    const fake = prismaLectureSeule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new RotationsService(fake.client as any);

    await service.summary(OPERATOR);

    assert.deepEqual(fake.ecritures, []);
  });

  it("lister les rotations ne marque plus les retards", async () => {
    const fake = prismaLectureSeule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new RotationsService(fake.client as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.list({ ...PAGINATION } as any, OPERATOR);

    assert.deepEqual(fake.ecritures, []);
  });
});

describe("les bascules restent possibles — hors lecture", () => {
  it("`expireOverdue` écrit toujours, appelé explicitement", async () => {
    // La méthode n'est pas supprimée : elle reste le geste délibéré du cron et
    // d'un éventuel rattrapage manuel. Ce qui change, c'est QUI l'appelle.
    const fake = prismaLectureSeule();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    await assert.rejects(() => service.expireOverdue(OPERATOR), /quote.updateMany/);
    assert.deepEqual(fake.ecritures, ["quote.updateMany"]);
  });

  it("`markOverdue` des rotations écrit toujours, appelé explicitement", async () => {
    const fake = prismaLectureSeule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new RotationsService(fake.client as any);

    await assert.rejects(() => service.markOverdue(OPERATOR), /rotation.updateMany/);
    assert.deepEqual(fake.ecritures, ["rotation.updateMany"]);
  });
});
