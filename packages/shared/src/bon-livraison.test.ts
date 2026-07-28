/**
 * Bon de livraison dérivé d'un devis. Point sensible : un bon de livraison est
 * un document de réception, il ne doit JAMAIS porter de prix.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bonLivraisonNumero, countArticlesLivres, devisToBonLivraison } from "./bon-livraison.ts";
import type { DevisData } from "./devis.ts";

function devis(over: Partial<DevisData> = {}): DevisData {
  return {
    numero: "LSQ-2026-0007",
    date: "2026-07-28",
    validiteJours: 30,
    client: {
      nom: "Marie Dupont",
      etablissement: "Gîte des Oliviers",
      adresse: "12 chemin des Oliviers, 84100 Orange",
    },
    lines: [
      { designation: "Kit Complet (Bain + Lit)", qty: 4, unitCents: 2900 },
      { designation: "Serviette de toilette", qty: 6, unitCents: 450 },
    ],
    remisePct: 0,
    livraisonCents: 2500,
    tvaApplicable: false,
    ...over,
  };
}

describe("bonLivraisonNumero", () => {
  it("préfixe le numéro de devis et suffixe le rang du passage", () => {
    assert.equal(bonLivraisonNumero("LSQ-2026-0007", 1), "BL-LSQ-2026-0007-01");
    assert.equal(bonLivraisonNumero("LSQ-2026-0007", 2), "BL-LSQ-2026-0007-02");
  });

  it("part du premier passage par défaut", () => {
    assert.equal(bonLivraisonNumero("LSQ-2026-0007"), "BL-LSQ-2026-0007-01");
  });

  it("passe à trois chiffres au-delà du 99e passage", () => {
    assert.equal(bonLivraisonNumero("LSQ-2026-0007", 100), "BL-LSQ-2026-0007-100");
  });

  it("rend une chaîne vide quand le devis n'a pas encore de numéro", () => {
    assert.equal(bonLivraisonNumero(""), "", "mieux qu'un « BL--01 » tronqué");
    assert.equal(bonLivraisonNumero("   "), "");
  });

  it("ne double pas le préfixe si on lui repasse un numéro de bon", () => {
    assert.equal(bonLivraisonNumero("BL-LSQ-2026-0007"), "BL-LSQ-2026-0007-01");
  });

  it("borne un rang aberrant au premier passage", () => {
    assert.equal(bonLivraisonNumero("LSQ-2026-0007", 0), "BL-LSQ-2026-0007-01");
    assert.equal(bonLivraisonNumero("LSQ-2026-0007", -3), "BL-LSQ-2026-0007-01");
    assert.equal(bonLivraisonNumero("LSQ-2026-0007", Number.NaN), "BL-LSQ-2026-0007-01");
  });
});

describe("devisToBonLivraison", () => {
  it("ne recopie AUCUN prix depuis le devis", () => {
    const bl = devisToBonLivraison(devis());
    for (const ligne of bl.lines) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(ligne, "unitCents"),
        false,
        "un bon de livraison ne porte pas de montant",
      );
      assert.deepEqual(Object.keys(ligne).sort(), ["designation", "qty"]);
    }
  });

  it("reprend les désignations et les quantités à l'identique", () => {
    const bl = devisToBonLivraison(devis());
    assert.deepEqual(bl.lines, [
      { designation: "Kit Complet (Bain + Lit)", qty: 4 },
      { designation: "Serviette de toilette", qty: 6 },
    ]);
  });

  it("ne déduit pas la date de livraison de la date du devis", () => {
    const bl = devisToBonLivraison(devis());
    assert.equal(bl.date, "", "la date de livraison se remplit sur place");
    assert.notEqual(bl.date, "2026-07-28");
  });

  it("retient la date de livraison quand elle est fournie", () => {
    const bl = devisToBonLivraison(devis(), { date: "28 juillet 2026", heure: "10h30" });
    assert.equal(bl.date, "28 juillet 2026");
    assert.equal(bl.heure, "10h30");
  });

  it("hérite de la zone et du niveau d'urgence du devis", () => {
    const bl = devisToBonLivraison(devis({ zoneLivraison: "PROCHE", urgency: "EXPRESS_24H" }));
    assert.equal(bl.zone, "PROCHE");
    assert.equal(bl.urgency, "EXPRESS_24H");
  });

  it("laisse les options surcharger la zone et l'urgence du devis", () => {
    const bl = devisToBonLivraison(devis({ zoneLivraison: "PROCHE" }), { zone: "ORANGE" });
    assert.equal(bl.zone, "ORANGE");
  });

  it("prend l'adresse du client comme adresse de livraison par défaut", () => {
    const bl = devisToBonLivraison(devis());
    assert.equal(bl.adresseLivraison, "12 chemin des Oliviers, 84100 Orange");
  });

  it("accepte une adresse de livraison distincte", () => {
    const bl = devisToBonLivraison(devis(), {
      adresseLivraison: "3 rue du Pont, 84350 Courthézon",
    });
    assert.equal(bl.adresseLivraison, "3 rue du Pont, 84350 Courthézon");
  });

  it("copie le client sans partager la référence du devis", () => {
    const d = devis();
    const bl = devisToBonLivraison(d);
    bl.client.nom = "Modifié";
    assert.equal(d.client.nom, "Marie Dupont", "le devis source ne doit pas être muté");
  });

  it("garde la traçabilité du devis d'origine", () => {
    const bl = devisToBonLivraison(devis());
    assert.equal(bl.devisNumero, "LSQ-2026-0007");
    assert.equal(bl.numero, "BL-LSQ-2026-0007-01");
  });
});

describe("countArticlesLivres", () => {
  it("additionne les quantités livrées", () => {
    assert.equal(countArticlesLivres(devisToBonLivraison(devis()).lines), 10);
  });

  it("renvoie zéro sur un bon sans ligne", () => {
    assert.equal(countArticlesLivres([]), 0);
  });
});
