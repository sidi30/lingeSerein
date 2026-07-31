/**
 * Types, calculs et constantes liés aux devis.
 * Aucune dépendance React — consommable par l'API Fastify, l'admin-web et la vitrine.
 */

import { deliveryLabelFromCents, type DeliveryZone, type UrgencyLevel } from "./constants";

// ============================================================================
// Types
// ============================================================================

export interface DevisLine {
  designation: string;
  qty: number;
  unitCents: number; // en centimes
}

export interface DevisData {
  numero: string;
  date: string; // ISO ou YYYY-MM-DD
  validiteJours: number;
  client: {
    nom: string;
    etablissement?: string;
    adresse?: string;
    email?: string;
    tel?: string;
  };
  lines: DevisLine[];
  /** Centièmes de pourcentage — 1000 = 10 % */
  remisePct: number;
  livraisonCents: number;
  /**
   * Libellé exact des frais de livraison (urgence, zone, gratuité). Repris tel
   * quel sur le contrat dérivé — c'est ce qui garantit la concordance devis ↔ contrat.
   */
  livraisonLabel?: string;
  /**
   * Vrai quand la course n'a AUCUN tarif public et reste à chiffrer (hors
   * Vaucluse, urgence Flash). `livraisonCents` vaut alors 0 — le même 0 qu'une
   * livraison réellement offerte. Sans ce drapeau, le document imprime
   * « Offerte » sur une course dont personne n'a jamais accordé la gratuité.
   */
  livraisonSurDevis?: boolean;
  /** Délai de livraison demandé, en jours (0 = jour même, 1 = lendemain). */
  delaiJours?: number;
  /** Niveau d'urgence choisi sur la jauge (prioritaire sur delaiJours). */
  urgency?: UrgencyLevel;
  /** Zone de livraison retenue pour le calcul des frais. */
  zoneLivraison?: DeliveryZone;
  notes?: string;
  tvaApplicable: boolean;
  reglement?: string;
  signatureSrc?: string;
  /**
   * Mode « à compléter à la main » : les champs non saisis sont imprimés en
   * pointillés ({@link BLANK_PLACEHOLDER}) au lieu d'être masqués.
   */
  blankFields?: boolean;
  /** Nombre de lignes vierges ajoutées en fin de tableau (saisie au stylo). */
  blankLines?: number;
}

/** Marque imprimée à la place d'un champ non saisi en mode « à compléter ». */
export const BLANK_PLACEHOLDER = "------------------------";

/**
 * Valeur à imprimer pour un champ texte.
 * - mode normal : la valeur, ou `—` si vide ;
 * - mode « à compléter » : la valeur, ou une zone en pointillés à remplir au stylo.
 */
export function printableField(
  value: string | null | undefined,
  blankFields?: boolean,
  fallback = "—",
): string {
  const s = (value ?? "").trim();
  if (s) return s;
  return blankFields ? BLANK_PLACEHOLDER : fallback;
}

/** Nombre de kits d'un devis (désignations « Kit … ») — seuil de gratuité Orange. */
export function countKits(lines: { designation: string; qty: number }[]): number {
  return lines.reduce((n, l) => (/\bkit\b/i.test(l.designation) ? n + (l.qty || 0) : n), 0);
}

export interface DevisTotals {
  /** Somme brute des lignes */
  sousTotal: number;
  /** Montant de la remise */
  remise: number;
  /** Total HT (sousTotal - remise + livraison) */
  totalHT: number;
  /** Montant TVA (0 si tvaApplicable=false) */
  tva: number;
  /** Total TTC */
  totalTTC: number;
}

// ============================================================================
// Calcul pur (no React, no side-effects)
// ============================================================================

/**
 * Calcule les totaux d'un devis à partir de DevisData.
 * Tous les montants sont en centimes (Int).
 * remisePct est en centièmes de pourcentage (1000 = 10 %).
 */
export function computeDevisTotals(d: DevisData): DevisTotals {
  const sousTotal = d.lines.reduce((s, l) => s + Math.round(l.qty * l.unitCents), 0);
  // remisePct / 10000 = fraction (1000 / 10000 = 0.10 = 10%)
  const remise = Math.round((sousTotal * d.remisePct) / 10000);
  const totalHT = sousTotal - remise + d.livraisonCents;
  const tva = d.tvaApplicable ? Math.round(totalHT * 0.2) : 0;
  const totalTTC = totalHT + tva;
  return { sousTotal, remise, totalHT, tva, totalTTC };
}

/**
 * Libellé des frais de livraison à imprimer. Utilise le libellé explicite s'il
 * est connu (délai + zone saisis), sinon le déduit du montant — de sorte que le
 * devis et le contrat affichent toujours la même chose.
 */
export function resolveLivraisonLabel(d: {
  livraisonCents: number;
  livraisonLabel?: string;
}): string {
  const explicit = (d.livraisonLabel ?? "").trim();
  return explicit || deliveryLabelFromCents(d.livraisonCents);
}

