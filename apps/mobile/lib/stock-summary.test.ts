/**
 * Le bug d'origine : le client voyait « Pas de stock » alors qu'il avait du
 * linge chez lui. Ces tests fixent la règle de repli et, surtout, ce qu'on
 * refuse d'inventer — un propre/sale fabriqué serait pire que pas de chiffre.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildClientStockView,
  isOpenRotation,
  openRotationItems,
  summarizeRanges,
  type RotationLike,
  type StockRangeLine,
} from "./stock-summary.ts";

const range = (over: Partial<StockRangeLine> = {}): StockRangeLine => ({
  productRange: "KIT_BAIN",
  cleanSets: 0,
  dirtySets: 0,
  totalInCirculation: 0,
  ...over,
});

describe("summarizeRanges", () => {
  it("additionne les gammes", () => {
    const totals = summarizeRanges([
      range({ productRange: "KIT_BAIN", cleanSets: 4, dirtySets: 2, totalInCirculation: 8 }),
      range({ productRange: "KIT_LIT", cleanSets: 1, dirtySets: 1, totalInCirculation: 3 }),
    ]);
    assert.deepEqual(totals, { inCirculation: 11, clean: 5, dirty: 3, inTransit: 3 });
  });

  it("calcule le transit gamme par gamme", () => {
    // Globalement 10 − 9 − 0 = 1, mais le linge en route est bien de 2 : la
    // gamme excédentaire ne doit pas absorber le transit de l'autre.
    const totals = summarizeRanges([
      range({ productRange: "KIT_BAIN", cleanSets: 9, dirtySets: 0, totalInCirculation: 8 }),
      range({ productRange: "KIT_LIT", cleanSets: 0, dirtySets: 0, totalInCirculation: 2 }),
    ]);
    assert.equal(totals.inTransit, 2);
  });

  it("ne renvoie jamais un transit négatif", () => {
    const totals = summarizeRanges([range({ cleanSets: 5, dirtySets: 5, totalInCirculation: 4 })]);
    assert.equal(totals.inTransit, 0);
  });
});

describe("openRotationItems", () => {
  const rotation = (over: Partial<RotationLike> = {}): RotationLike => ({
    status: "LIVREE",
    lignes: [],
    ...over,
  });

  it("compte ce qui est livré et pas encore repris", () => {
    const items = openRotationItems([
      rotation({
        lignes: [
          { designation: "Kit bain", qtyLivree: 6, qtyReprise: 2 },
          { designation: "Kit lit", qtyLivree: 3, qtyReprise: null },
        ],
      }),
    ]);
    assert.deepEqual(items, [
      { designation: "Kit bain", quantity: 4 },
      { designation: "Kit lit", quantity: 3 },
    ]);
  });

  it("ignore les rotations clôturées", () => {
    const items = openRotationItems([
      rotation({ status: "REPRISE", lignes: [{ designation: "Kit bain", qtyLivree: 6 }] }),
      rotation({ status: "ANNULEE", lignes: [{ designation: "Kit lit", qtyLivree: 4 }] }),
    ]);
    assert.deepEqual(items, []);
  });

  it("garde une rotation au statut inconnu du mobile", () => {
    // Mieux vaut afficher une rotation de trop qu'en cacher une dont le client
    // attend la reprise : même parti pris que la carte « Mon linge ».
    const items = openRotationItems([
      rotation({ status: "STATUT_FUTUR", lignes: [{ designation: "Kit bain", qtyLivree: 2 }] }),
    ]);
    assert.deepEqual(items, [{ designation: "Kit bain", quantity: 2 }]);
  });

  it("cumule la même désignation sur plusieurs rotations", () => {
    const items = openRotationItems([
      rotation({ lignes: [{ designation: "Kit bain", qtyLivree: 2 }] }),
      rotation({ status: "EN_RETARD", lignes: [{ designation: "Kit bain", qtyLivree: 3 }] }),
    ]);
    assert.deepEqual(items, [{ designation: "Kit bain", quantity: 5 }]);
  });

  it("borne une reprise supérieure à la livraison", () => {
    // Saisie erronée d'un livreur : elle ne doit pas venir en déduction d'un
    // autre article et faire disparaître du linge réellement chez le client.
    const items = openRotationItems([
      rotation({
        lignes: [
          { designation: "Kit bain", qtyLivree: 2, qtyReprise: 5 },
          { designation: "Kit lit", qtyLivree: 4, qtyReprise: 0 },
        ],
      }),
    ]);
    assert.deepEqual(items, [{ designation: "Kit lit", quantity: 4 }]);
  });

  it("tolère une rotation sans lignes", () => {
    assert.deepEqual(openRotationItems([{ status: "LIVREE" }]), []);
  });

  it("classe les articles du plus nombreux au moins nombreux", () => {
    const items = openRotationItems([
      rotation({
        lignes: [
          { designation: "Kit lit", qtyLivree: 1 },
          { designation: "Kit bain", qtyLivree: 9 },
        ],
      }),
    ]);
    assert.deepEqual(
      items.map((i) => i.designation),
      ["Kit bain", "Kit lit"],
    );
  });
});

describe("isOpenRotation", () => {
  it("clôt uniquement REPRISE et ANNULEE", () => {
    assert.equal(isOpenRotation({ status: "REPRISE" }), false);
    assert.equal(isOpenRotation({ status: "ANNULEE" }), false);
    assert.equal(isOpenRotation({ status: "LIVREE" }), true);
    assert.equal(isOpenRotation({ status: "EN_RETARD" }), true);
  });
});

describe("buildClientStockView", () => {
  it("fait foi sur les agrégats serveur quand ils existent", () => {
    const view = buildClientStockView({
      stocks: [range({ cleanSets: 3, dirtySets: 1, totalInCirculation: 5 })],
      rotations: [{ status: "LIVREE", lignes: [{ designation: "Kit bain", qtyLivree: 99 }] }],
    });
    assert.equal(view.source, "server");
    assert.equal(view.totals.inCirculation, 5);
    assert.equal(view.totals.clean, 3);
    assert.equal(view.items.length, 0);
  });

  it("retombe sur les rotations quand la table d'agrégats est vide", () => {
    // Le cas réel : la validation d'un arrêt n'écrit que des mouvements, pas de
    // ligne `client_stocks`. Le client a bien du linge chez lui.
    const view = buildClientStockView({
      stocks: [],
      rotations: [
        {
          status: "LIVREE",
          lignes: [
            { designation: "Kit bain", qtyLivree: 6, qtyReprise: 1 },
            { designation: "Kit lit", qtyLivree: 2 },
          ],
        },
      ],
    });
    assert.equal(view.source, "rotations");
    assert.equal(view.totals.inCirculation, 7);
    assert.deepEqual(view.items, [
      { designation: "Kit bain", quantity: 5 },
      { designation: "Kit lit", quantity: 2 },
    ]);
  });

  it("n'invente PAS de ventilation propre / sale depuis les rotations", () => {
    const view = buildClientStockView({
      rotations: [{ status: "LIVREE", lignes: [{ designation: "Kit bain", qtyLivree: 4 }] }],
    });
    assert.equal(view.totals.clean, null);
    assert.equal(view.totals.dirty, null);
    assert.equal(view.totals.inTransit, null);
  });

  it("dit « rien » quand il n'y a réellement rien", () => {
    const view = buildClientStockView({ stocks: [], rotations: [] });
    assert.equal(view.source, "none");
    assert.equal(view.totals.inCirculation, 0);
  });

  it("dit « rien » quand toutes les rotations sont soldées", () => {
    const view = buildClientStockView({
      rotations: [
        { status: "LIVREE", lignes: [{ designation: "Kit bain", qtyLivree: 4, qtyReprise: 4 }] },
      ],
    });
    assert.equal(view.source, "none");
  });

  it("traite l'absence de données comme un vide, pas comme un plantage", () => {
    // `null` = requête désactivée ou route renvoyant null pour ce rôle.
    const view = buildClientStockView({ stocks: null, rotations: null });
    assert.equal(view.source, "none");
    assert.deepEqual(view.ranges, []);
  });
});
