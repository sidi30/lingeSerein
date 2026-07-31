import { deliveryLabelFromCents } from "@lingengo/shared";

/**
 * Libellé des frais de livraison d'un DEVIS, tel qu'il doit être imprimé.
 *
 * `deliveryLabelFromCents` déduit l'intitulé du seul montant, et rend
 * « Livraison offerte » à 0 €. C'est juste pour une livraison réellement
 * offerte, et FAUX pour une course hors zone ou une urgence Flash : là, 0 €
 * signifie « aucun tarif public, à chiffrer à la main ». Le devis étant la pièce
 * que le client signe, l'y imprimer « offerte » revient à promettre la gratuité
 * d'une course qu'on facturera.
 *
 * Ce libellé est passé EXPLICITEMENT à `resolveLivraisonLabel`, qui respecte
 * toujours un libellé fourni et ne retombe sur le montant qu'à défaut. C'est le
 * même mécanisme qui empêche déjà un montant saisi à la main de s'imprimer
 * « Express 24 h » sur une facture.
 */
export function libelleLivraisonDevis(quote: {
  livraisonCents: number;
  livraisonSurDevis: boolean;
}): string {
  return quote.livraisonSurDevis
    ? "Livraison — sur devis (à chiffrer)"
    : deliveryLabelFromCents(quote.livraisonCents);
}
