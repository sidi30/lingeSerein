/**
 * Frais de livraison, jauge d'urgence et comparaison Pack Sérénité.
 * Ces règles sont la source de vérité du devis, du contrat et de la vitrine :
 * un changement non intentionnel ici se voit sur un document client.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_DEFAULTS,
  DELIVERY_DEFAULTS,
  SUBSCRIPTION_DEFAULTS,
  computeDeliveryFee,
  PASSAGE_GROUPE,
  PASSAGE_GROUPE_TEXT,
  passageGroupeFeeCents,
  computePackSereniteComparison,
  deliveryLabelFromCents,
  urgencyFromDelaiJours,
  urgencyTier,
} from "./constants.ts";

describe("computeDeliveryFee — niveau STANDARD", () => {
  it("ne facture jamais la livraison à Orange, quel que soit le montant", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 5000,
      urgency: "STANDARD",
    });
    assert.equal(fee.cents, 0);
    assert.equal(fee.surDevis, false);
    assert.equal(fee.urgencyLevel, "STANDARD");
    // `offerte` reste FAUX : rien n'a été offert, la course n'est pas facturée
    // à Orange. Le distinguer évite d'imprimer « offerte dès 120 € » sur une
    // commande orangeoise de 50 €, promesse que le barème ne tient pas.
    assert.equal(fee.offerte, false);
    assert.match(fee.label, /Orange/);
  });

  it("facture 12 € jusqu'à 15 km d'Orange", () => {
    const fee = computeDeliveryFee({ zone: "PROCHE", montantApresRemiseCents: 5000 });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS);
    assert.equal(fee.cents, 1200);
    assert.equal(fee.offerte, false);
  });

  it("facture 15 € de 15 à 35 km (Avignon, Carpentras)", () => {
    const fee = computeDeliveryFee({ zone: "INTERMEDIAIRE", montantApresRemiseCents: 5000 });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.ZONE_INTERMEDIAIRE_CENTS);
    assert.equal(fee.cents, 1500);
  });

  it("facture 25 € au-delà de 35 km (Cavaillon, Apt, Pertuis)", () => {
    const fee = computeDeliveryFee({ zone: "ELOIGNE", montantApresRemiseCents: 5000 });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.ZONE_ELOIGNE_CENTS);
    assert.equal(fee.cents, 2500);
    // Même montant que le forfait Express 24 h, mais ce n'est PAS une urgence :
    // c'est ce que `deliveryLabelFromCents` ne peut plus deviner.
    assert.equal(fee.urgent, false);
    assert.equal(fee.urgencyLevel, "STANDARD");
  });

  it("offre la livraison dès 120 € de commande, dans tous les paliers payants", () => {
    for (const zone of ["PROCHE", "INTERMEDIAIRE", "ELOIGNE"] as const) {
      const fee = computeDeliveryFee({
        zone,
        montantApresRemiseCents: DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS,
      });
      assert.equal(fee.cents, 0, `palier ${zone}`);
      assert.equal(fee.offerte, true, `palier ${zone}`);
    }
  });

  it("bascule hors Vaucluse sur devis, sans montant public", () => {
    const fee = computeDeliveryFee({ zone: "HORS_ZONE", montantApresRemiseCents: 50000 });
    assert.equal(fee.cents, 0);
    assert.equal(fee.surDevis, true);
    assert.equal(fee.offerte, false, "hors zone n'est pas une livraison offerte");
  });
});

describe("computeDeliveryFee — forfaits d'urgence", () => {
  it("applique 25 € en Express 24 h en ignorant les seuils de gratuité", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 50000,
      nbKits: 20,
      urgency: "EXPRESS_24H",
    });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS);
    assert.equal(fee.cents, 2500);
    assert.equal(fee.urgent, true);
    assert.equal(fee.offerte, false);
  });

  it("applique 39 € en Jour même en ignorant les seuils de gratuité", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 50000,
      nbKits: 20,
      urgency: "JOUR_MEME",
    });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.JOUR_MEME_FEE_CENTS);
    assert.equal(fee.cents, 3900);
    assert.equal(fee.urgent, true);
  });

  it("laisse le Flash < 3 h sur devis, sans prix public", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 1000,
      nbKits: 1,
      urgency: "FLASH",
    });
    assert.equal(fee.cents, 0);
    assert.equal(fee.surDevis, true);
    assert.equal(fee.urgent, true);
  });

  it("fait primer le hors-zone sur le forfait d'urgence", () => {
    const fee = computeDeliveryFee({
      zone: "HORS_ZONE",
      montantApresRemiseCents: 1000,
      nbKits: 1,
      urgency: "JOUR_MEME",
    });
    assert.equal(fee.surDevis, true, "aucun barème public hors zone, même en urgence");
    assert.equal(fee.cents, 0);
    assert.equal(fee.urgencyLevel, "JOUR_MEME", "le niveau demandé reste tracé");
  });

  it("donne priorité à `urgency` sur `delaiJours`", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 1000,
      nbKits: 1,
      delaiJours: 5,
      urgency: "EXPRESS_24H",
    });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS);
  });
});

describe("urgencyFromDelaiJours", () => {
  it("traduit 0 jour en Jour même", () => {
    assert.equal(urgencyFromDelaiJours(0), "JOUR_MEME");
  });

  it("traduit 1 jour en Express 24 h", () => {
    assert.equal(urgencyFromDelaiJours(1), "EXPRESS_24H");
  });

  it("traduit 2 jours et plus en Standard", () => {
    assert.equal(urgencyFromDelaiJours(2), "STANDARD");
    assert.equal(urgencyFromDelaiJours(7), "STANDARD");
  });

  it("retombe sur Standard quand le délai est inconnu ou invalide", () => {
    assert.equal(urgencyFromDelaiJours(undefined), "STANDARD");
    assert.equal(urgencyFromDelaiJours(Number.NaN), "STANDARD");
  });
});

describe("concordance des libellés de livraison devis ↔ contrat", () => {
  it("NE devine PAS un Express 24 h à partir de 25 €, devenus ambigus", () => {
    const express = computeDeliveryFee({
      zone: "PROCHE",
      montantApresRemiseCents: 1000,
      urgency: "EXPRESS_24H",
    });
    const eloigne = computeDeliveryFee({ zone: "ELOIGNE", montantApresRemiseCents: 1000 });

    // Deux situations sans rapport, rigoureusement le même montant.
    assert.equal(express.cents, 2500);
    assert.equal(eloigne.cents, 2500);
    assert.equal(express.urgent, true);
    assert.equal(eloigne.urgent, false);

    // Le repli par montant refuse donc de trancher. S'il annonçait « Express
    // 24 h », le devis d'une livraison ordinaire à Cavaillon facturerait au
    // client une urgence qu'il n'a jamais demandée.
    assert.equal(deliveryLabelFromCents(2500), "Livraison");
    assert.doesNotMatch(deliveryLabelFromCents(2500), /Express/);
  });

  it("produit le même libellé pour le forfait Jour même, resté sans équivoque", () => {
    const fee = computeDeliveryFee({
      zone: "PROCHE",
      montantApresRemiseCents: 1000,
      urgency: "JOUR_MEME",
    });
    assert.equal(fee.cents, 3900);
    assert.equal(deliveryLabelFromCents(fee.cents), fee.label);
  });

  it("reste cohérent sur une livraison offerte, au préfixe près", () => {
    const fee = computeDeliveryFee({ zone: "PROCHE", montantApresRemiseCents: 50000 });
    assert.equal(fee.cents, 0);
    assert.equal(fee.offerte, true);
    assert.equal(deliveryLabelFromCents(0), "Livraison offerte");
    assert.ok(fee.label.startsWith("Livraison offerte"));
  });

  it("dit « offerte » pour un zéro venu du seuil, mais pas pour Orange", () => {
    // Les deux valent 0 € et se ressemblent, sauf que l'un est une faveur
    // conditionnelle et l'autre le tarif permanent de la commune du siège.
    const orange = computeDeliveryFee({ zone: "ORANGE", montantApresRemiseCents: 1000 });
    assert.equal(orange.cents, 0);
    assert.equal(orange.offerte, false);
    assert.doesNotMatch(orange.label, /offerte/);
  });

  it("ne prétend pas connaître un montant de livraison arbitraire", () => {
    assert.equal(deliveryLabelFromCents(777), "Livraison");
  });
});

describe("urgencyTier", () => {
  it("retombe sur Standard pour un niveau inconnu", () => {
    // Cast volontaire : on simule une valeur venue de la base, hors du type.
    const tier = urgencyTier("INEXISTANT" as never);
    assert.equal(tier.level, "STANDARD");
  });

  it("expose des forfaits alignés sur DELIVERY_DEFAULTS", () => {
    assert.equal(urgencyTier("EXPRESS_24H").feeCents, DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS);
    assert.equal(urgencyTier("JOUR_MEME").feeCents, DELIVERY_DEFAULTS.JOUR_MEME_FEE_CENTS);
    assert.equal(urgencyTier("FLASH").feeCents, null, "le Flash n'a pas de prix public");
  });
});

describe("computePackSereniteComparison", () => {
  it("chiffre le panier mensuel à-la-carte à 150 € et l'économie à 61 €", () => {
    const c = computePackSereniteComparison();
    assert.equal(c.alaCarteCents, 15000);
    assert.equal(c.packCents, 8900);
    assert.equal(c.economieCents, 6100);
  });

  it("compose le panier sans multiplier par le nombre de rotations", () => {
    const c = computePackSereniteComparison();
    const attendu =
      SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY * CATALOG_DEFAULTS.KIT_BAIN_CENTS +
      SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY * CATALOG_DEFAULTS.KIT_LIT_CENTS +
      SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH * DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS;
    assert.equal(c.alaCarteCents, attendu);
  });
});

describe("cohérence de la dotation d'abonnement", () => {
  it("répartit exactement la dotation mensuelle sur les passages", () => {
    assert.equal(
      SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY_PER_PASSAGE * SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH,
      SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY,
    );
    assert.equal(
      SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY_PER_PASSAGE * SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH,
      SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY,
    );
  });

  it("garde le Kit Complet cohérent avec ses composants et la remise groupage", () => {
    const attendu =
      CATALOG_DEFAULTS.KIT_BAIN_CENTS +
      CATALOG_DEFAULTS.KIT_LIT_CENTS +
      CATALOG_DEFAULTS.KIT_COMPLET_SERVIETTES_INCLUSES * CATALOG_DEFAULTS.SERVIETTE_CENTS -
      CATALOG_DEFAULTS.KIT_COMPLET_DISCOUNT_CENTS;
    assert.equal(CATALOG_DEFAULTS.KIT_COMPLET_CENTS, attendu);
    assert.equal(CATALOG_DEFAULTS.KIT_COMPLET_CENTS, 2900);
  });
});

describe("passage groupé — la SEULE remise sur la livraison", () => {
  it("facture la moitié du palier de la commune", () => {
    const fee = computeDeliveryFee({
      zone: "INTERMEDIAIRE",
      montantApresRemiseCents: 5000,
      passageGroupe: true,
    });
    // Avignon : 15 € plein tarif, 7,50 € quand le camion y passe déjà.
    assert.equal(fee.cents, 750);
    assert.equal(fee.passageGroupe, true);
    assert.match(fee.label, /passage déjà prévu/i);
  });

  it("remise chaque palier payant, arrondi au centime supérieur", () => {
    assert.equal(passageGroupeFeeCents("PROCHE"), 600);
    assert.equal(passageGroupeFeeCents("INTERMEDIAIRE"), 750);
    assert.equal(passageGroupeFeeCents("ELOIGNE"), 1250);
  });

  it("ne facture toujours rien à Orange : il n'y avait rien à remiser", () => {
    assert.equal(passageGroupeFeeCents("ORANGE"), 0);
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 5000,
      passageGroupe: true,
    });
    assert.equal(fee.cents, 0);
  });

  it("NE remise PAS un forfait d'urgence — le déplacement y reste dédié", () => {
    for (const urgency of ["EXPRESS_24H", "JOUR_MEME"] as const) {
      const fee = computeDeliveryFee({
        zone: "PROCHE",
        montantApresRemiseCents: 5000,
        urgency,
        passageGroupe: true,
      });
      assert.equal(fee.cents, urgencyTier(urgency).feeCents, urgency);
      assert.notEqual(fee.passageGroupe, true, urgency);
    }
  });

  it("laisse le hors zone sur devis : il n'existe aucun tarif à diviser", () => {
    const fee = computeDeliveryFee({
      zone: "HORS_ZONE",
      montantApresRemiseCents: 5000,
      passageGroupe: true,
    });
    assert.equal(fee.surDevis, true);
    assert.equal(fee.cents, 0);
  });

  it("ne réintroduit aucun frais quand la livraison est déjà offerte au seuil", () => {
    const fee = computeDeliveryFee({
      zone: "ELOIGNE",
      montantApresRemiseCents: DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS,
      passageGroupe: true,
    });
    assert.equal(fee.cents, 0);
    assert.equal(fee.offerte, true);
  });

  it("rend la reprise du linge sale gratuite", () => {
    assert.equal(PASSAGE_GROUPE.REPRISE_CENTS, 0);
  });

  it("annonce la remise dans les mêmes termes partout", () => {
    assert.match(PASSAGE_GROUPE_TEXT, /50 % moins cher/);
    assert.match(PASSAGE_GROUPE_TEXT, /reprise .* gratuite/i);
    assert.match(PASSAGE_GROUPE_TEXT, /ne s'applique pas aux forfaits d'urgence/i);
  });
});
