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
  resolveLivraisonMontant,
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
    assert.match(resolveLivraisonLabel({ livraisonCents: 1950 }), /Jour même/);
  });

  it("reste muet sur 12,50 €, que le barème ne permet plus d'attribuer", () => {
    // 12,50 € vaut aussi bien « forfait Express 24 h » que « palier au-delà de
    // 35 km » — la collision a survécu à la division par deux du barème. Sans
    // libellé explicite, le devis n'invente rien.
    assert.equal(resolveLivraisonLabel({ livraisonCents: 1250 }), "Livraison");
  });

  it("ignore un libellé vide ou blanc", () => {
    assert.equal(
      resolveLivraisonLabel({ livraisonCents: 0, livraisonLabel: "   " }),
      "Livraison offerte",
    );
  });
});

describe("resolveLivraisonMontant — le montant ne doit jamais contredire le libelle", () => {
  const euros = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

  it("dit « sur devis » quand la course est a chiffrer, JAMAIS « Offerte »", () => {
    const montant = resolveLivraisonMontant({ livraisonCents: 0, livraisonSurDevis: true }, euros);
    assert.equal(montant, "sur devis");
    assert.doesNotMatch(montant, /[Oo]fferte/);
  });

  it("distingue deux zeros que rien d'autre ne separe", () => {
    // Meme montant, sens opposes : l'un est une gratuite accordee, l'autre une
    // course dont personne n'a publie le prix.
    assert.equal(resolveLivraisonMontant({ livraisonCents: 0 }, euros), "Offerte");
    assert.equal(
      resolveLivraisonMontant({ livraisonCents: 0, livraisonSurDevis: true }, euros),
      "sur devis",
    );
  });

  it("formate normalement un montant du, avec la mise en forme de l'appelant", () => {
    assert.equal(resolveLivraisonMontant({ livraisonCents: 1500 }, euros), "15.00 EUR");
  });

  it("laisse « sur devis » l'emporter meme si un montant a ete saisi", () => {
    // Cas reel : l'operateur chiffre a la main une course hors zone mais le
    // drapeau n'a pas ete leve. On prefere annoncer « sur devis » que facturer
    // un montant que le bareme ne justifie pas.
    assert.equal(
      resolveLivraisonMontant({ livraisonCents: 3000, livraisonSurDevis: true }, euros),
      "sur devis",
    );
  });

  it("s'accorde avec le libelle sur une course a chiffrer", () => {
    const donnees = {
      livraisonCents: 0,
      livraisonLabel: "Livraison - sur devis (a chiffrer)",
      livraisonSurDevis: true,
    };
    const label = resolveLivraisonLabel(donnees);
    const montant = resolveLivraisonMontant(donnees, euros);
    // La phrase imprimee sur le contrat vaut « (label : montant) ». Elle ne doit
    // pas se contredire d'une moitie a l'autre.
    assert.match(label, /sur devis/);
    assert.match(montant, /sur devis/);
    assert.doesNotMatch(`${label} : ${montant}`, /offerte/i);
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
