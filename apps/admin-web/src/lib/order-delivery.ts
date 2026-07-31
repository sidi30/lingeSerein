/**
 * Ce que la DATE DE LIVRAISON saisie dit du prix.
 *
 * Le formulaire de commande annonce un total « hors livraison » : les frais sont
 * calculés par le serveur au moment de la création, d'après la zone du client ET
 * le délai. Or ce délai n'est pas neutre — une livraison pour aujourd'hui ou pour
 * demain déclenche un FORFAIT D'URGENCE fixe (39 € / 25 €) qui remplace le barème
 * de zone. Saisir la date sans rien voir venir, c'est engager le client sur un
 * montant que l'écran n'a jamais affiché.
 *
 * Le barème lui-même vit dans `@lingengo/shared` et NULLE PART ailleurs : ce
 * module ne fait que traduire une date en palier, il ne connaît aucun prix. Le
 * jour où le forfait change, il ne bouge pas.
 */

import { urgencyFromDelaiJours, urgencyTier, type UrgencyLevel } from "@lingengo/shared";
import { formatPrice } from "./format";

/**
 * Jour LOCAL au format `YYYY-MM-DD` — celui qu'attendent `value` et `min` d'un
 * `<input type="date">`. `toISOString()` ne conviendrait pas : il bascule en UTC
 * et donne la veille pour toute soirée d'été française.
 */
export function isoDay(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${jour}`;
}

/** Horodatage UTC d'un `YYYY-MM-DD` strict, ou `null` si la date n'existe pas. */
function parseIsoDay(value: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return null;
  const [annee, mois, jour] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const ts = Date.UTC(annee, mois - 1, jour);
  const d = new Date(ts);
  // Date.UTC reporte les débordements (31 février ⇒ 3 mars) : on refuse plutôt
  // que d'annoncer une urgence calculée sur un jour que l'utilisateur n'a pas saisi.
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) {
    return null;
  }
  return ts;
}

/**
 * Délai en jours de CALENDRIER entre aujourd'hui et la livraison — la convention
 * de `urgencyFromDelaiJours` : 0 = jour même, 1 = lendemain, négatif = déjà passé.
 *
 * Les deux dates sont ramenées à minuit UTC avant soustraction : compter en
 * heures ferait basculer le palier au changement d'heure, et une commande à
 * J+2 deviendrait « Express 24 h » un dimanche de mars.
 *
 * `null` ⇒ saisie vide ou impossible : rien à annoncer.
 */
export function delaiJours(dateISO: string, todayISO: string): number | null {
  const livraison = parseIsoDay(dateISO);
  const today = parseIsoDay(todayISO);
  if (livraison === null || today === null) return null;
  return Math.round((livraison - today) / 86_400_000);
}

/** Palier d'urgence déduit de la date, prêt à afficher sous le champ. */
export interface DeliveryUrgencyNotice {
  level: UrgencyLevel;
  /** « Standard », « Express 24 h », « Jour même ». */
  label: string;
  /** Forfait en centimes — 0 = barème de zone, `null` = sur devis. */
  feeCents: number | null;
  /** Un forfait fixe s'ajoutera au total : à signaler franchement. */
  urgent: boolean;
  /** Phrase complète, affichée telle quelle. */
  message: string;
}

/**
 * Traduit la date saisie en palier d'urgence ET en phrase.
 *
 * Le message dit toujours d'où vient le montant, y compris en STANDARD : « pas
 * de forfait » est une information, l'absence de message ne l'est pas.
 *
 * `null` ⇒ aucune date saisie (ou date impossible) : le formulaire n'annonce rien.
 */
export function deliveryUrgencyNotice(
  dateISO: string,
  todayISO: string,
): DeliveryUrgencyNotice | null {
  const delai = delaiJours(dateISO, todayISO);
  if (delai === null) return null;

  const tier = urgencyTier(urgencyFromDelaiJours(delai));
  const urgent = tier.feeCents !== null && tier.feeCents > 0;

  return {
    level: tier.level,
    label: tier.label,
    feeCents: tier.feeCents,
    urgent,
    message: urgent
      ? `Urgence ${tier.label} (${tier.delaiText}) : forfait de ${formatPrice(
          tier.feeCents ?? 0,
        )} ajouté par le serveur, EN PLUS du total ci-dessous.`
      : `Urgence ${tier.label} (${tier.delaiText}) : livraison au barème de zone, sans forfait.`,
  };
}
