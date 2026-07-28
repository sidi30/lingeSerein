/**
 * Règles de rotation : durées de détention, retard, résolution produit.
 *
 * Points sensibles couverts ici :
 *  - les 7 jours du ponctuel sont un seuil FISCAL (renouvellement hebdomadaire
 *    para-hôtelier), pas un réglage — un test le fige explicitement ;
 *  - le retard se compte en jours CALENDAIRES, pas en tranches de 24 h ;
 *  - `resolveProductSlug` ne devine jamais : « Petite serviette » ne doit pas
 *    tomber dans « serviette », et une désignation inconnue renvoie null.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SUBSCRIPTION_DEFAULTS } from "./constants.ts";
import {
  DETENTION_DAYS,
  RETARD_ESCALADE_JOURS,
  ROTATION_TRANSITIONS,
  ROTATION_EN_COURS,
  ROTATION_TERMINAL,
  computeDateReprise,
  isEnRetard,
  isFacturableRemplacement,
  joursDeRetard,
  productNameFromSlug,
  resolveProductSlug,
  type RotationForRetard,
  type RotationStatus,
} from "./rotation.ts";

// Dates locales — le calcul de retard raisonne en minuit local, pas en UTC.
function jour(y: number, m: number, d: number, h = 10): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

describe("DETENTION_DAYS", () => {
  it("fige les 7 jours du ponctuel (seuil hebdomadaire para-hôtelier)", () => {
    // Ce test est un garde-fou réglementaire : allonger cette durée exposerait
    // les clients hôtes à un redressement de TVA. Le modifier doit être un acte
    // conscient, pas un effet de bord.
    assert.equal(DETENTION_DAYS.PONCTUEL, 7);
  });

  it("aligne l'abonnement sur la durée contractuelle du Pack Sérénité", () => {
    assert.equal(DETENTION_DAYS.ABONNEMENT, SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS);
    assert.equal(DETENTION_DAYS.ABONNEMENT, 14);
  });
});

describe("computeDateReprise", () => {
  it("ajoute 7 jours en location ponctuelle", () => {
    const reprise = computeDateReprise({ dateLivraison: jour(2026, 7, 1), formule: "PONCTUEL" });
    assert.equal(reprise.getDate(), 8);
    assert.equal(reprise.getMonth(), 6);
  });

  it("ajoute 14 jours en abonnement", () => {
    const reprise = computeDateReprise({ dateLivraison: jour(2026, 7, 1), formule: "ABONNEMENT" });
    assert.equal(reprise.getDate(), 15);
  });

  it("franchit correctement une fin de mois", () => {
    const reprise = computeDateReprise({ dateLivraison: jour(2026, 7, 28), formule: "PONCTUEL" });
    assert.equal(reprise.getMonth(), 7, "août");
    assert.equal(reprise.getDate(), 4);
  });

  it("franchit une fin d'année", () => {
    const reprise = computeDateReprise({ dateLivraison: jour(2026, 12, 28), formule: "PONCTUEL" });
    assert.equal(reprise.getFullYear(), 2027);
    assert.equal(reprise.getDate(), 4);
  });

  it("accepte une date ISO comme une Date", () => {
    const a = computeDateReprise({ dateLivraison: "2026-07-01T10:00:00", formule: "PONCTUEL" });
    const b = computeDateReprise({ dateLivraison: jour(2026, 7, 1), formule: "PONCTUEL" });
    assert.equal(a.getTime(), b.getTime());
  });

  it("refuse une date illisible plutôt que de produire une échéance fantôme", () => {
    assert.throws(
      () => computeDateReprise({ dateLivraison: "pas une date", formule: "PONCTUEL" }),
      RangeError,
    );
  });

  it("ne modifie pas la date d'entrée", () => {
    const livraison = jour(2026, 7, 1);
    computeDateReprise({ dateLivraison: livraison, formule: "PONCTUEL" });
    assert.equal(livraison.getDate(), 1);
  });
});

describe("joursDeRetard / isEnRetard", () => {
  function rotation(over: Partial<RotationForRetard> = {}): RotationForRetard {
    return { status: "LIVREE", dateReprisePrevue: jour(2026, 7, 10), ...over };
  }

  it("ne compte aucun retard avant l'échéance", () => {
    assert.equal(joursDeRetard(rotation(), jour(2026, 7, 8)), 0);
    assert.equal(isEnRetard(rotation(), jour(2026, 7, 8)), false);
  });

  it("ne compte aucun retard le jour même de l'échéance", () => {
    assert.equal(joursDeRetard(rotation(), jour(2026, 7, 10, 23)), 0);
    assert.equal(isEnRetard(rotation(), jour(2026, 7, 10, 23)), false);
  });

  it("compte 1 jour dès le lendemain de l'échéance", () => {
    assert.equal(joursDeRetard(rotation(), jour(2026, 7, 11, 1)), 1);
    assert.equal(isEnRetard(rotation(), jour(2026, 7, 11, 1)), true);
  });

  it("compte les jours entiers accumulés", () => {
    assert.equal(joursDeRetard(rotation(), jour(2026, 7, 15)), 5);
  });

  it("n'est jamais en retard une fois le linge repris", () => {
    const reprise = rotation({ status: "REPRISE", dateRepriseReelle: jour(2026, 7, 14) });
    assert.equal(joursDeRetard(reprise, jour(2026, 7, 20)), 0);
    assert.equal(isEnRetard(reprise, jour(2026, 7, 20)), false);
  });

  it("n'est jamais en retard une fois annulée", () => {
    assert.equal(joursDeRetard(rotation({ status: "ANNULEE" }), jour(2026, 7, 20)), 0);
  });

  it("ignore le retard d'une rotation déjà reprise même restée en LIVREE", () => {
    // Filet : la date réelle de reprise prime sur le statut, qui peut n'avoir
    // pas encore été basculé par l'exploitant.
    const r = rotation({ dateRepriseReelle: jour(2026, 7, 12) });
    assert.equal(joursDeRetard(r, jour(2026, 7, 20)), 0);
  });

  it("compte aussi le retard d'une rotation encore PLANIFIEE", () => {
    assert.equal(joursDeRetard(rotation({ status: "PLANIFIEE" }), jour(2026, 7, 13)), 3);
  });
});

describe("isFacturableRemplacement", () => {
  const r: RotationForRetard = { status: "EN_RETARD", dateReprisePrevue: jour(2026, 7, 10) };

  it("reste faux au seuil d'escalade", () => {
    assert.equal(joursDeRetard(r, jour(2026, 7, 13)), RETARD_ESCALADE_JOURS);
    assert.equal(isFacturableRemplacement(r, jour(2026, 7, 13)), false);
  });

  it("devient vrai au-delà du seuil", () => {
    assert.equal(isFacturableRemplacement(r, jour(2026, 7, 14)), true);
  });

  it("fige le seuil d'escalade à 3 jours", () => {
    assert.equal(RETARD_ESCALADE_JOURS, 3);
  });
});

describe("ROTATION_TRANSITIONS", () => {
  it("interdit de repasser un état terminal en cours", () => {
    assert.deepEqual(ROTATION_TRANSITIONS.REPRISE, []);
    assert.deepEqual(ROTATION_TRANSITIONS.ANNULEE, []);
  });

  it("permet de sortir d'un retard en enregistrant la reprise", () => {
    assert.ok(ROTATION_TRANSITIONS.EN_RETARD.includes("REPRISE"));
  });

  it("interdit de livrer une rotation déjà livrée", () => {
    assert.ok(!ROTATION_TRANSITIONS.LIVREE.includes("LIVREE"));
  });

  it("couvre exhaustivement les statuts, sans cible inconnue", () => {
    const statuts = Object.keys(ROTATION_TRANSITIONS) as RotationStatus[];
    assert.equal(statuts.length, 5);
    for (const cibles of Object.values(ROTATION_TRANSITIONS)) {
      for (const cible of cibles) {
        assert.ok(statuts.includes(cible), `cible inconnue : ${cible}`);
      }
    }
  });

  it("partitionne les statuts entre « en cours » et terminaux", () => {
    const statuts = Object.keys(ROTATION_TRANSITIONS) as RotationStatus[];
    assert.equal(ROTATION_EN_COURS.length + ROTATION_TERMINAL.length, statuts.length);
    for (const s of statuts) {
      assert.notEqual(
        ROTATION_EN_COURS.includes(s),
        ROTATION_TERMINAL.includes(s),
        `${s} doit être dans exactement une des deux listes`,
      );
    }
  });
});

describe("resolveProductSlug", () => {
  it("résout les désignations canoniques du catalogue", () => {
    assert.equal(resolveProductSlug("Kit Bain"), "kit-bain");
    assert.equal(resolveProductSlug("Kit Lit"), "kit-lit");
    assert.equal(resolveProductSlug("Kit Complet (Bain + Lit)"), "kit-complet");
    assert.equal(resolveProductSlug("Serviette de toilette"), "serviette");
    assert.equal(resolveProductSlug("Grand drap de bain"), "drap-bain");
    assert.equal(resolveProductSlug("Tapis de bain"), "tapis-bain");
    assert.equal(resolveProductSlug("Petite serviette"), "petite-serviette");
    assert.equal(resolveProductSlug("Drap housse"), "drap-housse");
    assert.equal(resolveProductSlug("Housse de couette"), "housse-couette");
  });

  it("ignore la casse, les accents et la ponctuation", () => {
    assert.equal(resolveProductSlug("KIT BAIN"), "kit-bain");
    assert.equal(resolveProductSlug("kit-bain"), "kit-bain");
    assert.equal(resolveProductSlug("  Kit   Bain  "), "kit-bain");
    assert.equal(resolveProductSlug("Sérviette de toilette"), "serviette");
  });

  it("accepte le pluriel saisi à la main", () => {
    assert.equal(resolveProductSlug("Kits bain"), "kit-bain");
    assert.equal(resolveProductSlug("Serviettes de toilette"), "serviette");
    assert.equal(resolveProductSlug("Housses de couette"), "housse-couette");
  });

  it("ne confond pas la petite serviette avec la serviette de toilette", () => {
    // Le motif le plus long gagne : sans cette règle, « Petite serviette »
    // décrémenterait le stock du mauvais produit.
    assert.equal(resolveProductSlug("Petite serviette"), "petite-serviette");
    assert.equal(resolveProductSlug("Petites serviettes 30x50"), "petite-serviette");
  });

  it("ne confond pas le kit complet avec le kit bain ni le kit lit", () => {
    assert.equal(resolveProductSlug("Kit complet"), "kit-complet");
    assert.equal(resolveProductSlug("Kit Complet Bain + Lit"), "kit-complet");
  });

  it("ne confond pas le drap de bain avec le tapis de bain", () => {
    assert.equal(resolveProductSlug("Drap de bain 70x150"), "drap-bain");
    assert.equal(resolveProductSlug("Tapis de bain 50x70"), "tapis-bain");
  });

  it("tolère un suffixe de commentaire sur la ligne", () => {
    assert.equal(resolveProductSlug("Kit Bain — livraison du 12/07"), "kit-bain");
    assert.equal(resolveProductSlug("Housse de couette 240x220"), "housse-couette");
  });

  it("renvoie null plutôt que de deviner sur une désignation inconnue", () => {
    assert.equal(resolveProductSlug("Forfait déplacement"), null);
    assert.equal(resolveProductSlug("Remise commerciale"), null);
    assert.equal(resolveProductSlug("Livraison Express 24 h"), null);
    assert.equal(resolveProductSlug(""), null);
    assert.equal(resolveProductSlug("   "), null);
  });

  it("ne renvoie que des slugs réellement présents au catalogue", () => {
    const designations = [
      "Kit Bain",
      "Kit Lit",
      "Kit Complet",
      "Serviette de toilette",
      "Grand drap de bain",
      "Tapis de bain",
      "Petite serviette",
      "Drap housse",
      "Housse de couette",
    ];
    for (const d of designations) {
      const slug = resolveProductSlug(d);
      assert.ok(slug, `${d} devrait se résoudre`);
      assert.ok(productNameFromSlug(slug), `${slug} doit exister au catalogue`);
    }
  });
});

describe("productNameFromSlug", () => {
  it("retrouve le libellé catalogue", () => {
    assert.equal(productNameFromSlug("kit-bain"), "Kit Bain");
  });

  it("renvoie null sur un slug inconnu", () => {
    assert.equal(productNameFromSlug("kit-fantome"), null);
  });
});
