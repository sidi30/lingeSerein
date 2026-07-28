/**
 * Bon de livraison & décharge — types et mapper.
 *
 * Document de RÉCEPTION signé par le client à la livraison, dérivé d'un devis :
 * il constate ce qui a été remis et fait courir la garde du linge. Ce n'est pas
 * une pièce comptable — il ne porte donc AUCUN prix (voir {@link BonLivraisonLine}).
 * Le rendu PDF vit dans @lingengo/ui/bon-livraison-pdf.
 *
 * Aucune dépendance React — consommable par l'API Fastify, l'admin-web et la vitrine.
 */

import type { DeliveryZone, UrgencyLevel } from "./constants";
import type { DevisData, DevisLine } from "./devis";

// ============================================================================
// Types
// ============================================================================

/**
 * Ligne d'un bon de livraison : désignation + quantité, jamais de montant.
 * Volontairement un sous-ensemble de {@link DevisLine} : un `DevisLine[]` reste
 * assignable tel quel, mais le type garantit qu'aucun prix ne peut être imprimé
 * sur un document de réception.
 */
export type BonLivraisonLine = Pick<DevisLine, "designation" | "qty">;

export interface BonLivraisonData {
  /** N° du bon, dérivé du devis — ex. `BL-LSQ-2026-0007-01`. */
  numero: string;
  /** N° du devis source (traçabilité). */
  devisNumero?: string;
  /** Date de la livraison (ISO ou format libre). Vide = à remplir au stylo. */
  date: string;
  /** Heure de la livraison, ex. « 10h30 ». */
  heure?: string;
  /** Client destinataire — mêmes champs que {@link DevisData.client}. */
  client: DevisData["client"];
  /** Adresse effective de livraison, si différente de l'adresse du client. */
  adresseLivraison?: string;
  /** Articles remis : désignation + quantité livrée. */
  lines: BonLivraisonLine[];
  /** Zone de livraison desservie (mention informative). */
  zone?: DeliveryZone;
  /** Niveau de service retenu sur le devis (jauge d'urgence). */
  urgency?: UrgencyLevel;
  /** Nom du livreur qui remet le linge et cosigne le bon. */
  livreurNom?: string;
  /** Observations libres imprimées avant la décharge. */
  notes?: string;
  /**
   * Mode « à compléter à la main » : les champs non saisis sont imprimés en
   * pointillés ({@link BLANK_PLACEHOLDER}) au lieu d'être masqués.
   */
  blankFields?: boolean;
  /** Nombre de lignes vierges ajoutées en fin de tableau (saisie au stylo). */
  blankLines?: number;
}

/** Paramètres de la livraison, inconnus du devis, fournis à la génération. */
export interface BonLivraisonOptions {
  /** Date de livraison. À défaut, le bon est imprimé avec un emplacement vide. */
  date?: string;
  heure?: string;
  adresseLivraison?: string;
  zone?: DeliveryZone;
  urgency?: UrgencyLevel;
  livreurNom?: string;
  notes?: string;
  /** Rang du passage (1 = première livraison du devis) — suffixe du numéro. */
  passage?: number;
  blankFields?: boolean;
  blankLines?: number;
}

// ============================================================================
// Logique pure (no React, no side-effects)
// ============================================================================

/** Préfixe des numéros de bon de livraison. */
export const BON_LIVRAISON_PREFIX = "BL-";

/**
 * Numéro d'un bon de livraison : `BL-` + numéro du devis + rang du passage sur
 * deux chiffres. Un devis `LSQ-2026-0007` livré en deux fois donne
 * `BL-LSQ-2026-0007-01` puis `BL-LSQ-2026-0007-02`.
 *
 * Retourne une chaîne vide si le devis n'a pas encore de numéro : le PDF imprime
 * alors un emplacement à compléter plutôt qu'un numéro tronqué.
 */
export function bonLivraisonNumero(devisNumero: string, passage = 1): string {
  const base = (devisNumero ?? "").trim().replace(/^BL-/i, "");
  if (!base) return "";
  const rang = Number.isFinite(passage) ? Math.max(1, Math.trunc(passage)) : 1;
  return `${BON_LIVRAISON_PREFIX}${base}-${String(rang).padStart(2, "0")}`;
}

/** Nombre total d'articles remis (somme des quantités livrées). */
export function countArticlesLivres(lines: BonLivraisonLine[]): number {
  return lines.reduce((n, l) => n + (l.qty || 0), 0);
}

/**
 * Dérive un bon de livraison d'un devis. Les lignes sont reprises telles
 * quelles, mais les prix sont explicitement écartés : un bon de livraison
 * constate des quantités, pas des montants.
 *
 * La date, l'heure, le livreur et l'adresse de livraison ne sont pas connus du
 * devis — non fournis, ils restent vides et sont complétés au stylo sur place.
 */
export function devisToBonLivraison(
  devis: DevisData,
  options: BonLivraisonOptions = {},
): BonLivraisonData {
  return {
    numero: bonLivraisonNumero(devis.numero, options.passage),
    devisNumero: devis.numero || undefined,
    date: options.date ?? "",
    heure: options.heure,
    client: { ...devis.client },
    adresseLivraison: options.adresseLivraison ?? devis.client.adresse,
    lines: devis.lines.map((l) => ({ designation: l.designation, qty: l.qty })),
    zone: options.zone ?? devis.zoneLivraison,
    urgency: options.urgency ?? devis.urgency,
    livreurNom: options.livreurNom,
    notes: options.notes,
    blankFields: options.blankFields,
    blankLines: options.blankLines,
  };
}
