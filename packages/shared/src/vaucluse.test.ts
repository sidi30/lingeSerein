import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeDeliveryFee, DELIVERY_ZONE_CENTS, zoneFromKm } from "./constants";
import {
  chercherCommunes,
  communeParInsee,
  communesParCodePostal,
  estLivrable,
  VAUCLUSE_COMMUNES,
  zoneParCodePostal,
} from "./vaucluse";

describe("table des communes du Vaucluse", () => {
  it("couvre le département entier", () => {
    assert.equal(VAUCLUSE_COMMUNES.length, 151);
  });

  it("n'a ni code INSEE ni nom en double", () => {
    assert.equal(new Set(VAUCLUSE_COMMUNES.map((c) => c.codeInsee)).size, 151);
    assert.equal(new Set(VAUCLUSE_COMMUNES.map((c) => c.nom)).size, 151);
  });

  it("ne contient que des codes postaux du Vaucluse", () => {
    for (const commune of VAUCLUSE_COMMUNES) {
      assert.ok(commune.codesPostaux.length > 0, commune.nom);
      for (const cp of commune.codesPostaux) {
        assert.match(cp, /^84\d{3}$/, `${commune.nom} : ${cp}`);
      }
    }
  });

  it("range chaque commune dans le palier que sa distance impose", () => {
    for (const commune of VAUCLUSE_COMMUNES) {
      assert.equal(
        commune.zone,
        zoneFromKm(commune.kmDepuisOrange),
        `${commune.nom} (${commune.kmDepuisOrange} km)`,
      );
    }
  });

  it("place Orange, et elle seule, au palier gratuit", () => {
    const gratuites = VAUCLUSE_COMMUNES.filter((c) => c.zone === "ORANGE");
    assert.deepEqual(
      gratuites.map((c) => c.nom),
      ["Orange"],
    );
    assert.equal(gratuites[0]?.kmDepuisOrange, 0);
  });

  it("classe les communes que le propriétaire a nommées", () => {
    const attendu: Record<string, string> = {
      Orange: "ORANGE",
      Jonquières: "PROCHE",
      Courthézon: "PROCHE",
      "Châteauneuf-du-Pape": "PROCHE",
      Avignon: "INTERMEDIAIRE",
      Carpentras: "INTERMEDIAIRE",
      Cavaillon: "ELOIGNE",
      Apt: "ELOIGNE",
      Pertuis: "ELOIGNE",
    };
    for (const [nom, zone] of Object.entries(attendu)) {
      assert.equal(communeParInsee(trouverInsee(nom))?.zone, zone, nom);
    }
  });
});

function trouverInsee(nom: string): string {
  const commune = VAUCLUSE_COMMUNES.find((c) => c.nom === nom);
  assert.ok(commune, `commune absente de la table : ${nom}`);
  return commune.codeInsee;
}

describe("zoneParCodePostal — repli pour les fiches sans commune", () => {
  it("rend HORS_ZONE hors du Vaucluse, sans inventer de tarif", () => {
    for (const cp of ["75001", "13100", "", "  "]) {
      const deduit = zoneParCodePostal(cp);
      assert.equal(deduit.zone, "HORS_ZONE", cp);
      assert.deepEqual(deduit.candidates, []);
    }
    assert.equal(zoneParCodePostal(null).zone, "HORS_ZONE");
  });

  it("retient le palier le MOINS cher quand le code postal est à cheval", () => {
    // 84100 désigne Orange (gratuite) ET Uchaux, à 11,6 km (12 €). Le code
    // postal seul ne permet pas de trancher : facturer 12 € reviendrait à faire
    // payer un Orangeois pour une ambiguïté administrative dont il n'est pas
    // l'auteur.
    const deduit = zoneParCodePostal("84100");
    assert.equal(deduit.zone, "ORANGE");
    assert.equal(deduit.ambigu, true);
    assert.deepEqual(deduit.candidates.map((c) => c.nom).sort(), ["Orange", "Uchaux"]);
  });

  it("signale l'ambiguïté pour que l'application fasse confirmer la commune", () => {
    const ambigus = ["84100", "84110", "84150", "84210", "84290", "84410", "84600"];
    for (const cp of ambigus) {
      assert.equal(zoneParCodePostal(cp).ambigu, true, cp);
    }
  });

  it("ne lève aucune ambiguïté quand le code postal ne couvre qu'un palier", () => {
    const deduit = zoneParCodePostal("84300"); // Cavaillon
    assert.equal(deduit.zone, "ELOIGNE");
    assert.equal(deduit.ambigu, false);
  });

  it("tolère les espaces autour de la saisie", () => {
    assert.equal(zoneParCodePostal(" 84300 ").zone, "ELOIGNE");
  });
});

