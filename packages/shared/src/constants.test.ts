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
  computePackSereniteComparison,
  deliveryLabelFromCents,
  urgencyFromDelaiJours,
  urgencyTier,
} from "./constants.ts";

describe("computeDeliveryFee — niveau STANDARD", () => {
  it("facture 12 € à Orange sous les deux seuils de gratuité", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 5000,
      nbKits: 3,
      urgency: "STANDARD",
    });
    assert.equal(fee.cents, 1200);
    assert.equal(fee.offerte, false);
    assert.equal(fee.surDevis, false);
    assert.equal(fee.urgencyLevel, "STANDARD");
  });

  it("offre la livraison à Orange dès 4 kits, même sous 120 €", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 5000,
      nbKits: DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE,
    });
    assert.equal(fee.cents, 0);
    assert.equal(fee.offerte, true);
    assert.match(fee.label, /offerte \(Orange/);
  });

  it("offre la livraison dès 120 € de commande, quel que soit le nombre de kits", () => {
    const fee = computeDeliveryFee({
      zone: "PROCHE",
      montantApresRemiseCents: DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS,
      nbKits: 1,
    });
    assert.equal(fee.cents, 0);
    assert.equal(fee.offerte, true);
  });

  it("facture 12 € dans les villes limitrophes, sans gratuité au nombre de kits", () => {
    const fee = computeDeliveryFee({
      zone: "PROCHE",
      montantApresRemiseCents: 5000,
      nbKits: 8,
    });
    assert.equal(fee.cents, DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS);
    assert.equal(fee.offerte, false);
    assert.match(fee.label, /villes limitrophes/);
  });

  it("bascule hors zone sur devis, sans montant public", () => {
    const fee = computeDeliveryFee({
      zone: "HORS_ZONE",
      montantApresRemiseCents: 50000,
      nbKits: 20,
    });
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
  it("produit le même libellé pour le forfait Express 24 h", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 1000,
      nbKits: 1,
      urgency: "EXPRESS_24H",
    });
    assert.equal(deliveryLabelFromCents(fee.cents), fee.label);
  });

  it("produit le même libellé pour le forfait Jour même", () => {
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 1000,
      nbKits: 1,
      urgency: "JOUR_MEME",
    });
    assert.equal(deliveryLabelFromCents(fee.cents), fee.label);
  });

  it("reste cohérent sur une livraison offerte, au préfixe près", () => {
    // Le repli par montant ne peut pas deviner le MOTIF de la gratuité (seuil ou
    // nombre de kits) : on vérifie donc la compatibilité, pas l'égalité stricte.
    const fee = computeDeliveryFee({
      zone: "ORANGE",
      montantApresRemiseCents: 50000,
      nbKits: 10,
    });
    assert.equal(fee.cents, 0);
    assert.equal(deliveryLabelFromCents(0), "Livraison offerte");
    assert.ok(fee.label.startsWith("Livraison offerte"));
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
