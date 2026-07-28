/**
 * Totaux de devis : remise en centièmes de pourcentage, TVA optionnelle,
 * arrondis. C'est le calcul que le contrat rejoue pour vérifier la concordance.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeDevisTotals,
  countKits,
  printableField,
  resolveLivraisonLabel,
  BLANK_PLACEHOLDER,
  type DevisData,
} from "./devis.ts";

function devis(over: Partial<DevisData> = {}): DevisData {
  return {
    numero: "LSQ-2026-0007",
    date: "2026-07-28",
    validiteJours: 30,
    client: { nom: "Gîte des Oliviers" },
    lines: [{ designation: "Kit Complet (Bain + Lit)", qty: 4, unitCents: 2900 }],
    remisePct: 0,
    livraisonCents: 0,
    tvaApplicable: false,
    ...over,
  };
}

describe("computeDevisTotals", () => {
  it("somme les lignes sans remise ni livraison", () => {
    const t = computeDevisTotals(devis());
    assert.equal(t.sousTotal, 11600);
    assert.equal(t.remise, 0);
    assert.equal(t.totalHT, 11600);
    assert.equal(t.tva, 0);
    assert.equal(t.totalTTC, 11600);
  });

  it("interprète remisePct en centièmes de pourcentage (1000 = 10 %)", () => {
    const t = computeDevisTotals(devis({ remisePct: 1000 }));
    assert.equal(t.remise, 1160);
    assert.equal(t.totalHT, 10440);
  });

  it("gère un demi-pourcent (50 = 0,5 %)", () => {
    const t = computeDevisTotals(devis({ remisePct: 50 }));
    assert.equal(t.remise, 58, "11600 × 0,5 % = 58 centimes");
  });

  it("ajoute les frais de livraison après remise", () => {
    const t = computeDevisTotals(devis({ remisePct: 1000, livraisonCents: 2500 }));
    assert.equal(t.totalHT, 11600 - 1160 + 2500);
  });

  it("applique 20 % de TVA sur le total HT quand elle est applicable", () => {
    const t = computeDevisTotals(devis({ tvaApplicable: true }));
    assert.equal(t.tva, 2320);
    assert.equal(t.totalTTC, 13920);
  });

  it("arrondit la TVA au centime le plus proche", () => {
    // 3 × 3,33 € = 9,99 € ; TVA = 199,8 centimes → 200.
    const t = computeDevisTotals(
      devis({
        lines: [{ designation: "Article", qty: 3, unitCents: 333 }],
        tvaApplicable: true,
      }),
    );
    assert.equal(t.sousTotal, 999);
    assert.equal(t.tva, 200);
    assert.equal(t.totalTTC, 1199);
  });

  it("arrondit chaque ligne avant de sommer (quantité décimale)", () => {
    const t = computeDevisTotals(
      devis({ lines: [{ designation: "Article", qty: 1.5, unitCents: 333 }] }),
    );
    assert.equal(t.sousTotal, 500, "1,5 × 333 = 499,5 → 500");
  });

  it("renvoie zéro sur un devis vide", () => {
    const t = computeDevisTotals(devis({ lines: [] }));
    assert.equal(t.sousTotal, 0);
    assert.equal(t.totalTTC, 0);
  });
});

describe("countKits", () => {
  it("ne compte que les lignes désignant un kit", () => {
    const n = countKits([
      { designation: "Kit Bain", qty: 2 },
      { designation: "Kit Complet (Bain + Lit)", qty: 3 },
      { designation: "Serviette de toilette", qty: 10 },
    ]);
    assert.equal(n, 5);
  });

  it("ignore la casse mais pas les mots contenant « kit »", () => {
    assert.equal(countKits([{ designation: "KIT bain", qty: 1 }]), 1);
    assert.equal(
      countKits([{ designation: "Kitchenette", qty: 4 }]),
      0,
      "« kit » doit être un mot entier",
    );
  });
});

describe("resolveLivraisonLabel", () => {
  it("préfère le libellé explicite du devis", () => {
    const label = resolveLivraisonLabel({
      livraisonCents: 2500,
      livraisonLabel: "Livraison négociée sur place",
    });
    assert.equal(label, "Livraison négociée sur place");
  });

  it("déduit le libellé du montant quand il n'est pas connu", () => {
    assert.match(resolveLivraisonLabel({ livraisonCents: 2500 }), /Express 24 h/);
  });

  it("ignore un libellé vide ou blanc", () => {
    assert.equal(
      resolveLivraisonLabel({ livraisonCents: 0, livraisonLabel: "   " }),
      "Livraison offerte",
    );
  });
});

describe("printableField", () => {
  it("rend la valeur quand elle est saisie", () => {
    assert.equal(printableField("  Marie  "), "Marie");
  });

  it("rend un tiret quand le champ est vide en mode normal", () => {
    assert.equal(printableField("", false), "—");
    assert.equal(printableField(undefined), "—");
  });

  it("rend des pointillés en mode « à compléter »", () => {
    assert.equal(printableField("", true), BLANK_PLACEHOLDER);
    assert.equal(printableField(null, true), BLANK_PLACEHOLDER);
  });

  it("accepte un repli personnalisé", () => {
    assert.equal(printableField("", false, "…"), "…");
  });
});
