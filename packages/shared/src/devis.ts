/**
 * Types, calculs et constantes liés aux devis.
 * Aucune dépendance React — consommable par l'API Fastify, l'admin-web et la vitrine.
 */

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
  notes?: string;
  tvaApplicable: boolean;
  reglement?: string;
  signatureSrc?: string;
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
    notes: quote.notes ?? undefined,
    tvaApplicable: quote.tvaApplicable,
  };
}
