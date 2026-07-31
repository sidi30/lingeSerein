/**
 * Jour calendaire canonique.
 *
 * Le bug d'origine, constaté sur le planning : une rotation livrée « aujourd'hui »
 * saisie depuis un poste à Paris atterrissait en base à la VEILLE, disparaissait
 * de la vue « 7 jours » et faisait partir le rappel de reprise un jour trop tôt.
 * Cause : une date-jour construite à minuit LOCAL est écrite dans une colonne
 * `@db.Date` d'après sa partie UTC — soit le jour précédent dès que le serveur
 * est en avance sur UTC.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aujourdHui, jourCalendaire } from "./dates";

describe("jourCalendaire", () => {
  it("prend une chaîne AAAA-MM-JJ au mot", () => {
    const jour = jourCalendaire("2026-07-31");
    assert.equal(jour.toISOString(), "2026-07-31T00:00:00.000Z");
  });

  it("ne recule PAS d'un jour depuis un poste en avance sur UTC", () => {
    // 31/07 à 00 h 30 à Paris = 30/07 22 h 30 UTC. C'est le cas qui cassait :
    // pour l'exploitation on est le 31, et c'est le 31 qui doit être écrit.
    const instant = new Date("2026-07-30T22:30:00.000Z");
    assert.equal(jourCalendaire(instant).toISOString(), "2026-07-31T00:00:00.000Z");
  });

  it("ne saute PAS au lendemain depuis un fuseau en retard sur UTC", () => {
    // 31/07 à 21 h à New York = 01/08 01 h UTC : le jour d'exploitation reste
    // celui d'Orange, jamais celui du serveur.
    const instant = new Date("2026-08-01T01:00:00.000Z");
    assert.equal(
      jourCalendaire(instant, "America/New_York").toISOString(),
      "2026-07-31T00:00:00.000Z",
    );
  });

  it("est idempotente : rejouer la conversion ne décale rien", () => {
    const une = jourCalendaire("2026-10-25"); // jour du passage à l'heure d'hiver
    assert.equal(jourCalendaire(une).toISOString(), une.toISOString());
  });

  it("garde les jours à 24 h exactes, changement d'heure compris", () => {
    // 25/10/2026 : CEST → CET. Un pas de 86 400 000 ms doit rester un jour plein
    // sur des minuits UTC — c'est ce qui autorise le worker à avancer ainsi.
    const veille = jourCalendaire("2026-10-25");
    const lendemain = new Date(veille.getTime() + 86_400_000);
    assert.equal(lendemain.toISOString(), "2026-10-26T00:00:00.000Z");
  });

  it("laisse passer une date invalide sans lever", () => {
    assert.ok(Number.isNaN(jourCalendaire("pas-une-date").getTime()));
  });
});

describe("aujourdHui", () => {
  it("rend le jour d'exploitation de l'instant donné", () => {
    assert.equal(
      aujourdHui(new Date("2026-07-30T22:30:00.000Z")).toISOString(),
      "2026-07-31T00:00:00.000Z",
    );
  });
});
