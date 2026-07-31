/**
 * Le barème de livraison tel que l'admin le voit et le déduit.
 *
 * Trois choses y sont figées, parce qu'aucune ne se voit à la relecture :
 *
 * 1. les quatre paliers desservis sont proposés DANS L'ORDRE DE LA DISTANCE, et
 *    tirés de shared — un tarif modifié là-bas ne doit rien laisser derrière lui ;
 * 2. le code INSEE fait foi sur le code postal. Uchaux partage « 84100 » avec
 *    Orange : lire le code postal, c'est offrir la livraison d'Orange à un
 *    client qui n'y est pas ;
 * 3. un code postal à cheval sur deux paliers est signalé, jamais tranché en
 *    silence. Le moins cher est retenu en attendant, pour ne pas facturer un
 *    client sur un doute qui n'est pas le sien.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DELIVERY_ZONE_CENTS, DELIVERY_ZONE_LABELS } from "@lingengo/shared";
import {
  DELIVERY_ZONE_OPTIONS,
  SERVED_ZONES,
  clientZone,
  zoneOptionText,
  zoneTarifText,
} from "./delivery-zones.ts";

/** Codes INSEE utilisés ici — Orange (siège) et Uchaux partagent le 84100. */
const ORANGE = "84087";
const UCHAUX = "84135";
const CARPENTRAS = "84031";
const CAVAILLON = "84035";

describe("Options du sélecteur de zone", () => {
  it("propose les quatre paliers desservis, du plus proche au plus lointain", () => {
    assert.deepEqual([...SERVED_ZONES], ["ORANGE", "PROCHE", "INTERMEDIAIRE", "ELOIGNE"]);
  });

  it("ajoute HORS_ZONE en dernier, sans tarif", () => {
    assert.deepEqual(
      DELIVERY_ZONE_OPTIONS.map((o) => o.zone),
      ["ORANGE", "PROCHE", "INTERMEDIAIRE", "ELOIGNE", "HORS_ZONE"],
    );
    // `null`, et non 0 : un 0 se lirait « offerte » alors que rien n'est chiffré.
    assert.equal(DELIVERY_ZONE_OPTIONS.at(-1)?.cents, null);
  });

  it("reprend libellés et tarifs de shared sans les réécrire", () => {
    for (const option of DELIVERY_ZONE_OPTIONS) {
      assert.equal(option.label, DELIVERY_ZONE_LABELS[option.zone]);
      if (option.zone !== "HORS_ZONE") {
        assert.equal(option.cents, DELIVERY_ZONE_CENTS[option.zone]);
      }
    }
  });

  it("dit « incluse » pour Orange et « sur devis » hors zone, jamais « 0,00 € »", () => {
    assert.equal(zoneTarifText(0), "incluse");
    assert.equal(zoneTarifText(null), "sur devis");
    assert.match(zoneTarifText(1200), /12/);

    // Assertion plutôt que `[0]!` : l'assertion non-null est interdite par la
    // configuration eslint, et si la liste des paliers venait à être vidée, le
    // test doit échouer là-dessus plutôt que sur un `undefined` propagé.
    const [orange] = DELIVERY_ZONE_OPTIONS;
    assert.ok(orange, "la liste des paliers de livraison ne doit pas être vide");
    assert.equal(zoneOptionText(orange), `${DELIVERY_ZONE_LABELS.ORANGE} — incluse`);
  });
});

describe("Palier d'un client", () => {
  it("lit le code INSEE en priorité", () => {
    const zone = clientZone({ communeInsee: CARPENTRAS, postalCode: "84200" });
    assert.equal(zone.zone, "INTERMEDIAIRE");
    assert.equal(zone.source, "commune");
    assert.equal(zone.commune?.nom, "Carpentras");
    assert.equal(zone.ambigu, false);
  });

  it("ne donne pas le tarif d'Orange à Uchaux, qui partage son code postal", () => {
    // Le piège que ferme le code INSEE : « 84100 » désigne les deux communes.
    assert.equal(clientZone({ communeInsee: ORANGE, postalCode: "84100" }).zone, "ORANGE");
    assert.equal(clientZone({ communeInsee: UCHAUX, postalCode: "84100" }).zone, "PROCHE");
  });

  it("tient un code INSEE inconnu pour hors Vaucluse, sans deviner", () => {
    const zone = clientZone({ communeInsee: "13001", postalCode: "84100" });
    assert.equal(zone.zone, "HORS_ZONE");
    assert.equal(zone.commune, null);
  });

  it("retombe sur le code postal pour une fiche ancienne, en signalant le doute", () => {
    const ambigu = clientZone({ postalCode: "84100" });
    assert.equal(ambigu.source, "codePostal");
    assert.equal(ambigu.ambigu, true, "84100 chevauche Orange (0 €) et Uchaux (12 €)");
    // Le moins cher en attendant l'arbitrage, et aucune commune retenue.
    assert.equal(ambigu.zone, "ORANGE");
    assert.equal(ambigu.commune, null);
    assert.deepEqual([...ambigu.candidates].map((c) => c.nom).sort(), ["Orange", "Uchaux"]);
  });

  it("retient la commune quand le code postal n'en désigne qu'une", () => {
    const zone = clientZone({ postalCode: "84200" });
    assert.equal(zone.ambigu, false);
    assert.equal(zone.commune?.codeInsee, CARPENTRAS);
    assert.equal(zone.zone, "INTERMEDIAIRE");
  });

  it("ne nomme aucune commune quand le code postal en couvre plusieurs, même au même tarif", () => {
    // 84300 = Cavaillon et Taillades, toutes deux à plus de 35 km : le palier est
    // certain, la commune ne l'est pas. Le tarif suffit à chiffrer, pas à livrer.
    const zone = clientZone({ postalCode: "84300" });
    assert.equal(zone.zone, "ELOIGNE");
    assert.equal(zone.ambigu, false);
    assert.equal(zone.commune, null);
    assert.ok(zone.candidates.some((c) => c.codeInsee === CAVAILLON));
  });

  it("classe hors zone un code postal étranger au Vaucluse", () => {
    const zone = clientZone({ postalCode: "13100" });
    assert.equal(zone.zone, "HORS_ZONE");
    assert.equal(zone.source, "codePostal");
    assert.deepEqual([...zone.candidates], []);
  });

  it("ne suppose rien quand la fiche ne porte ni commune ni code postal", () => {
    const zone = clientZone({});
    assert.equal(zone.source, "inconnu");
    assert.equal(zone.zone, "HORS_ZONE");
  });
});