describe("chercherCommunes — auto-complétion", () => {
  it("ne rend rien sur une saisie vide", () => {
    assert.deepEqual(chercherCommunes(""), []);
    assert.deepEqual(chercherCommunes("   "), []);
  });

  it("fait passer devant les communes qui COMMENCENT par la saisie", () => {
    const resultats = chercherCommunes("ora");
    assert.equal(resultats[0]?.nom, "Orange");
  });

  it("ignore accents, casse, tirets et apostrophes", () => {
    for (const saisie of ["chateauneuf du pape", "CHÂTEAUNEUF-DU-PAPE", "Châteauneuf du Pape"]) {
      assert.ok(
        chercherCommunes(saisie).some((c) => c.nom === "Châteauneuf-du-Pape"),
        saisie,
      );
    }
    assert.ok(
      chercherCommunes("l isle sur la sorgue").some((c) => c.nom === "L'Isle-sur-la-Sorgue"),
    );
  });

  it("respecte la limite demandée", () => {
    assert.ok(chercherCommunes("a", 3).length <= 3);
    assert.ok(chercherCommunes("saint", 100).length <= 100);
  });

  it("ne rend rien pour une commune d'un autre département", () => {
    assert.deepEqual(chercherCommunes("Nîmes"), []);
    assert.deepEqual(chercherCommunes("Marseille"), []);
  });
});

describe("estLivrable — la liste fermée est la frontière", () => {
  it("accepte toute commune de la table", () => {
    for (const commune of VAUCLUSE_COMMUNES) {
      assert.ok(estLivrable(commune.codeInsee), commune.nom);
    }
  });

  it("refuse un code INSEE hors Vaucluse, vide ou absent", () => {
    assert.equal(estLivrable("13055"), false, "Marseille");
    assert.equal(estLivrable("30189"), false, "Nîmes");
    assert.equal(estLivrable(""), false);
    assert.equal(estLivrable(null), false);
    assert.equal(estLivrable(undefined), false);
  });
});

describe("la table et le barème s'accordent", () => {
  it("facture chaque commune au tarif de son palier", () => {
    const attendus: Record<string, number> = {
      Orange: 0,
      Caderousse: 600,
      Avignon: 750,
      Cavaillon: 1250,
    };
    for (const [nom, cents] of Object.entries(attendus)) {
      const commune = communeParInsee(trouverInsee(nom));
      assert.ok(commune);
      const fee = computeDeliveryFee({ zone: commune.zone, montantApresRemiseCents: 5000 });
      assert.equal(fee.cents, cents, nom);
      assert.equal(fee.cents, DELIVERY_ZONE_CENTS[commune.zone], nom);
      assert.equal(fee.surDevis, false, nom);
    }
  });

  it("publie un tarif pour CHAQUE commune du département — aucune n'est sur devis", () => {
    for (const commune of VAUCLUSE_COMMUNES) {
      const fee = computeDeliveryFee({ zone: commune.zone, montantApresRemiseCents: 5000 });
      assert.equal(fee.surDevis, false, commune.nom);
      assert.ok(fee.cents >= 0 && fee.cents <= 2500, commune.nom);
    }
  });

  it("indexe le code postal vers la même commune que le code INSEE", () => {
    for (const commune of VAUCLUSE_COMMUNES) {
      for (const cp of commune.codesPostaux) {
        assert.ok(
          communesParCodePostal(cp).some((c) => c.codeInsee === commune.codeInsee),
          `${commune.nom} / ${cp}`,
        );
      }
    }
  });
});
