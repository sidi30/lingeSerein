/**
 * Facture — types du snapshot figé et garde-fou de cohérence.
 *
 * Une facture est un document FIGÉ : lignes, remise, livraison et totaux sont
 * recopiés à l'émission (colonnes + `metadata` JSON) et ne suivent plus le devis
 * ni le catalogue. Ce module ne recalcule donc JAMAIS un barème : il se contente
 * de normaliser le snapshot pour l'affichage et de vérifier qu'il est cohérent
 * avec lui-même (même philosophie que `checkContractTotals`).
 *
 * Aucune dépendance React — le rendu PDF vit dans @lingengo/ui/invoice-pdf.
 */

// ============================================================================
// Types
// ============================================================================

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED" | "REFUNDED";

/**
 * Ligne figée dans `metadata.lines`. Deux producteurs écrivent ce JSON avec des
 * clés différentes, les deux doivent s'imprimer :
 *  - facturation d'un devis  → `designation` / `qty` ;
 *  - worker d'abonnement     → `product` / `quantity`.
 * Tous les champs sont donc optionnels ici ; {@link normalizeInvoiceLines} rend
 * la forme unique attendue par le PDF.
 */
export interface InvoiceMetadataLine {
  designation?: string;
  qty?: number;
  product?: string;
  quantity?: number;
  unitCents?: number;
  totalCents?: number;
  position?: number;
}

/** Ligne normalisée, prête à imprimer. */
export interface InvoiceLine {
  designation: string;
  qty: number;
  unitCents: number;
  totalCents: number;
}

/** Contenu figé de la facture (lignes, remise, livraison, mention légale). */
export interface InvoiceMetadata {
  source?: string;
  quoteNumero?: string;
  lines?: InvoiceMetadataLine[];
  sousTotalCents?: number;
  remisePct?: number;
  remiseCents?: number;
  livraisonCents?: number;
  /** Libellé exact des frais de livraison, s'il a été figé à l'émission. */
  livraisonLabel?: string;
  tvaApplicable?: boolean;
  /** Mention d'exonération de TVA — obligatoire sur la facture si présente. */
  mentionLegale?: string;
  notes?: string;
  /** Modalités de règlement, si l'opérateur en a figé une. */
  reglement?: string;
  /** Factures d'abonnement (worker) : nom du plan facturé. */
  plan?: string;
}

/**
 * Vue minimale d'une facture nécessaire au rendu PDF — sous-ensemble structurel
 * de l'`InvoiceDTO` de l'admin, qui est donc accepté tel quel sans cast.
 */
export interface InvoiceForPdf {
  invoiceNumber: string;
  status: InvoiceStatus;
  user?: { name: string; email: string | null } | null;
  quote?: { numero: string } | null;
  clientNom: string | null;
  clientEmail: string | null;
  clientAdresse: string | null;
  /** Total hors taxes, en centimes (déjà net de remise et frais de livraison). */
  totalHtCents: number;
  /** Taux de TVA en centièmes de pourcentage — 2000 = 20 %, 0 = non applicable. */
  vatRate: number;
  vatAmountCents: number;
  totalTtcCents: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate: string;
  paidAt: string | null;
  metadata: InvoiceMetadata;
  createdAt: string;
}

// ============================================================================
// Logique pure (no React, no side-effects)
// ============================================================================

/**
 * Ramène les lignes du snapshot à une forme unique, quelle que soit leur
 * origine. Le total de ligne figé fait foi ; à défaut seulement, il est déduit
 * de qté × prix unitaire.
 */
export function normalizeInvoiceLines(lines?: InvoiceMetadataLine[]): InvoiceLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((l) => {
    const qty = l.qty ?? l.quantity ?? 0;
    const unitCents = l.unitCents ?? 0;
    return {
      designation: (l.designation ?? l.product ?? "").trim(),
      qty,
      unitCents,
      totalCents: l.totalCents ?? Math.round(qty * unitCents),
    };
  });
}

/** Écart détecté à l'intérieur même du snapshot de facture. */
export class InvoiceTotalsMismatchError extends Error {
  constructor(
    readonly expectedCents: number,
    readonly computedCents: number,
  ) {
    super(
      `Facture incohérente : total HT enregistré ${(expectedCents / 100).toFixed(2)} € ` +
        `≠ détail des lignes ${(computedCents / 100).toFixed(2)} € ` +
        `(écart ${((computedCents - expectedCents) / 100).toFixed(2)} €).`,
    );
    this.name = "InvoiceTotalsMismatchError";
  }
}

/**
 * Garde-fou : le détail imprimé doit retomber sur le total HT enregistré, soit
 * somme(lignes) − remise + livraison = totalHtCents. Aucun barème n'est
 * recalculé — on ne compare que le snapshot à lui-même.
 *
 * `verifiable` est faux quand la facture ne porte aucune ligne (rien à vérifier) :
 * le PDF s'imprime alors sans tableau plutôt que d'échouer.
 */
export function checkInvoiceTotals(invoice: InvoiceForPdf): {
  ok: boolean;
  verifiable: boolean;
  computedCents: number;
  totalHtCents: number;
} {
  const lines = normalizeInvoiceLines(invoice.metadata.lines);
  if (lines.length === 0) {
    return {
      ok: true,
      verifiable: false,
      computedCents: invoice.totalHtCents,
      totalHtCents: invoice.totalHtCents,
    };
  }
  const sousTotal = lines.reduce((s, l) => s + l.totalCents, 0);
  const computedCents =
    sousTotal - (invoice.metadata.remiseCents ?? 0) + (invoice.metadata.livraisonCents ?? 0);
  return {
    ok: computedCents === invoice.totalHtCents,
    verifiable: true,
    computedCents,
    totalHtCents: invoice.totalHtCents,
  };
}

/**
 * Statuts qui ne doivent jamais s'imprimer comme une facture ordinaire :
 * le PDF les signale par un filigrane et un bandeau.
 */
export const INVOICE_WARNING_LABELS: Partial<Record<InvoiceStatus, string>> = {
  DRAFT: "BROUILLON",
  CANCELLED: "FACTURE ANNULÉE",
  REFUNDED: "FACTURE REMBOURSÉE",
};
