/**
 * Palier d'urgence de la date choisie dans le tunnel de commande — logique
 * pure, sans React Native.
 *
 * POURQUOI CE MODULE : le serveur facture l'urgence à l'ENVOI
 * (`computeDeliveryFee`, packages/shared), à partir du nombre de jours de
 * calendrier entre aujourd'hui et la date de livraison. Une livraison le
 * lendemain (J+1) déclenche le forfait Express 24 h — 25 €, fixe, non soumis
 * aux seuils de gratuité. Or J+1 était la date par défaut ET la plus proche
 * offerte par le calendrier : le client découvrait le forfait dans l'alerte qui
 * suit l'envoi, commande déjà passée. On l'annonce désormais dès qu'il touche
 * la date.
 *
 * Le barème n'est PAS recopié ici : `urgencyFromDelaiJours` + `urgencyTier`
 * sont la source de vérité, partagée avec le devis, le contrat et la vitrine.
 * Ce module ne fait que les brancher sur une date civile « YYYY-MM-DD ».
 *
 * Fuseau : tout se calcule sur des minuits LOCAUX (`localYmd`,
 * `differenceInCalendarDays`). `toISOString` convertirait en UTC et décalerait
 * la date d'un jour à l'ouest de Greenwich — donc le palier, donc le prix.
 */

import {
  differenceInCalendarDays,
  urgencyFromDelaiJours,
  urgencyTier,
  type UrgencyLevel,
  type UrgencyTier,
} from "@lingengo/shared";
import { localYmd } from "./rounds";

/** Délai minimum acceptable : le serveur refuse une livraison dans le passé. */
export const MIN_DELAI_JOURS = 1;
/**
 * Délai proposé par défaut. J+2 est le premier jour SANS forfait d'urgence
 * (`urgencyFromDelaiJours`) : la date pré-remplie ne doit pas être celle qui
 * coûte 25 € de plus.
 */
export const DEFAULT_DELAI_JOURS = 2;

/** Parse une date civile « YYYY-MM-DD » dans le fuseau LOCAL. */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Date civile locale à `delaiJours` d'aujourd'hui. */
export function deliveryYmd(delaiJours: number, today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + delaiJours);
  return localYmd(d);
}

/** Première date sélectionnable (J+1) — reste offerte, mais étiquetée. */
export function minDeliveryYmd(today: Date = new Date()): string {
  return deliveryYmd(MIN_DELAI_JOURS, today);
}

/** Date pré-remplie (J+2) — la première sans forfait d'urgence. */
export function defaultDeliveryYmd(today: Date = new Date()): string {
  return deliveryYmd(DEFAULT_DELAI_JOURS, today);
}

export interface DeliveryUrgencyNotice {
  level: UrgencyLevel;
  /** Palier complet du barème partagé (libellé, délai, forfait). */
  tier: UrgencyTier;
  /** true dès qu'un forfait d'urgence s'ajoute au barème ordinaire. */
  isSurcharged: boolean;
  /** Forfait en centimes ; `null` = aucun tarif public, montant sur devis. */
  feeCents: number | null;
  /** Titre court de l'encart — « Express 24 h · 25,00 € ». */
  title: string;
  /** Phrase complète, prête à afficher. */
  message: string;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Ce que coûte la date choisie, en toutes lettres.
 *
 * `formatCents` est injecté : il vit dans `lib/api.ts`, qui tire React Native et
 * rendrait ce module intestable en `node --test`.
 */
export function deliveryUrgencyNotice(
  ymd: string,
  formatCents: (cents: number) => string,
  today: Date = new Date(),
): DeliveryUrgencyNotice {
  // Même calcul que le serveur au moment de la création : jours de CALENDRIER,
  // sur les minuits locaux. Une date passée donne un délai négatif, donc le
  // palier le plus urgent — on l'annonce plutôt que de le taire.
  const delai = differenceInCalendarDays(today, parseYmd(ymd));
  const level = urgencyFromDelaiJours(delai);
  const tier = urgencyTier(level);
  const isSurcharged = level !== "STANDARD";
  const feeCents = tier.feeCents;

  if (!isSurcharged) {
    return {
      level,
      tier,
      isSurcharged,
      feeCents,
      title: `Tournée planifiée (${tier.delaiText})`,
      message: "Aucun supplément d'urgence : frais de livraison selon votre zone.",
    };
  }

  // Forfait sans tarif public (Flash) : la date ne peut pas le produire depuis
  // le calendrier, mais le dire reste plus juste que d'afficher « 0 € ».
  if (feeCents === null) {
    return {
      level,
      tier,
      isSurcharged,
      feeCents,
      title: `${tier.label} · sur devis`,
      message: `${capitalize(tier.delaiText)} — le montant vous est confirmé avant la livraison.`,
    };
  }

  return {
    level,
    tier,
    isSurcharged,
    feeCents,
    title: `${tier.label} · ${formatCents(feeCents)}`,
    message:
      `${capitalize(tier.delaiText)} — forfait ${tier.label}, ${formatCents(feeCents)}. ` +
      "Forfait fixe qui remplace le tarif de votre zone et n'ouvre pas droit à la gratuité.",
  };
}
