/**
 * Garde-fou de concordance devis ↔ contrat : c'est lui qui empêche qu'un
 * montant figure dans un total sans apparaître nulle part sur le document.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ContractTotalsMismatchError,
  checkContractTotals,
  computeQuoteFinancials,
  detectContractType,
  quoteToContractData,
  type ContractData,
  type ContractTerms,
  type QuoteForContract,
} from "./contract.ts";
import { SUBSCRIPTION_DEFAULTS } from "./constants.ts";

const PACK_CENTS = SUBSCRIPTION_DEFAULTS.PRICE_CENTS; // 8900

function quote(over: Partial<QuoteForContract> = {}): QuoteForContract {
  return {
    numero: "LSQ-2026-0007",
    clientNom: "Gîte des Oliviers",
    lignes: [{ designation: "Kit Bain", qty: 4, unitCents: 750 }],
    tvaApplicable: false,
    remisePct: 0,
    livraisonCents: 0,
    totalNetCents: 3000,
    ...over,
  };
}

const terms: ContractTerms = {
  prixMensuelCents: PACK_CENTS,
  kitsBain: SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
  kitsLit: SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
  livraisonsIncluses: SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH,
  engagementMois: SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
  preavisJours: SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS,
  jourFacturation: "1er",
  lieu: "Orange",
  dateDebut: "1er août 2026",
  depotGarantieCents: 0,
  conditionsParticulieres: "",
  numero: "CTR-202607-001",
  date: "28 juillet 2026",
};

describe("computeQuoteFinancials", () => {
  it("recalcule le détail d'un devis simple", () => {
    const fin = computeQuoteFinancials(quote());
    assert.deepEqual(fin, {
      sousTotalCents: 3000,
      remiseCents: 0,
      livraisonCents: 0,
      totalHTCents: 3000,
      tvaCents: 0,
      totalCents: 3000,
    });
  });

  it("fait traverser le forfait Express 24 h sans écart", () => {
    const fin = computeQuoteFinancials(quote({ livraisonCents: 2500 }));
    assert.equal(fin.livraisonCents, 2500);
    assert.equal(fin.totalCents, 5500);
  });

  it("fait traverser le forfait Jour même sans écart", () => {
    const fin = computeQuoteFinancials(quote({ livraisonCents: 3900 }));
    assert.equal(fin.totalCents, 6900);
  });

  it("fait traverser un montant de livraison saisi à la main (sur devis)", () => {
    const fin = computeQuoteFinancials(quote({ livraisonCents: 4200 }));
    assert.equal(fin.livraisonCents, 4200, "aucun barème n'est réappliqué");
    assert.equal(fin.totalCents, 7200);
  });

  it("applique remise puis livraison puis TVA, dans cet ordre", () => {
    const fin = computeQuoteFinancials(
      quote({ remisePct: 1000, livraisonCents: 2500, tvaApplicable: true }),
    );
    assert.equal(fin.remiseCents, 300);
    assert.equal(fin.totalHTCents, 3000 - 300 + 2500);
    assert.equal(fin.tvaCents, 1040, "20 % de 52 €");
    assert.equal(fin.totalCents, 6240);
  });
});

describe("quoteToContractData — garde-fou de concordance", () => {
  it("accepte un devis dont le total concorde, forfait d'urgence compris", () => {
    const data = quoteToContractData(
      quote({ livraisonCents: 2500, totalNetCents: 5500 }),
      terms,
      PACK_CENTS,
    );
    assert.equal(data.type, "PONCTUEL");
    assert.equal(data.livraisonCents, 2500);
    assert.equal(data.totalCents, 5500);
    assert.equal(data.sousTotalCents, 3000);
  });

  it("refuse un devis dont le total ne retombe pas sur le détail", () => {
    assert.throws(
      () => quoteToContractData(quote({ totalNetCents: 9999 }), terms, PACK_CENTS),
      ContractTotalsMismatchError,
    );
  });

  it("signale l'écart chiffré dans le message d'erreur", () => {
    try {
      quoteToContractData(quote({ totalNetCents: 2500 }), terms, PACK_CENTS);
      assert.fail("aurait dû lever");
    } catch (err) {
      assert.ok(err instanceof ContractTotalsMismatchError);
      assert.equal(err.expectedCents, 2500);
      assert.equal(err.computedCents, 3000);
      // `toFixed(2)` → séparateur décimal anglais, dans une phrase française.
      // Cosmétique, mais c'est le message réellement affiché à l'admin.
      assert.match(err.message, /écart 5\.00 €/);
    }
  });

  it("reporte le niveau d'urgence du devis sur le contrat", () => {
    const data = quoteToContractData(
      quote({ urgency: "EXPRESS_24H", livraisonCents: 2500, totalNetCents: 5500 }),
      terms,
      PACK_CENTS,
    );
    assert.equal(data.urgency, "EXPRESS_24H");
  });

  it("laisse urgency indéfini sur un devis qui n'en porte pas", () => {
    const data = quoteToContractData(quote(), terms, PACK_CENTS);
    assert.equal(data.urgency, undefined);
  });

  it("reprend le prix mensuel de la ligne pack plutôt que des termes", () => {
    const data = quoteToContractData(
      quote({
        lignes: [{ designation: "Pack Sérénité", qty: 1, unitCents: 9500 }],
        totalNetCents: 9500,
      }),
      terms,
      PACK_CENTS,
    );
    assert.equal(data.type, "ABONNEMENT");
    assert.equal(data.prixMensuelCents, 9500);
    assert.equal(data.lignes.length, 0, "l'abonnement n'imprime pas de tableau de lignes");
  });
});

describe("checkContractTotals", () => {
  function contract(over: Partial<ContractData> = {}): ContractData {
    return {
      type: "PONCTUEL",
      numero: "CTR-202607-001",
      date: "28 juillet 2026",
      lieu: "Orange",
      client: { nom: "", etablissement: "", identifiant: "", adresse: "", email: "", tel: "" },
      prixMensuelCents: PACK_CENTS,
      kitsBain: 8,
      kitsLit: 4,
      livraisonsIncluses: 2,
      dateDebut: "",
      engagementMois: 3,
      preavisJours: 30,
      jourFacturation: "1er",
      lignes: [{ designation: "Kit Bain", qty: 4, unitCents: 750 }],
      totalCents: 5500,
      tvaApplicable: false,
      sousTotalCents: 3000,
      remisePct: 0,
      remiseCents: 0,
      livraisonCents: 2500,
      tvaCents: 0,
      depotGarantieCents: 0,
      conditionsParticulieres: "",
      ...over,
    };
  }

  it("valide un contrat ponctuel dont le détail somme au total", () => {
    const check = checkContractTotals(contract());
    assert.equal(check.ok, true);
    assert.equal(check.computedCents, 5500);
  });

  it("rejette un contrat dont le total annoncé diffère du détail", () => {
    const check = checkContractTotals(contract({ totalCents: 3000 }));
    assert.equal(check.ok, false, "25 € de livraison manqueraient au tableau");
    assert.equal(check.computedCents, 5500);
  });

  it("rejette un sous-total incohérent avec les lignes", () => {
    const check = checkContractTotals(contract({ sousTotalCents: 9999 }));
    assert.equal(check.ok, false);
  });

  it("court-circuite l'abonnement, dont le tableau de lignes est vide", () => {
    const check = checkContractTotals(
      contract({ type: "ABONNEMENT", lignes: [], sousTotalCents: 0, totalCents: PACK_CENTS }),
    );
    assert.equal(check.ok, true);
    assert.equal(check.computedCents, PACK_CENTS);
  });
});

describe("detectContractType", () => {
  it("détecte l'abonnement au libellé « Pack Sérénité »", () => {
    const d = detectContractType(
      quote({ lignes: [{ designation: "Pack Sérénité", qty: 1, unitCents: 9500 }] }),
      PACK_CENTS,
    );
    assert.equal(d.type, "ABONNEMENT");
    assert.equal(d.nbMensualites, 1);
  });

  it("tolère l'absence d'accents dans le libellé", () => {
    const d = detectContractType(
      quote({ lignes: [{ designation: "pack serenite mensuel", qty: 1, unitCents: 100 }] }),
      PACK_CENTS,
    );
    assert.equal(d.type, "ABONNEMENT");
  });

  it("détecte l'abonnement au prix de 8 900 centimes même sans libellé explicite", () => {
    const d = detectContractType(
      quote({ lignes: [{ designation: "Abonnement mensuel", qty: 1, unitCents: PACK_CENTS }] }),
      PACK_CENTS,
    );
    assert.equal(d.type, "ABONNEMENT");
  });

  it("compte une mensualité par ligne pack", () => {
    const d = detectContractType(
      quote({
        lignes: [
          { designation: "Pack Sérénité — août", qty: 1, unitCents: PACK_CENTS },
          { designation: "Pack Sérénité — septembre", qty: 1, unitCents: PACK_CENTS },
          { designation: "Pack Sérénité — octobre", qty: 1, unitCents: PACK_CENTS },
        ],
      }),
      PACK_CENTS,
    );
    assert.equal(d.nbMensualites, 3);
  });

  it("classe en ponctuel un devis sans ligne pack", () => {
    const d = detectContractType(quote(), PACK_CENTS);
    assert.equal(d.type, "PONCTUEL");
    assert.equal(d.nbMensualites, 0);
  });

  it("classe en ponctuel un devis vide", () => {
    const d = detectContractType(quote({ lignes: [] }), PACK_CENTS);
    assert.equal(d.type, "PONCTUEL");
  });
});
