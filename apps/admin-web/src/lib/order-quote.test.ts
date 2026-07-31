/**
 * Les règles de la passerelle commande → devis, et le calcul des montants.
 *
 * Quatre pièges y sont figés, parce qu'aucun ne se voit à la relecture :
 *
 * 1. `totalCents` est le SOUS-TOTAL des articles — l'afficher comme total à
 *    payer sous-facture la livraison ;
 * 2. trois cas de frais, pas deux : montant dû, gratuité réelle (0 €), et
 *    course « sur devis » — qui vaut aussi 0 € en base SANS être offerte.
 *    Des frais absents du contrat (API plus ancienne) forment un quatrième
 *    cas : inconnus, donc tus ;
 * 3. un devis rattaché à une commande peut l'avoir précédée (`convertedFrom`)
 *    ou suivie (`generated`) — deux relations distinctes, qui coexistent ;
 * 4. la route d'émission est idempotente : seul le code HTTP dit si le devis
 *    vient d'être créé ou existait déjà.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  QUOTE_GENERATION_BLOCKED,
  formatDeliveryFee,
  orderAmounts,
  quoteDeliveryLabel,
  quoteDeliveryVisible,
  quoteFromOrderMessage,
  quoteGenerationBlockedReason,
  quoteLinks,
  type OrderQuoteView,
} from "./order-quote.ts";

const QUOTE = { id: "q1", numero: "DEV-2026-0001" };
const AUTRE = { id: "q2", numero: "DEV-2026-0002" };

/** Commande de base : née dans l'app mobile, aucun devis rattaché. */
const MOBILE: OrderQuoteView = {
  convertedFromQuote: null,
  generatedQuote: null,
};

describe("quoteLinks", () => {
  it("ne trouve aucun devis quand la commande n'en porte pas", () => {
    assert.deepEqual(quoteLinks(MOBILE), { converted: null, generated: null });
    // Champs simplement absents (API plus ancienne) : pas d'exception, pas de lien.
    assert.deepEqual(quoteLinks({}), { converted: null, generated: null });
  });

  it("lit le devis à l'origine de la commande", () => {
    assert.deepEqual(quoteLinks({ ...MOBILE, convertedFromQuote: QUOTE }), {
      converted: QUOTE,
      generated: null,
    });
  });

  it("lit le devis émis depuis la commande", () => {
    assert.deepEqual(quoteLinks({ ...MOBILE, generatedQuote: QUOTE }), {
      converted: null,
      generated: QUOTE,
    });
  });

  it("ne confond pas les deux sens quand ils coexistent", () => {
    // Une commande née du devis A peut ensuite produire le devis B. Afficher un
    // seul lien ferait disparaître l'autre — et confondre les sens ferait dire
    // à l'écran « commande issue du devis B », ce qui est faux.
    const links = quoteLinks({ convertedFromQuote: QUOTE, generatedQuote: AUTRE });
    assert.deepEqual(links.converted, QUOTE);
    assert.deepEqual(links.generated, AUTRE);
  });
});

describe("quoteGenerationBlockedReason", () => {
  it("laisse générer sur tout statut sauf annulé", () => {
    for (const status of ["PENDING", "CONFIRMED", "IN_DELIVERY", "DELIVERED"] as const) {
      assert.equal(quoteGenerationBlockedReason(status), null, status);
    }
  });

  it("autorise explicitement une commande EN ATTENTE", () => {
    // Régression gardée : le serveur accepte PENDING à dessein — chiffrer avant
    // de confirmer est l'usage le plus courant. Un garde-fou zélé ici
    // désactiverait le bouton sur le parcours principal.
    assert.equal(quoteGenerationBlockedReason("PENDING"), null);
  });

  it("refuse sur une commande annulée, et l'explique", () => {
    const reason = quoteGenerationBlockedReason("CANCELLED");
    assert.equal(reason, QUOTE_GENERATION_BLOCKED.CANCELLED);
    assert.ok(reason && reason.length > 20, "la raison doit expliquer, pas seulement refuser");
  });
});

describe("quoteFromOrderMessage", () => {
  it("annonce la création sur un 201", () => {
    assert.equal(quoteFromOrderMessage(201, "DEV-2026-0001"), "Devis DEV-2026-0001 créé");
  });

  it("n'annonce PAS une création quand le devis existait déjà (200)", () => {
    // La route est idempotente : même corps, seul le code diffère. Dire
    // « créé » ferait craindre un doublon dans la section devis.
    const message = quoteFromOrderMessage(200, "DEV-2026-0001");
    assert.match(message, /déjà généré/);
    assert.doesNotMatch(message, /créé/);
  });
});

