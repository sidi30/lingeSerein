/**
 * Règles métier des rotations et du stock par slug, testées sans base.
 *
 * Trois points sensibles couverts ici :
 *  - une facture ne porte pas que du linge (remise, frais de livraison, mentions) :
 *    ces lignes ne doivent jamais devenir des articles « à reprendre » ;
 *  - annuler une rotation n'est PAS la reprendre avec 0 : la première remet le
 *    linge en stock, la seconde le compte en perte. Les confondre transforme
 *    chaque saisie corrigée en perte sèche de parc ;
 *  - la rotation créée AUTOMATIQUEMENT depuis une commande ne sort le linge du
 *    parc qu'à la livraison réelle. C'est la règle qui empêche une commande
 *    prévue dans dix jours de vider le stock aujourd'hui.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { linesFromInvoiceMetadata, RotationsService } from "./rotations.service.ts";
import { computeDisponible, StockItemsService } from "./stock-items.service.ts";

describe("linesFromInvoiceMetadata", () => {
  it("convertit les lignes de linge et résout les slugs du catalogue", () => {
    const lignes = linesFromInvoiceMetadata({
      lines: [
        { designation: "Kit Bain", qty: 4, unitCents: 750, totalCents: 3000 },
        { designation: "Housse de couette", qty: 2, unitCents: 900, totalCents: 1800 },
      ],
    });

    assert.equal(lignes.length, 2);
    assert.equal(lignes[0]?.productSlug, "kit-bain");
    assert.equal(lignes[0]?.qtyLivree, 4);
    assert.equal(lignes[1]?.productSlug, "housse-couette");
  });

  it("écarte les lignes sans quantité — un forfait de livraison ne se reprend pas", () => {
    const lignes = linesFromInvoiceMetadata({
      lines: [
        { designation: "Kit Bain", qty: 2, unitCents: 750 },
        { designation: "Livraison Express 24 h — forfait", qty: 0, unitCents: 2500 },
      ],
    });

    assert.equal(lignes.length, 1);
    assert.equal(lignes[0]?.designation, "Kit Bain");
  });

  it("conserve une ligne non résolue, sans slug, plutôt que de la deviner", () => {
    const lignes = linesFromInvoiceMetadata({
      lines: [{ designation: "Prestation de repassage", qty: 3, unitCents: 500 }],
    });

    assert.equal(lignes.length, 1);
    assert.equal(lignes[0]?.productSlug, null, "aucun slug ne doit être inventé");
    assert.equal(lignes[0]?.designation, "Prestation de repassage");
  });

  it("accepte la forme de lignes écrite par le worker d'abonnement", () => {
    const lignes = linesFromInvoiceMetadata({
      lines: [{ product: "Kit Lit", quantity: 5, unitCents: 1650 }],
    });

    assert.equal(lignes[0]?.designation, "Kit Lit");
    assert.equal(lignes[0]?.qtyLivree, 5);
    assert.equal(lignes[0]?.productSlug, "kit-lit");
  });

  it("tolère une facture sans lignes", () => {
    assert.deepEqual(linesFromInvoiceMetadata({}), []);
    assert.deepEqual(linesFromInvoiceMetadata({ lines: [] }), []);
  });

  it("numérote les positions dans l'ordre de la facture", () => {
    const lignes = linesFromInvoiceMetadata({
      lines: [
        { designation: "Kit Bain", qty: 1, unitCents: 750 },
        { designation: "Kit Lit", qty: 1, unitCents: 1650 },
      ],
    });
    assert.deepEqual(
      lignes.map((l) => l.position),
      [0, 1],
    );
  });
});

describe("computeDisponible", () => {
  it("retranche circulation, sale et réforme du parc possédé", () => {
    assert.equal(
      computeDisponible({ totalOwned: 100, inCirculation: 30, dirtyPending: 10, retired: 5 }),
      55,
    );
  });

  it("laisse le disponible NÉGATIF quand le parc est sur-engagé", () => {
    // Volontaire : un négatif signale un inventaire sous-déclaré. Le borner à 0
    // masquerait le défaut précisément là où il doit alerter.
    assert.equal(
      computeDisponible({ totalOwned: 10, inCirculation: 20, dirtyPending: 0, retired: 0 }),
      -10,
    );
  });
});

/** Faux client transactionnel : enregistre les upserts sans base. */
function fakeTx() {
  const calls: { slug: string; create: Record<string, number>; update: Record<string, number> }[] =
    [];
  return {
    calls,
    tx: {
      stockItem: {
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { operatorId_productSlug: { productSlug: string } };
          create: Record<string, unknown>;
          update: Record<string, { increment: number }>;
        }) => {
          calls.push({
            slug: where.operatorId_productSlug.productSlug,
            create: create as Record<string, number>,
            update: Object.fromEntries(
              Object.entries(update).map(([k, v]) => [k, v.increment]),
            ) as Record<string, number>,
          });
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("mouvements de stock d'une rotation", () => {
  it("la sortie met le linge en circulation", async () => {
    const { tx, calls } = fakeTx();
    await StockItemsService.recordSortie(tx, "op-1", [{ productSlug: "kit-bain", qtyLivree: 4 }]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.update["inCirculation"], 4);
  });

  it("ignore une ligne sans slug — stock incomplet plutôt que stock faux", async () => {
    const { tx, calls } = fakeTx();
    await StockItemsService.recordSortie(tx, "op-1", [{ productSlug: null, qtyLivree: 10 }]);
    assert.equal(calls.length, 0);
  });

  it("la reprise complète sort de circulation et alimente le sale", async () => {
    const { tx, calls } = fakeTx();
    await StockItemsService.recordReprise(tx, "op-1", [
      { productSlug: "kit-bain", qtyLivree: 4, qtyReprise: 4 },
    ]);

    assert.equal(calls[0]?.update["inCirculation"], -4);
    assert.equal(calls[0]?.update["dirtyPending"], 4);
    assert.equal(calls[0]?.update["retired"], undefined, "rien de perdu");
  });

  it("la reprise partielle porte le manquant en perte", async () => {
    const { tx, calls } = fakeTx();
    await StockItemsService.recordReprise(tx, "op-1", [
      { productSlug: "kit-bain", qtyLivree: 4, qtyReprise: 3 },
    ]);

    assert.equal(calls[0]?.update["inCirculation"], -4, "tout sort de circulation");
    assert.equal(calls[0]?.update["dirtyPending"], 3);
    assert.equal(calls[0]?.update["retired"], 1, "le manquant est une perte");
  });

  it("l'annulation rend le linge disponible SANS le compter en perte", async () => {
    // Différence essentielle avec une reprise à 0 : le linge n'est jamais parti.
    const { tx, calls } = fakeTx();
    await StockItemsService.recordAnnulation(tx, "op-1", [
      { productSlug: "kit-bain", qtyLivree: 4 },
    ]);

    assert.equal(calls[0]?.update["inCirculation"], -4);
    assert.equal(calls[0]?.update["dirtyPending"], undefined);
    assert.equal(calls[0]?.update["retired"], undefined, "une annulation n'est pas une perte");
  });

  it("une reprise à 0 compte bien tout en perte, elle", async () => {
    const { tx, calls } = fakeTx();
    await StockItemsService.recordReprise(tx, "op-1", [
      { productSlug: "kit-bain", qtyLivree: 4, qtyReprise: 0 },
    ]);
    assert.equal(calls[0]?.update["retired"], 4);
  });
});

// ============================================================================
// Rotation automatique depuis la commande
// ============================================================================

interface CommandeFactice {
  id: string;
  orderNumber: string;
  status: string;
  isRecurring: boolean;
  deliveryDate: Date;
  deletedAt: null;
  items: { quantity: number; product: { slug: string | null; name: string } }[];
  user: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    address: string | null;
    operatorId: string;
    subscription: { status: string } | null;
  };
  deliveryStop: { id: string; completedAt: Date | null } | null;
  quote: { id: string } | null;
  rotation: RotationFactice | null;
}

interface RotationFactice {
  id: string;
  status: string;
  dateLivraison: Date;
  dateReprisePrevue: Date;
  sortieStockAt: Date | null;
  lignes: { productSlug: string | null; qtyLivree: number }[];
}

/**
 * Faux Prisma tenant UNE commande et sa rotation en mémoire.
 *
 * Volontairement minimal : on ne rejoue pas Prisma, on vérifie les trois
 * décisions qui coûtent cher — l'échéance de reprise calculée, le moment du
 * mouvement de stock, et l'absence de doublon.
 */
function fakePrisma(commande: CommandeFactice) {
  const mouvements: { type: "sortie" | "annulation"; qty: number }[] = [];
  const rotationsCreees: Record<string, unknown>[] = [];

  const prisma = {
    order: {
      findFirst: async () => commande,
      findMany: async () => [{ id: commande.id }],
      count: async () => 1,
    },
    rotation: {
      findFirst: async () => commande.rotation,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        rotationsCreees.push(data);
        const cree: RotationFactice = {
          id: "rot-1",
          status: data.status as string,
          dateLivraison: data.dateLivraison as Date,
          dateReprisePrevue: data.dateReprisePrevue as Date,
          sortieStockAt: (data.sortieStockAt as Date | undefined) ?? null,
          lignes: (data.lignes as { create: RotationFactice["lignes"] }).create,
        };
        commande.rotation = cree;
        return cree;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const r = commande.rotation as RotationFactice;
        Object.assign(r, data);
        return r;
      },
    },
    stockItem: {
      upsert: async ({ update }: { update: Record<string, { increment: number }> }) => {
        const delta = update["inCirculation"]?.increment ?? 0;
        mouvements.push({ type: delta > 0 ? "sortie" : "annulation", qty: delta });
      },
    },
    auditLog: { create: async () => undefined },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { prisma, mouvements, rotationsCreees };
}

function commandeFactice(over: Partial<CommandeFactice> = {}): CommandeFactice {
  return {
    id: "cmd-1",
    orderNumber: "LNG-2026-000001",
    status: "CONFIRMED",
    isRecurring: false,
    deliveryDate: new Date("2026-08-05T00:00:00.000Z"),
    deletedAt: null,
    items: [{ quantity: 3, product: { slug: "kit-bain", name: "Kit Bain" } }],
    user: {
      id: "user-1",
      name: "Contact",
      companyName: "Hôtel du Pont",
      email: "hotel@example.fr",
      address: "12 rue d'Orange",
      operatorId: "op-1",
      subscription: null,
    },
    deliveryStop: null,
    quote: null,
    rotation: null,
    ...over,
  };
}

describe("rotation automatique depuis une commande", () => {
  it("crée une rotation PLANIFIEE sans toucher au stock, échéance à 7 j en ponctuel", async () => {
    const commande = commandeFactice();
    const { prisma, mouvements } = fakePrisma(commande);

    const bilan = await new RotationsService(prisma).syncFromOrder("cmd-1");

    assert.equal(bilan.created, true);
    assert.equal(commande.rotation?.status, "PLANIFIEE");
    assert.equal(
      commande.rotation?.dateReprisePrevue.toISOString().slice(0, 10),
      "2026-08-12",
      "7 jours de détention en location ponctuelle",
    );
    assert.deepEqual(mouvements, [], "le linge n'est pas encore sorti : le parc ne bouge pas");
    assert.equal(commande.rotation?.sortieStockAt, null);
  });

  it("donne 14 jours à un abonné", async () => {
    const commande = commandeFactice({
      user: { ...commandeFactice().user, subscription: { status: "ACTIVE" } },
    });
    const { prisma } = fakePrisma(commande);

    await new RotationsService(prisma).syncFromOrder("cmd-1");

    assert.equal(commande.rotation?.dateReprisePrevue.toISOString().slice(0, 10), "2026-08-19");
  });

  it("ne recrée rien quand la rotation existe déjà", async () => {
    const commande = commandeFactice();
    const { prisma, rotationsCreees } = fakePrisma(commande);
    const service = new RotationsService(prisma);

    await service.syncFromOrder("cmd-1");
    const second = await service.syncFromOrder("cmd-1");

    assert.equal(rotationsCreees.length, 1, "une commande ne sort qu'une fois son linge");
    assert.equal(second.created, false);
  });

  it("sort le linge du parc à la livraison, une seule fois", async () => {
    const commande = commandeFactice();
    const { prisma, mouvements } = fakePrisma(commande);
    const service = new RotationsService(prisma);

    await service.syncFromOrder("cmd-1");
    commande.status = "DELIVERED";
    const bilan = await service.syncFromOrder("cmd-1");

    assert.equal(bilan.livree, true);
    assert.equal(commande.rotation?.status, "LIVREE");
    assert.deepEqual(mouvements, [{ type: "sortie", qty: 3 }]);

    // Rejeu du cron sur la même commande : aucun second mouvement.
    await service.syncFromOrder("cmd-1");
    assert.equal(mouvements.length, 1, "le stock ne se décrémente pas deux fois");
  });

  it("recale l'échéance sur la date de livraison RÉELLE de l'arrêt de tournée", async () => {
    const commande = commandeFactice();
    const { prisma } = fakePrisma(commande);
    const service = new RotationsService(prisma);

    await service.syncFromOrder("cmd-1");
    commande.status = "DELIVERED";
    // Livré avec deux jours de retard sur la date prévue.
    commande.deliveryStop = { id: "stop-1", completedAt: new Date("2026-08-07T09:30:00.000Z") };
    await service.syncFromOrder("cmd-1");

    assert.equal(commande.rotation?.dateLivraison.toISOString().slice(0, 10), "2026-08-07");
    assert.equal(
      commande.rotation?.dateReprisePrevue.toISOString().slice(0, 10),
      "2026-08-14",
      "les 7 jours courent depuis la livraison réelle, pas depuis la date prévue",
    );
  });

  it("n'ouvre aucune rotation pour une commande encore à valider", async () => {
    const commande = commandeFactice({ status: "PENDING" });
    const { prisma, rotationsCreees } = fakePrisma(commande);

    const bilan = await new RotationsService(prisma).syncFromOrder("cmd-1");

    assert.equal(bilan.created, false);
    assert.equal(rotationsCreees.length, 0);
  });

  it("annule sans rendre au stock un linge qui n'en était jamais sorti", async () => {
    const commande = commandeFactice();
    const { prisma, mouvements } = fakePrisma(commande);
    const service = new RotationsService(prisma);

    await service.syncFromOrder("cmd-1");
    commande.status = "CANCELLED";
    const bilan = await service.syncFromOrder("cmd-1");

    assert.equal(bilan.annulee, true);
    assert.equal(commande.rotation?.status, "ANNULEE");
    assert.deepEqual(mouvements, [], "créditer ici inventerait du linge");
  });

  it("annule EN rendant au stock un linge déjà livré", async () => {
    const commande = commandeFactice({ status: "DELIVERED" });
    const { prisma, mouvements } = fakePrisma(commande);
    const service = new RotationsService(prisma);

    await service.syncFromOrder("cmd-1");
    commande.status = "CANCELLED";
    await service.syncFromOrder("cmd-1");

    assert.deepEqual(mouvements, [
      { type: "sortie", qty: 3 },
      { type: "annulation", qty: -3 },
    ]);
  });
});
