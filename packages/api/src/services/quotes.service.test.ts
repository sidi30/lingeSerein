/**
 * Émission du devis d'une commande (`POST /quotes/from-order/:orderId`).
 *
 * Ce qui est vérifié ici — et qui n'existait pas :
 *
 *  - l'IDEMPOTENCE. Une commande n'a qu'un devis. Rappeler la route (double-clic,
 *    rechargement de l'écran, relance après un timeout réseau) doit renvoyer le
 *    devis déjà émis, pas en créer un second qui consommerait un numéro de la
 *    suite légale et laisserait deux documents contradictoires chez le client ;
 *  - les FRAIS DE LIVRAISON, repris de la commande dans `livraisonCents` — le
 *    champ dédié que le PDF imprime en ligne distincte et que la facture recopie ;
 *  - l'audit écrit DANS la transaction : un devis annulé par un échec ne doit pas
 *    laisser la trace d'une émission qui n'a pas eu lieu.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { QuotesService } from "./quotes.service.ts";

const ORDER_ID = "order-1";
const OPERATOR_ID = "op-1";
const ADMIN_ID = "admin-1";

interface Ecriture {
  modele: string;
  operation: string;
  dansTransaction: boolean;
}

const COMMANDE = {
  id: ORDER_ID,
  orderNumber: "LNG-2026-ABCDEF",
  status: "CONFIRMED",
  userId: "client-1",
  deliveryFeeCents: 1200,
  deliveryFeeSurDevis: false,
  specialNotes: null as string | null,
  items: [
    { quantity: 1, unitCents: 1650, product: { name: "Kit Lit" } },
    { quantity: 2, unitCents: 750, product: { name: "Kit Bain" } },
  ],
  user: {
    id: "client-1",
    name: "Marie Durand",
    companyName: "Hôtel du Parc",
    email: "contact@hotel.test",
    phone: "0490000000",
    address: "1 rue des Lices",
  },
  quoteFromOrder: null as Record<string, unknown> | null,
};

interface OptionsFake {
  commande?: Partial<typeof COMMANDE> | null;
  /** Erreur levée par la création dans la transaction (collision de contrainte). */
  erreurCreate?: { code: string };
  /** Devis retrouvé par la relecture concurrente après P2002. */
  quoteConcurrent?: Record<string, unknown> | null;
}

function fakePrisma(options: OptionsFake = {}) {
  const journal: Ecriture[] = [];
  const crees: Record<string, unknown>[] = [];
  const commande = options.commande === null ? null : { ...COMMANDE, ...options.commande };
  let creations = 0;

  const tx = {
    quote: {
      count: () => Promise.resolve(3), // ⇒ LSQ-AAAA-0004
      update: (args: { data: Record<string, unknown> }) => {
        journal.push({ modele: "quote", operation: "update", dansTransaction: true });
        return Promise.resolve({ id: "quote-ancien", ...args.data });
      },
      create: (args: { data: Record<string, unknown> }) => {
        creations++;
        if (options.erreurCreate) return Promise.reject(options.erreurCreate);
        journal.push({ modele: "quote", operation: "create", dansTransaction: true });
        crees.push(args.data);
        const { lignes: _lignes, ...champs } = args.data;
        return Promise.resolve({
          id: "quote-1",
          createdAt: new Date("2026-07-30T10:00:00Z"),
          validiteJours: 30,
          deletedAt: null,
          ...champs,
          lignes: (args.data["lignes"] as { create: unknown[] }).create,
          user: { id: "client-1", name: "Marie Durand", email: "contact@hotel.test" },
        });
      },
    },
    auditLog: {
      create: () => {
        journal.push({ modele: "auditLog", operation: "create", dansTransaction: true });
        return Promise.resolve({ id: "audit-1" });
      },
    },
  };

  const interdit = (modele: string, operation: string) => () => {
    journal.push({ modele, operation, dansTransaction: false });
    throw new Error(`Écriture HORS transaction : ${modele}.${operation}`);
  };

  return {
    journal,
    crees,
    get creations() {
      return creations;
    },
    client: {
      order: { findFirst: () => Promise.resolve(commande) },
      quote: {
        findFirst: () => Promise.resolve(options.quoteConcurrent ?? null),
        create: interdit("quote", "create"),
        update: interdit("quote", "update"),
      },
      auditLog: { create: interdit("auditLog", "create") },
      $transaction: <T>(fn: (client: unknown) => Promise<T>): Promise<T> => fn(tx),
    },
  };
}

