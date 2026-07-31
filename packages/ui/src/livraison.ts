/**
 * Frais de livraison, tels qu'ils s'impriment sur un document.
 *
 * Un seul piège, mais il coûte cher : **0 € ne veut pas dire « offerte »**. Une
 * course encore à chiffrer vaut aussi 0 en base. Écrire « Offerte » dessus, c'est
 * promettre au client, par écrit et signé, une gratuité que personne n'a décidée.
 *
 * Et depuis que le barème est calculé depuis Orange, 25 € n'est plus
 * reconnaissable : c'est à la fois le forfait Express 24 h et le palier
 * « au-delà de 35 km » (Cavaillon, Apt, Pertuis). `deliveryLabelFromCents` a donc
 * été rendue muette là-dessus — elle répond « Livraison » et ne devine plus. Le
 * libellé qui compte est celui FIGÉ à l'émission du devis (`quotes.livraisonLabel`) ;
 * la déduction par montant n'est qu'un dernier recours, et
 * {@link resolveLivraisonLabel} respecte déjà cet ordre.
 */

import { resolveLivraisonLabel } from "@lingengo/shared";

/** Ce qu'un document sait de ses frais de livraison. */
export interface LivraisonPrintable {
  livraisonCents: number;
  /** Libellé figé à l'émission — prioritaire sur toute déduction. */
  livraisonLabel?: string;
  /**
   * Aucun tarif public sur cette course : le montant reste à chiffrer. Optionnel,
   * parce que tous les appelants ne le connaissent pas encore ; à défaut, le
   * libellé sert de filet (voir {@link livraisonSurDevis}).
   */
  livraisonSurDevis?: boolean;
}

/**
 * La course est-elle encore à chiffrer ?
 *
 * Le drapeau fait foi. À défaut, le libellé figé sert de filet : `computeDeliveryFee`
 * n'écrit « sur devis » que dans ce cas précis (hors zone, Flash < 3 h), et un
 * document ne doit pas se contredire d'une ligne à l'autre parce qu'un appelant
 * n'a pas transmis le drapeau.
 */
export function livraisonSurDevis(data: LivraisonPrintable): boolean {
  if (data.livraisonSurDevis !== undefined) return data.livraisonSurDevis;
  return /sur devis/i.test(data.livraisonLabel ?? "");
}

/** Intitulé de la ligne livraison — libellé explicite d'abord, déduction ensuite. */
export function livraisonLabelText(data: LivraisonPrintable): string {
  return resolveLivraisonLabel(data);
}

/**
 * Montant de la ligne livraison, en toutes lettres.
 *
 * Trois cas qui ne se disent pas de la même façon : à chiffrer, offerte, ou dû.
 */
export function livraisonMontantText(
  data: LivraisonPrintable,
  euros: (cents: number) => string,
): string {
  if (livraisonSurDevis(data)) return "Sur devis";
  return data.livraisonCents === 0 ? "Offerte" : euros(data.livraisonCents);
}

/**
 * La ligne livraison a-t-elle quelque chose à dire ?
 *
 * Un 0 € ordinaire se tait (la gratuité se lit sur le total), mais une course
 * « sur devis » vaut aussi 0 : la taire ferait disparaître du contrat le seul
 * montant qui reste à convenir.
 */
export function livraisonVisible(data: LivraisonPrintable): boolean {
  return data.livraisonCents > 0 || livraisonSurDevis(data);
}
