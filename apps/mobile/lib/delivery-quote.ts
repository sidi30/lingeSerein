/**
 * Frais de livraison annoncés AVANT l'envoi — logique pure, sans React Native.
 *
 * Le tunnel affichait « Frais de livraison : calculés à la validation », faute
 * de savoir où habitait le client. Le barème est désormais public sur tout le
 * Vaucluse et la commune est choisie dans une liste fermée : le montant est
 * connu dès le récapitulatif, et le client n'a plus à le découvrir après avoir
 * commandé.
 *
 * Le barème n'est PAS recopié ici. `computeDeliveryFee` (packages/shared) est
 * la source de vérité — la même que celle appliquée par le serveur à la
 * création de la commande. Ce module ne fait que lui fournir la zone du client
 * et traduire son verdict en quelque chose d'affichable.
 *
 * TROIS PIÈGES que ce module referme :
 *
 * 1. **Orange rend 0 € avec `offerte: false`.** Rien n'a été offert : la course
 *    n'est simplement pas facturée dans la commune du siège. Écrire « offerte »
 *    laisserait croire à un avantage lié au montant commandé, donc perdu au
 *    panier suivant. On reprend le libellé de `computeDeliveryFee`, jamais un
 *    libellé déduit du montant.
 * 2. **25 € est ambigu** : c'est à la fois le palier « au-delà de 35 km »
 *    (Cavaillon, Apt, Pertuis) et le forfait Express 24 h. Aucun libellé n'est
 *    donc dérivé d'un montant, ici non plus.
 * 3. **0 € n'est pas toujours un prix.** Sur devis (commune inconnue, hors
 *    Vaucluse, Flash < 3 h), `cents` vaut 0 sans qu'aucune gratuité n'ait été
 *    décidée : `cents` vaut alors `null` et l'écran affiche « à confirmer »,
 *    comme la fiche de commande le fait déjà (`lib/order-total.ts`).
 */

import {
  computeDeliveryFee,
  DELIVERY_DEFAULTS,
  type DeliveryFee,
  type UrgencyLevel,
} from "@lingengo/shared";
import { resolveZone, type ClientLocation, type ZoneResolution } from "./communes";

export interface DeliveryQuoteInput {
  /** Coordonnées du client connecté — `null` tant que le profil n'est pas lu. */
  client: ClientLocation | null | undefined;
  /** Palier d'urgence de la date choisie (cf. `lib/delivery-urgency.ts`). */
  urgency: UrgencyLevel;
  /** Sous-total des articles, en centimes. */
  subtotalCents: number;
}

export interface DeliveryQuote {
  /** Verdict brut du barème partagé — celui que le serveur appliquera. */
  fee: DeliveryFee;
  zone: ZoneResolution;
  /**
   * Motif du tarif, repris MOT POUR MOT de `computeDeliveryFee` : « Livraison à
   * Orange — incluse », « Livraison offerte (dès 120 € de commande) »… `""`
   * quand il n'y a rien à en dire de fiable (voir `deliveryQuote`).
   */
  label: string;
  /** Montant annoncé ; `null` = aucun montant annonçable (sur devis). */
  cents: number | null;
  /** Vrai quand le montant reste à chiffrer : ni offert, ni compris au total. */
  surDevis: boolean;
  /** Vrai quand le montant vient du code postal, pas d'une commune confirmée. */
  estimation: boolean;
  /** Vrai quand renseigner sa commune débloquerait un montant ferme. */
  needsCommune: boolean;
  /** Articles + frais ; `null` quand les frais restent à chiffrer. */
  totalCents: number | null;
  /** Reste à commander pour la gratuité ; `null` si sans objet. */
  manquePourGratuiteCents: number | null;
  /** Phrase complémentaire sous la ligne ; `""` quand il n'y a rien à ajouter. */
  detail: string;
}

const DETAIL_SANS_COMMUNE =
  "Indiquez votre commune dans vos informations : les frais s'afficheront avant l'envoi.";
const DETAIL_ESTIMATION =
  "Tarif déduit de votre code postal. Confirmez votre commune dans vos informations pour le figer.";

export function deliveryQuote(input: DeliveryQuoteInput): DeliveryQuote {
  const zone = resolveZone(input.client);
  const subtotalCents = Number.isFinite(input.subtotalCents) ? input.subtotalCents : 0;

  const fee = computeDeliveryFee({
    zone: zone.zone,
    urgency: input.urgency,
    montantApresRemiseCents: subtotalCents,
  });

  const surDevis = fee.surDevis;
  // Sans commune ni code postal exploitable, le libellé de `computeDeliveryFee`
  // est « Livraison hors zone » : exact pour le barème, faux pour ce client-là,
  // qui est probablement du Vaucluse mais n'a jamais renseigné sa commune. On
  // n'affiche alors AUCUN motif — le montant à confirmer et l'invitation à
  // renseigner sa commune disent tout — plutôt que de lui annoncer qu'il n'est
  // pas desservi.
  const inconnue = zone.source === "INCONNUE";
  const label = inconnue ? "" : fee.label;

  const estimation = !surDevis && zone.source === "CODE_POSTAL";

  const manque =
    !surDevis && !fee.urgent && !fee.offerte && fee.cents > 0
      ? DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS - subtotalCents
      : 0;

  return {
    fee,
    zone,
    label,
    cents: surDevis ? null : fee.cents,
    surDevis,
    estimation,
    needsCommune: inconnue,
    totalCents: surDevis ? null : subtotalCents + fee.cents,
    manquePourGratuiteCents: manque > 0 ? manque : null,
    detail: inconnue ? DETAIL_SANS_COMMUNE : estimation ? DETAIL_ESTIMATION : "",
  };
}