/** Devis déjà émis pour la commande, tel que Prisma le renvoie via l'include. */
function devisExistant(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-existant",
    numero: "LSQ-2026-0001",
    createdAt: new Date("2026-07-29T10:00:00Z"),
    validiteJours: 30,
    clientNom: "Hôtel du Parc",
    remisePct: 0,
    livraisonCents: 1200,
    livraisonSurDevis: false,
    tvaApplicable: false,
    deletedAt: null,
    lignes: [{ designation: "Kit Bain", qty: 2, unitCents: 750, position: 0 }],
    user: { id: "client-1", name: "Marie Durand", email: "contact@hotel.test" },
    ...overrides,
  };
}

describe("QuotesService.createFromOrder", () => {
  it("reprend les articles ET les frais de livraison de la commande", async () => {
    const fake = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { quote, created } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    assert.equal(created, true);
    const data = fake.crees[0];
    assert.ok(data);
    assert.equal(data["status"], "BROUILLON");
    assert.equal(data["fromOrderId"], ORDER_ID);
    assert.equal(data["userId"], "client-1");
    // La livraison va dans le champ DÉDIÉ : en faire une ligne de devis la
    // soumettrait à la remise et la compterait deux fois dans les totaux.
    assert.equal(data["livraisonCents"], 1200);
    assert.deepEqual(data["lignes"], {
      create: [
        { designation: "Kit Bain", qty: 2, unitCents: 750, position: 0 },
        { designation: "Kit Lit", qty: 1, unitCents: 1650, position: 1 },
      ],
    });

    // Totaux calculés par @lingengo/shared : 1500 + 1650 d'articles + 1200 de
    // livraison, sans TVA (franchise en base).
    assert.equal(quote.totals.sousTotal, 3150);
    assert.equal(quote.totals.totalTTC, 4350);
  });

  it("renvoie le devis déjà émis sans rien écrire — idempotence", async () => {
    const fake = fakePrisma({ commande: { quoteFromOrder: devisExistant() } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { quote, created } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    assert.equal(created, false);
    assert.equal(quote.id, "quote-existant");
    assert.equal(quote.numero, "LSQ-2026-0001");
    assert.equal(fake.creations, 0, "aucun second devis");
    assert.deepEqual(fake.journal, [], "aucune écriture, pas même un audit");
  });

  it("renvoie le devis de la requête concurrente au lieu de boucler (P2002)", async () => {
    // Deux clics simultanés : la seconde insertion heurte l'unicité de
    // `from_order_id`. Réessayer un autre numéro échouerait indéfiniment.
    const fake = fakePrisma({
      erreurCreate: { code: "P2002" },
      quoteConcurrent: devisExistant({ id: "quote-concurrent" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { quote, created } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    assert.equal(created, false);
    assert.equal(quote.id, "quote-concurrent");
    assert.equal(fake.creations, 1, "une seule tentative, pas cinq");
  });

  it("écrit le devis ET son audit dans la MÊME transaction", async () => {
    const fake = fakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    assert.deepEqual(
      fake.journal.filter((e) => !e.dansTransaction),
      [],
      "toutes les écritures doivent être transactionnelles",
    );
    const ecrits = new Set(fake.journal.map((e) => `${e.modele}.${e.operation}`));
    assert.ok(ecrits.has("quote.create"));
    assert.ok(ecrits.has("auditLog.create"));
  });

  it("porte en note que les frais restent à chiffrer quand ils sont sur devis", async () => {
    const fake = fakePrisma({
      commande: { deliveryFeeCents: 0, deliveryFeeSurDevis: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    // Sans cette note, le gestionnaire enverrait un devis annonçant une
    // livraison offerte alors qu'elle n'a jamais été chiffrée.
    assert.match(String(fake.crees[0]?.["notes"]), /à chiffrer/i);
  });

  it("reporte le drapeau « sur devis » — le PDF ne doit jamais promettre la gratuité", async () => {
    const fake = fakePrisma({
      commande: { deliveryFeeCents: 0, deliveryFeeSurDevis: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { quote } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    // Le drapeau est PERSISTÉ : la note libre vit hors du tableau des totaux,
    // c'est la ligne de prix qui engage le signataire.
    assert.equal(fake.crees[0]?.["livraisonSurDevis"], true);
    // Et il redescend en libellé explicite jusqu'au PDF et à la facture, qui
    // sinon déduisent « Livraison offerte » du seul montant de 0 €.
    assert.match(quote.livraisonLabel, /sur devis/i);
    assert.doesNotMatch(quote.livraisonLabel, /offerte/i);
  });

  it("dit « offerte » quand la livraison l'est vraiment", async () => {
    const fake = fakePrisma({
      commande: { deliveryFeeCents: 0, deliveryFeeSurDevis: false },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { quote } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    assert.equal(fake.crees[0]?.["livraisonSurDevis"], false);
    assert.match(quote.livraisonLabel, /offerte/i);
  });
});

// ---- Conversion devis → commande -------------------------------------------

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

/** Prisma minimal pour `convert()` : un devis ACCEPTE, un produit, une commande. */
function fakePrismaConversion(devis: Record<string, unknown>) {
  const commandes: Record<string, unknown>[] = [];

  const tx = {
    order: {
      create: (args: { data: Record<string, unknown> }) => {
        commandes.push(args.data);
        return Promise.resolve({ id: "order-neuf", ...args.data });
      },
    },
    // `updateMany` et non `update` : la conversion écrit le lien sous condition
    // `convertedToOrderId: null`, pour que la BASE tranche une course entre
    // deux conversions simultanées. `count: 1` = course gagnée.
    quote: { updateMany: () => Promise.resolve({ count: 1 }) },
  };

  return {
    commandes,
    client: {
      quote: {
        findFirst: () =>
          Promise.resolve({
            id: QUOTE_ID,
            status: "ACCEPTE",
            userId: "client-1",
            convertedToOrderId: null,
            lignes: [{ id: LINE_ID, designation: "Kit Bain", qty: 2, unitCents: 750 }],
            ...devis,
          }),
      },
      // Le client doit être vivant : la conversion le vérifie désormais avant de
      // créer une commande à son nom.
      user: { findFirst: () => Promise.resolve({ id: "client-1" }) },
      order: { findFirst: () => Promise.resolve(null) },
      product: {
        findMany: () => Promise.resolve([{ id: PRODUCT_ID, priceCents: 750 }]),
      },
      auditLog: { create: () => Promise.resolve({ id: "audit-1" }) },
      $transaction: <T>(fn: (client: unknown) => Promise<T>): Promise<T> => fn(tx),
    },
  };
}

const CONVERSION = {
  deliveryDate: "2026-08-15",
  lineMappings: [{ quoteLineId: LINE_ID, productId: PRODUCT_ID }],
};

describe("QuotesService.convert", () => {
  it("repose le drapeau « sur devis » sur la commande créée", async () => {
    // Un devis à 0 € JAMAIS chiffré produisait une commande qui se relisait
    // partout « livraison offerte » : la boucle commande → devis → commande
    // perdait en route la seule information qui distingue les deux cas.
    const fake = fakePrismaConversion({ livraisonCents: 0, livraisonSurDevis: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    await service.convert(QUOTE_ID, OPERATOR_ID, CONVERSION, ADMIN_ID);

    assert.equal(fake.commandes[0]?.["deliveryFeeCents"], 0);
    assert.equal(fake.commandes[0]?.["deliveryFeeSurDevis"], true);
  });

  it("laisse le drapeau à faux quand les frais ont été chiffrés", async () => {
    const fake = fakePrismaConversion({ livraisonCents: 1200, livraisonSurDevis: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    await service.convert(QUOTE_ID, OPERATOR_ID, CONVERSION, ADMIN_ID);

    assert.equal(fake.commandes[0]?.["deliveryFeeCents"], 1200);
    assert.equal(fake.commandes[0]?.["deliveryFeeSurDevis"], false);
  });

  it("réémet un devis quand le précédent a été supprimé", async () => {
    const fake = fakePrisma({
      commande: { quoteFromOrder: devisExistant({ deletedAt: new Date("2026-07-29T12:00:00Z") }) },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { created } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);

    assert.equal(created, true);
    // Le lien unique du brouillon jeté est libéré, sinon la réémission serait
    // impossible à jamais.
    assert.ok(fake.journal.some((e) => e.modele === "quote" && e.operation === "update"));
  });

  it("refuse une commande annulée", async () => {
    const fake = fakePrisma({ commande: { status: "CANCELLED" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    // Chiffrer une commande à laquelle le client a renoncé enverrait un document
    // qui contredit son annulation.
    await assert.rejects(() => service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID), {
      code: "ORDER_CANCELLED",
    });
    assert.equal(fake.creations, 0);
  });

  it("accepte une commande encore PENDING — on chiffre souvent avant de confirmer", async () => {
    const fake = fakePrisma({ commande: { status: "PENDING" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    const { created } = await service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID);
    assert.equal(created, true);
  });

  it("refuse une commande d'un autre opérateur", async () => {
    const fake = fakePrisma({ commande: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new QuotesService(fake.client as any);

    await assert.rejects(
      () => service.createFromOrder(ORDER_ID, OPERATOR_ID, ADMIN_ID),
      /Commande/,
    );
  });
});