/**
 * MONTANT des frais de livraison à imprimer, en toutes lettres.
 *
 * Pendant indispensable de {@link resolveLivraisonLabel} : le libellé pouvait
 * bien dire « sur devis », la colonne du montant affichait « Offerte » à côté,
 * parce que 0 € est indiscernable d'une gratuité. Le document se contredisait
 * alors dans sa propre ligne — et sur le contrat, la contradiction tombait dans
 * la prose de l'article qui engage, où c'est la seconde moitié de la phrase que
 * le client retient.
 *
 * Trois états, jamais deux :
 *   - à chiffrer  → « sur devis »   (aucun tarif public n'a été publié)
 *   - 0 € accordé → « Offerte »     (une gratuité a réellement été consentie)
 *   - sinon       → le montant formaté par l'appelant
 *
 * @param formatCents mise en forme monétaire de l'appelant (le PDF a la sienne).
 */
export function resolveLivraisonMontant(
  d: { livraisonCents: number; livraisonSurDevis?: boolean },
  formatCents: (cents: number) => string,
): string {
  if (d.livraisonSurDevis) return "sur devis";
  if (d.livraisonCents <= 0) return "Offerte";
  return formatCents(d.livraisonCents);
}

// ============================================================================
// Machine à états — Devis
// ============================================================================

export type QuoteStatus = "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE" | "EXPIRE";

/**
 * Transitions de statut autorisées pour un devis.
 * Source de vérité partagée front/back — le front l'utilise pour griser les boutons.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  BROUILLON: ["ENVOYE"],
  ENVOYE: ["ACCEPTE", "REFUSE", "EXPIRE"],
  ACCEPTE: [],
  REFUSE: [],
  EXPIRE: [],
};

/**
 * Statuts permettant la modification du contenu du devis (PATCH /quotes/:id).
 */
export const QUOTE_EDITABLE: QuoteStatus[] = ["BROUILLON", "ENVOYE"];

// ============================================================================
// Machine à états — Commande
// ============================================================================

export type OrderStatus = "PENDING" | "CONFIRMED" | "IN_DELIVERY" | "DELIVERED" | "CANCELLED";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_DELIVERY", "CANCELLED"],
  IN_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

// ============================================================================
// Sources de commande
// ============================================================================

export type OrderSource = "MOBILE" | "QUOTE_CONVERSION" | "MANUAL";

// ============================================================================
// Mapper QuoteDTO → DevisData (pour usage dans admin-web et api)
// ============================================================================

export interface QuoteLineDTO {
  id: string;
  designation: string;
  qty: number;
  unitCents: number;
  position: number;
}

export interface QuoteForDevis {
  numero: string;
  createdAt: string | Date;
  validiteJours: number;
  clientNom: string;
  clientEmail?: string | null;
  clientTel?: string | null;
  clientAdresse?: string | null;
  lignes: QuoteLineDTO[];
  remisePct: number;
  livraisonCents: number;
  /** Libellé figé à l'émission — prime toujours sur toute déduction. */
  livraisonLabel?: string | null;
  /** Course sans tarif public, à chiffrer à la main. */
  livraisonSurDevis?: boolean | null;
  notes?: string | null;
  tvaApplicable: boolean;
}

/**
 * Mappe une entité Quote (API DTO) vers DevisData pour les composants PDF.
 */
export function quoteToDevisData(quote: QuoteForDevis): DevisData {
  const date =
    quote.createdAt instanceof Date
      ? quote.createdAt.toISOString().slice(0, 10)
      : String(quote.createdAt).slice(0, 10);

  return {
    numero: quote.numero,
    date,
    validiteJours: quote.validiteJours,
    client: {
      nom: quote.clientNom,
      adresse: quote.clientAdresse ?? undefined,
      email: quote.clientEmail ?? undefined,
      tel: quote.clientTel ?? undefined,
    },
    lines: quote.lignes.map((l) => ({
      designation: l.designation,
      qty: l.qty,
      unitCents: l.unitCents,
    })),
    remisePct: quote.remisePct,
    livraisonCents: quote.livraisonCents,
    // Le libellé FIGÉ à l'émission prime. L'écraser par une déduction, comme le
    // faisait cette ligne, perdait l'information au pire moment : 25 € vaut
    // aussi bien « au-delà de 35 km » que « forfait Express 24 h », et le repli
    // ne sait plus trancher entre les deux.
    livraisonLabel: resolveLivraisonLabel({
      livraisonCents: quote.livraisonCents,
      livraisonLabel: quote.livraisonLabel ?? undefined,
    }),
    livraisonSurDevis: quote.livraisonSurDevis ?? false,
    notes: quote.notes ?? undefined,
    tvaApplicable: quote.tvaApplicable,
  };
}