describe("orderAmounts", () => {
  it("ajoute les frais de livraison au sous-total des articles", () => {
    assert.deepEqual(orderAmounts({ totalCents: 5000, deliveryFeeCents: 1200 }), {
      subtotalCents: 5000,
      deliveryFeeCents: 1200,
      deliveryFeeSurDevis: false,
      totalCents: 6200,
    });
  });

  it("distingue « frais inconnus » de « frais nuls »", () => {
    // Champ absent (API plus ancienne) ⇒ null : l'écran n'affiche aucune ligne
    // de frais, au lieu d'annoncer une gratuité qu'il ne peut pas connaître.
    for (const order of [{ totalCents: 5000 }, { totalCents: 5000, deliveryFeeCents: null }]) {
      const amounts = orderAmounts(order);
      assert.equal(amounts.deliveryFeeCents, null);
      assert.equal(amounts.totalCents, 5000);
    }

    const offerte = orderAmounts({ totalCents: 5000, deliveryFeeCents: 0 });
    assert.equal(offerte.deliveryFeeCents, 0);
    assert.equal(offerte.totalCents, 5000);
  });

  it("ne confond jamais le sous-total avec le total à payer", () => {
    const amounts = orderAmounts({ totalCents: 2900, deliveryFeeCents: 2500 });
    assert.notEqual(amounts.totalCents, amounts.subtotalCents);
    assert.equal(amounts.totalCents, 5400);
  });

  it("remonte le drapeau « sur devis » depuis les colonnes brutes (liste)", () => {
    // La liste renvoie le modèle Prisma tel quel : pas de résumé `deliveryFee`.
    const amounts = orderAmounts({
      totalCents: 5000,
      deliveryFeeCents: 0,
      deliveryFeeSurDevis: true,
    });
    assert.equal(amounts.deliveryFeeSurDevis, true);
    assert.equal(amounts.totalCents, 5000);
  });

  it("lit le résumé `deliveryFee` de la fiche en priorité", () => {
    // Fiche : `deliveryFee: resumeFrais(order)` en plus des colonnes brutes.
    // Les deux sources concordent en pratique ; en cas de désaccord, le résumé
    // est celui que le serveur a calculé — c'est lui qui fait foi.
    const amounts = orderAmounts({
      totalCents: 5000,
      deliveryFeeCents: 1200,
      deliveryFeeSurDevis: false,
      deliveryFee: { cents: 0, surDevis: true },
    });
    assert.equal(amounts.deliveryFeeCents, 0);
    assert.equal(amounts.deliveryFeeSurDevis, true);
    assert.equal(amounts.totalCents, 5000);
  });
});

describe("formatDeliveryFee", () => {
  it("écrit « Offerte » plutôt qu'un zéro muet", () => {
    assert.equal(formatDeliveryFee(0), "Offerte");
    assert.equal(formatDeliveryFee(0, false), "Offerte");
  });

  it("n'annonce JAMAIS « offerte » sur une course encore à chiffrer", () => {
    // Le piège : « sur devis » vaut 0 en base. Le lire comme une gratuité
    // promettrait au client une livraison gratuite que personne n'a décidée.
    assert.equal(formatDeliveryFee(0, true), "Sur devis");
  });

  it("formate un montant facturé en euros", () => {
    // Espace insécable étroit dans la locale fr-FR : on teste le contenu, pas
    // l'octet exact qui sépare le nombre du symbole.
    const label = formatDeliveryFee(1200);
    assert.match(label, /12,00/);
    assert.match(label, /€/);
  });
});

describe("quoteDeliveryLabel", () => {
  it("affiche le libellé du serveur MOT POUR MOT", () => {
    // C'est ce libellé qui est imprimé sur le devis envoyé au client. Le
    // reformuler à l'écran ferait diverger la gestion du document.
    const label = quoteDeliveryLabel({
      livraisonCents: 0,
      livraisonSurDevis: true,
      livraisonLabel: "Livraison hors zone — sur devis",
    });
    assert.equal(label, "Livraison hors zone — sur devis");
  });

  it("n'écrit JAMAIS « offerte » sur un devis à chiffrer, même sans libellé serveur", () => {
    // Le drapeau seul suffit à interdire la déduction par le montant : le
    // repli `deliveryLabelFromCents` lit tout zéro comme une gratuité.
    const label = quoteDeliveryLabel({ livraisonCents: 0, livraisonSurDevis: true });
    assert.match(label, /sur devis/i);
    assert.doesNotMatch(label, /offerte/i);
  });

  it("retombe sur la déduction par le montant quand l'API ne dit rien", () => {
    // API plus ancienne : ni libellé ni drapeau. Le comportement d'avant est
    // conservé — un 0 € y reste une gratuité commerciale.
    assert.equal(quoteDeliveryLabel({ livraisonCents: 0 }), "Livraison offerte");
    // 25 € reste VOLONTAIREMENT anonyme : depuis le barème Vaucluse, c'est à la
    // fois le forfait Express 24 h et le palier « au-delà de 35 km » (Cavaillon,
    // Apt, Pertuis). Deviner « Express 24 h » sur le montant facturerait au
    // client une urgence qu'il n'a jamais demandée. Le libellé exact vient du
    // serveur (`livraisonLabel`), figé à l'émission.
    assert.equal(quoteDeliveryLabel({ livraisonCents: 2500 }), "Livraison");
    assert.doesNotMatch(quoteDeliveryLabel({ livraisonCents: 2500 }), /Express/i);
  });

  it("ignore un libellé serveur vide plutôt que d'afficher une ligne muette", () => {
    assert.equal(
      quoteDeliveryLabel({ livraisonCents: 0, livraisonLabel: "   " }),
      "Livraison offerte",
    );
  });
});

describe("quoteDeliveryVisible", () => {
  it("montre la ligne d'une course à chiffrer, bien qu'elle vaille 0 €", () => {
    // Filtrer sur `livraisonCents > 0` effaçait de l'écran le seul montant que
    // le propriétaire doit encore fixer à la main.
    assert.equal(quoteDeliveryVisible({ livraisonCents: 0, livraisonSurDevis: true }), true);
  });

  it("reste muet sur un devis ordinaire sans frais", () => {
    assert.equal(quoteDeliveryVisible({ livraisonCents: 0 }), false);
    assert.equal(quoteDeliveryVisible({ livraisonCents: 1200 }), true);
  });
});
