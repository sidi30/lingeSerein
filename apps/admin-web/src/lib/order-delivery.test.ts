/**
 * La date de livraison porte un PRIX, et c'est le piège que ces tests ferment :
 *
 * 1. un `<input type="date">` sans borne laisse choisir aujourd'hui — soit le
 *    forfait « Jour même » (39 €) sur une saisie au comptoir, sans que rien ne
 *    l'annonce ; le palier doit donc être lisible dès la sélection ;
 * 2. le barème appartient à `@lingengo/shared` : ces tests vérifient la
 *    TRADUCTION date → palier, jamais les montants eux-mêmes, sinon le jour où
 *    le forfait change il faudrait le changer à deux endroits ;
 * 3. le jour local n'est pas le jour UTC : `toISOString()` donne la veille pour
 *    toute soirée d'été française, et bornerait l'input un jour trop tôt.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { URGENCY_TIERS } from "@lingengo/shared";

import { delaiJours, deliveryUrgencyNotice, isoDay } from "./order-delivery.ts";

const AUJOURDHUI = "2026-07-30";

describe("isoDay", () => {
  it("écrit le jour LOCAL, pas le jour UTC", () => {
    // 23 h 30 le 30 juillet en heure d'été française = 21 h 30 UTC le 30 —
    // mais une heure locale tardive en zone UTC+2 bascule vite de jour en UTC.
    // On construit la date par ses composantes locales : c'est ce jour-là qu'on
    // doit relire, quel que soit le fuseau de la machine.
    const soir = new Date(2026, 6, 30, 23, 30, 0);
    assert.equal(isoDay(soir), "2026-07-30");
  });

  it("complète mois et jour sur deux chiffres", () => {
    assert.equal(isoDay(new Date(2026, 0, 5)), "2026-01-05");
  });
});

describe("delaiJours", () => {
  it("compte en jours de calendrier, dans le sens commande → livraison", () => {
    // Le sens compte : inversé, une livraison lointaine passerait pour la plus
    // urgente de toutes (délai négatif ⇒ « Jour même »).
    assert.equal(delaiJours("2026-07-30", AUJOURDHUI), 0);
    assert.equal(delaiJours("2026-07-31", AUJOURDHUI), 1);
    assert.equal(delaiJours("2026-08-09", AUJOURDHUI), 10);
  });

  it("rend un délai négatif pour une date déjà passée", () => {
    assert.equal(delaiJours("2026-07-29", AUJOURDHUI), -1);
  });

  it("ne bascule pas au changement d'heure", () => {
    // Dimanche 29 mars 2026 : nuit de 23 h en France. Compté en heures, J+2
    // deviendrait 47 h et retomberait sur le palier « Express 24 h ».
    assert.equal(delaiJours("2026-03-30", "2026-03-28"), 2);
  });

  it("se tait sur une saisie vide ou impossible", () => {
    for (const value of ["", "30/07/2026", "2026-02-31", "2026-13-01"]) {
      assert.equal(delaiJours(value, AUJOURDHUI), null, value);
    }
  });
});

describe("deliveryUrgencyNotice", () => {
  it("annonce le forfait « Jour même » sur une date du jour", () => {
    const notice = deliveryUrgencyNotice(AUJOURDHUI, AUJOURDHUI);
    assert.ok(notice);
    assert.equal(notice.level, "JOUR_MEME");
    assert.equal(notice.urgent, true);
    // Le montant vient du barème partagé, jamais d'une constante recopiée ici.
    const tier = URGENCY_TIERS.find((t) => t.level === "JOUR_MEME");
    assert.equal(notice.feeCents, tier?.feeCents);
    assert.match(notice.message, /39,00/);
    assert.match(notice.message, /EN PLUS/);
  });

  it("annonce le forfait « Express 24 h » sur le lendemain", () => {
    const notice = deliveryUrgencyNotice("2026-07-31", AUJOURDHUI);
    assert.ok(notice);
    assert.equal(notice.level, "EXPRESS_24H");
    assert.equal(notice.urgent, true);
    assert.match(notice.message, /25,00/);
  });

  it("dit aussi ce qui se passe SANS forfait, à partir de J+2", () => {
    // Le silence n'est pas une information : sans phrase, l'utilisateur ne sait
    // pas s'il vient d'éviter le forfait ou si l'écran ne sait rien.
    for (const date of ["2026-08-01", "2026-08-15"]) {
      const notice = deliveryUrgencyNotice(date, AUJOURDHUI);
      assert.ok(notice, date);
      assert.equal(notice.level, "STANDARD");
      assert.equal(notice.urgent, false);
      assert.equal(notice.feeCents, 0);
      assert.match(notice.message, /barème de zone/);
      assert.doesNotMatch(notice.message, /forfait de/);
    }
  });

  it("traite une date déjà passée comme le palier le plus urgent", () => {
    // Ce que fera le serveur : un délai négatif est la commande « pour hier ».
    // L'input porte un `min`, mais une valeur collée peut le contourner —
    // l'écran doit alors annoncer le forfait, pas rassurer à tort.
    const notice = deliveryUrgencyNotice("2026-07-01", AUJOURDHUI);
    assert.equal(notice?.level, "JOUR_MEME");
    assert.equal(notice?.urgent, true);
  });

  it("n'annonce rien tant qu'aucune date n'est saisie", () => {
    assert.equal(deliveryUrgencyNotice("", AUJOURDHUI), null);
  });
});
