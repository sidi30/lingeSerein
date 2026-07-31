import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DELAI_JOURS,
  defaultDeliveryYmd,
  deliveryUrgencyNotice,
  deliveryYmd,
  minDeliveryYmd,
} from "./delivery-urgency.ts";

/** Formateur minimal — le vrai vit dans `lib/api.ts` (React Native). */
const fmt = (cents: number) => `${(cents / 100).toFixed(2)} €`;

/** Un mardi de juillet, loin de tout changement d'heure. */
const TODAY = new Date(2026, 6, 28, 15, 30);

describe("dates proposées par le tunnel", () => {
  it("pré-remplit J+2, le premier jour SANS forfait d'urgence", () => {
    assert.equal(defaultDeliveryYmd(TODAY), "2026-07-30");
    assert.equal(deliveryUrgencyNotice(defaultDeliveryYmd(TODAY), fmt, TODAY).isSurcharged, false);
  });

  it("laisse J+1 sélectionnable", () => {
    assert.equal(minDeliveryYmd(TODAY), "2026-07-29");
  });

  it("reste en heure locale au passage d'un mois", () => {
    // `toISOString` sur une date locale reculerait d'un jour à l'ouest de UTC
    // et changerait le palier — donc le prix annoncé.
    assert.equal(deliveryYmd(DEFAULT_DELAI_JOURS, new Date(2026, 6, 30, 23, 45)), "2026-08-01");
    assert.equal(deliveryYmd(1, new Date(2026, 11, 31, 0, 15)), "2027-01-01");
  });
});

describe("deliveryUrgencyNotice", () => {
  it("annonce le forfait Express 24 h sur une livraison au lendemain", () => {
    const n = deliveryUrgencyNotice("2026-07-29", fmt, TODAY);
    assert.equal(n.level, "EXPRESS_24H");
    assert.equal(n.isSurcharged, true);
    assert.equal(n.feeCents, 1250, "forfait du barème partagé, pas une valeur recopiée");
    assert.match(n.title, /Express 24 h/);
    assert.match(n.title, /12\.50 €/);
    assert.match(n.message, /le lendemain/);
    assert.match(n.message, /12\.50 €/);
  });

  it("ne facture aucune urgence à partir de J+2", () => {
    for (const ymd of ["2026-07-30", "2026-07-31", "2026-08-15"]) {
      const n = deliveryUrgencyNotice(ymd, fmt, TODAY);
      assert.equal(n.level, "STANDARD", ymd);
      assert.equal(n.isSurcharged, false, ymd);
      assert.doesNotMatch(n.message, /forfait/i, ymd);
    }
  });

  it("bascule sur « Jour même » pour aujourd'hui ou une date passée", () => {
    // Le calendrier ne l'offre pas, mais le serveur le facturerait ainsi : on
    // affiche le même palier plutôt qu'un tarif silencieux.
    for (const ymd of ["2026-07-28", "2026-07-20"]) {
      const n = deliveryUrgencyNotice(ymd, fmt, TODAY);
      assert.equal(n.level, "JOUR_MEME", ymd);
      assert.equal(n.feeCents, 1950, ymd);
    }
  });

  it("compte des jours de calendrier, pas des tranches de 24 h", () => {
    // Commande passée à 23 h 50 pour le lendemain matin : moins de 24 h se sont
    // écoulées, mais c'est bien un jour civil d'écart — donc Express 24 h.
    const tard = new Date(2026, 6, 28, 23, 50);
    assert.equal(deliveryUrgencyNotice("2026-07-29", fmt, tard).level, "EXPRESS_24H");
    // Et 00 h 10 le même jour pour le lendemain : toujours un jour d'écart.
    const tot = new Date(2026, 6, 28, 0, 10);
    assert.equal(deliveryUrgencyNotice("2026-07-29", fmt, tot).level, "EXPRESS_24H");
  });
});
