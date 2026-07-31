import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  consumedTotals,
  deliveryFeeLine,
  orderTotals,
  TOTAL_HORS_LIVRAISON_LABEL,
} from "./order-total.ts";

/** Formateur minimal — le vrai vit dans `lib/api.ts` (React Native). */
const fmt = (cents: number) => `${(cents / 100).toFixed(2)} €`;

describe("orderTotals", () => {
  it("additionne les frais au sous-total", () => {
    const t = orderTotals({ totalCents: 5800, deliveryFeeCents: 900 });
    assert.equal(t.subtotalCents, 5800);
    assert.equal(t.deliveryFeeCents, 900);
    assert.equal(t.totalCents, 6700);
    assert.equal(t.showBreakdown, true);
    assert.equal(t.deliveryOffered, false);
  });

  it("annonce « livraison offerte » sur des frais nuls, jamais un zéro muet", () => {
    const t = orderTotals({ totalCents: 5800, deliveryFeeCents: 0 });
    assert.equal(t.deliveryOffered, true);
    assert.equal(t.showBreakdown, true);
    assert.equal(t.totalCents, 5800);
  });

  it("n'affiche rien tant que l'API ne renvoie pas les frais", () => {
    // Absence ≠ gratuité : une commande antérieure au champ ne doit pas
    // afficher « Livraison offerte », ce serait une promesse inventée.
    for (const order of [
      { totalCents: 5800 },
      { totalCents: 5800, deliveryFeeCents: null },
      { totalCents: 5800, deliveryFeeCents: undefined },
    ]) {
      const t = orderTotals(order);
      assert.equal(t.deliveryFeeCents, null);
      assert.equal(t.showBreakdown, false);
      assert.equal(t.deliveryOffered, false);
      assert.equal(t.totalCents, 5800, "le total reste le sous-total");
    }
  });

  it("traite une valeur aberrante comme inconnue", () => {
    for (const fee of [-100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const t = orderTotals({ totalCents: 1000, deliveryFeeCents: fee });
      assert.equal(t.deliveryFeeCents, null, `frais ${String(fee)}`);
      assert.equal(t.totalCents, 1000);
    }
  });

  it("ne propage pas un sous-total invalide dans le total", () => {
    const t = orderTotals({ totalCents: Number.NaN, deliveryFeeCents: 500 });
    assert.equal(t.subtotalCents, 0);
    assert.equal(t.totalCents, 500);
  });

  it("ne dit JAMAIS « offerte » sur une course à chiffrer", () => {
    // Les deux formes du contrat serveur : colonnes brutes (liste) et résumé
    // `deliveryFee` (fiche + création). Toutes deux valent 0 € sans gratuité.
    for (const order of [
      { totalCents: 5800, deliveryFeeCents: 0, deliveryFeeSurDevis: true },
      {
        totalCents: 5800,
        deliveryFeeCents: 0,
        deliveryFee: { cents: 0, label: "Livraison — sur devis", surDevis: true },
      },
    ]) {
      const t = orderTotals(order);
      assert.equal(t.deliveryFeeSurDevis, true);
      assert.equal(t.deliveryOffered, false, "0 € sur devis n'est pas une livraison offerte");
      assert.equal(t.showBreakdown, true, "il y a quelque chose à dire : « à confirmer »");
      assert.equal(t.totalCents, 5800, "le total ne gonfle d'aucun montant inventé");
      assert.equal(t.totalLabel, TOTAL_HORS_LIVRAISON_LABEL);
    }
  });

  it("préfère le résumé `deliveryFee` aux colonnes brutes", () => {
    const t = orderTotals({
      totalCents: 5800,
      deliveryFeeCents: 0,
      deliveryFee: { cents: 1200, label: "Livraison — 12,00 €", surDevis: false },
    });
    assert.equal(t.deliveryFeeCents, 1200);
    assert.equal(t.totalCents, 7000);
    assert.equal(t.deliveryFeeSurDevis, false);
    assert.equal(t.totalLabel, "Total");
  });

  it("libelle le total « hors livraison » uniquement sur devis", () => {
    assert.equal(orderTotals({ totalCents: 100, deliveryFeeCents: 0 }).totalLabel, "Total");
    assert.equal(orderTotals({ totalCents: 100 }).totalLabel, "Total");
  });
});

describe("deliveryFeeLine", () => {
  it("annonce des frais à confirmer plutôt qu'une livraison offerte", () => {
    const line = deliveryFeeLine(
      orderTotals({ totalCents: 5800, deliveryFeeCents: 0, deliveryFeeSurDevis: true }),
      fmt,
    );
    assert.match(line, /à confirmer/);
    assert.doesNotMatch(line, /offerte/);
  });

  it("garde les trois autres cas intacts", () => {
    assert.equal(
      deliveryFeeLine(orderTotals({ totalCents: 5800, deliveryFeeCents: 0 }), fmt),
      "Livraison offerte",
    );
    assert.equal(
      deliveryFeeLine(orderTotals({ totalCents: 5800, deliveryFeeCents: 1200 }), fmt),
      "Dont 12.00 € de frais de livraison",
    );
    assert.equal(deliveryFeeLine(orderTotals({ totalCents: 5800 }), fmt), "");
  });
});

describe("consumedTotals", () => {
  it("compte à part les commandes dont la livraison reste à chiffrer", () => {
    const c = consumedTotals([
      { totalCents: 5800, deliveryFeeCents: 1200 },
      { totalCents: 4000, deliveryFeeCents: 0 },
      { totalCents: 3000, deliveryFeeCents: 0, deliveryFeeSurDevis: true },
    ]);
    assert.equal(c.totalCents, 14000);
    assert.equal(c.surDevisCount, 1, "l'écran doit pouvoir dire que le cumul est incomplet");
  });

  it("ne signale rien quand tous les frais sont connus", () => {
    const c = consumedTotals([{ totalCents: 1000, deliveryFeeCents: 0 }]);
    assert.equal(c.surDevisCount, 0);
    assert.equal(c.totalCents, 1000);
  });
});
