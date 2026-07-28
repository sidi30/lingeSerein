/**
 * Règles métier des rotations et du stock par slug, testées sans base.
 *
 * Deux points sensibles couverts ici :
 *  - une facture ne porte pas que du linge (remise, frais de livraison, mentions) :
 *    ces lignes ne doivent jamais devenir des articles « à reprendre » ;
 *  - annuler une rotation n'est PAS la reprendre avec 0 : la première remet le
 *    linge en stock, la seconde le compte en perte. Les confondre transforme
 *    chaque saisie corrigée en perte sèche de parc.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { linesFromInvoiceMetadata } from "./rotations.service.ts";
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
