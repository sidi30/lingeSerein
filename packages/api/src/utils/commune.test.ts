/**
 * Alignement de l'adresse sur la commune choisie.
 *
 * Trois champs décrivent le même lieu (`communeInsee`, `city`, `postalCode`) et
 * un seul est vérifié contre une liste fermée. Sans cet alignement, une fiche
 * peut affirmer trois choses différentes : le tarif suit la commune, l'étiquette
 * de livraison suit la ville, et le rattachement à une tournée suit le code
 * postal. Ces tests fixent lequel des trois fait autorité.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { alignementCommune } from "./commune.ts";

const ORANGE = "84087";
const AVIGNON = "84007"; // deux codes postaux : 84000 et 84140
const CAVAILLON = "84035";

describe("alignementCommune", () => {
  it("ne touche à rien tant qu'aucune commune n'est fournie", () => {
    // Les fiches antérieures à la liste fermée gardent leur adresse telle quelle.
    assert.equal(alignementCommune({ city: "Orange", postalCode: "84100" }), null);
    assert.equal(alignementCommune({ communeInsee: null }), null);
    assert.equal(alignementCommune({ communeInsee: "  " }), null);
  });

  it("ne touche à rien pour une commune hors périmètre", () => {
    // Le refus se fait à la validation (400) ; ici, on ne réécrit surtout pas
    // l'adresse à partir d'une commune qu'on ne connaît pas.
    assert.equal(alignementCommune({ communeInsee: "13055", city: "Marseille" }), null);
  });

  it("réécrit la ville et le code postal d'après la commune", () => {
    assert.deepEqual(alignementCommune({ communeInsee: ORANGE }), {
      city: "Orange",
      postalCode: "84100",
    });
  });

  it("corrige une ville qui contredit la commune", () => {
    // « Cavaillon / 84100 / Orange » : le tarif suivait la commune et l'adresse
    // imprimée suivait la ville. La commune est le seul des trois choisi dans
    // une liste — c'est elle qui fait autorité.
    assert.deepEqual(alignementCommune({ communeInsee: CAVAILLON, city: "Orange" }), {
      city: "Cavaillon",
      postalCode: "84300",
    });
  });

  it("conserve un code postal juste quand la commune en porte plusieurs", () => {
    // Avignon porte 84000 ET 84140 : écraser le 84140 d'un client par le premier
    // de la liste dégraderait une adresse pourtant exacte.
    assert.deepEqual(alignementCommune({ communeInsee: AVIGNON, postalCode: "84140" }), {
      city: "Avignon",
      postalCode: "84140",
    });
    assert.deepEqual(alignementCommune({ communeInsee: AVIGNON, postalCode: "84000" }), {
      city: "Avignon",
      postalCode: "84000",
    });
  });

  it("remplace un code postal étranger à la commune", () => {
    assert.deepEqual(alignementCommune({ communeInsee: AVIGNON, postalCode: "13000" }), {
      city: "Avignon",
      postalCode: "84000",
    });
  });
});
