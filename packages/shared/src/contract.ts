/**
 * Types et logique liés aux contrats (dérivés d'un devis accepté).
 * Aucune dépendance React ni @react-pdf — consommable par l'API Fastify,
 * l'admin-web et la vitrine. Le rendu PDF vit dans @lingengo/ui/contract-pdf.
 *
 * Deux types de contrats sont dérivables d'un devis :
 *  - ABONNEMENT  : Pack Sérénité (forfait mensuel récurrent) ;
 *  - PONCTUEL    : prestation ponctuelle (location & entretien à la commande).
 */

// ============================================================================
// Types
// ============================================================================

export type ContractType = "ABONNEMENT" | "PONCTUEL";

export interface ContractLine {
  designation: string;
  qty: number;
  unitCents: number;
}

export interface ContractClient {
  /** Nom du représentant / signataire */
  nom: string;
  /** Dénomination de l'établissement (gîte, hôtel, EI…) */
  etablissement: string;
  /** Forme juridique / SIRET du client si professionnel */
  identifiant: string;
  /** Adresse du logement desservi / adresse de facturation */
  adresse: string;
  email: string;
  tel: string;
}

export interface ContractData {
  type: ContractType;
  /** N° de contrat, ex. CTR-202607-001 */
  numero: string;
  /** Date de signature, format libre (ex. 16 juillet 2026) */
  date: string;
  /** Lieu de signature */
  lieu: string;
  /** N° du devis source (traçabilité) */
  devisNumero?: string;
  client: ContractClient;

  // ── Abonnement (ignoré par le rendu ponctuel) ──
  /** Prix mensuel en centimes (défaut 8900 = 89 €) */
  prixMensuelCents: number;
  /** Dotation mensuelle incluse */
  kitsBain: number;
  kitsLit: number;
  /** Nombre de livraisons & reprises incluses par mois */
  livraisonsIncluses: number;
  /** Date de prise d'effet de l'abonnement */
  dateDebut: string;
  /** Durée d'engagement initiale (mois) */
  engagementMois: number;
  /** Préavis de résiliation (jours) après période initiale */
  preavisJours: number;
  /** Jour de facturation mensuelle (ex. 1er) */
  jourFacturation: string;
  /** Nombre de mensualités couvertes par le devis source (si détecté) */
  nbMensualitesDevis?: number;

  // ── Ponctuel (ignoré par le rendu abonnement) ──
  lignes: ContractLine[];
  totalCents: number;
  tvaApplicable: boolean;

  // ── Commun ──
  /** Dépôt de garantie en centimes (0 = aucun) */
  depotGarantieCents: number;
  /** Conditions particulières libres */
  conditionsParticulieres: string;
  /** Signature du prestataire (data URL PNG) */
  signatureSrc?: string;
}

/**
 * Termes fournis par l'admin (ou sourcés depuis la config d'abonnement)
 * pour composer un contrat à partir d'un devis.
 */
export interface ContractTerms {
  prixMensuelCents: number;
  kitsBain: number;
  kitsLit: number;
  livraisonsIncluses: number;
  engagementMois: number;
  preavisJours: number;
  jourFacturation: string;
  lieu: string;
  dateDebut: string;
  depotGarantieCents: number;
  conditionsParticulieres: string;
  numero: string;
  date: string;
  signatureSrc?: string;
}

/**
 * Vue minimale d'un devis nécessaire pour dériver un contrat.
 * (Sous-ensemble de l'entité Quote — mappable depuis l'API/admin.)
 */
export interface QuoteForContract {
  numero: string;
  clientNom: string;
  clientEmail?: string | null;
  clientTel?: string | null;
  clientAdresse?: string | null;
  lignes: { designation: string; qty: number; unitCents: number }[];
  tvaApplicable: boolean;
  totalNetCents: number;
}

// ============================================================================
// Logique pure (no React, no side-effects)
// ============================================================================

/** Détecte une ligne « Pack Sérénité » par libellé (tolérant aux accents). */
const PACK_DESIGNATION_RE = /pack\s*s[ée]r[ée]nit[ée]/i;

function isPackLine(
  line: { designation: string; unitCents: number },
  packPriceCents: number,
): boolean {
  return PACK_DESIGNATION_RE.test(line.designation) || line.unitCents === packPriceCents;
}

/**
 * Détermine le type de contrat à partir des lignes du devis.
 * Une ligne est « pack » si son libellé matche /pack sérénité/i OU si son
 * prix unitaire vaut exactement le prix du Pack Sérénité.
 *
 * @returns `ABONNEMENT` + nombre de lignes pack (nbMensualites) si ≥ 1 ligne
 * pack ; sinon `PONCTUEL` avec nbMensualites = 0.
 */
export function detectContractType(
  quote: QuoteForContract,
  packPriceCents: number,
): { type: ContractType; nbMensualites: number } {
  const packLines = quote.lignes.filter((l) => isPackLine(l, packPriceCents));
  if (packLines.length >= 1) {
    return { type: "ABONNEMENT", nbMensualites: packLines.length };
  }
  return { type: "PONCTUEL", nbMensualites: 0 };
}

/**
 * Mappe un devis (+ termes fournis par l'admin) vers ContractData,
 * prêt pour le rendu PDF (@lingengo/ui/contract-pdf).
 *
 * - ABONNEMENT : le prix mensuel provient de la ligne pack détectée si elle
 *   existe, sinon de `terms.prixMensuelCents` ; les paramètres d'abonnement
 *   (dotation, engagement, préavis, facturation…) proviennent des termes.
 * - PONCTUEL   : les lignes du devis sont reprises telles quelles ; les champs
 *   d'abonnement restent renseignés depuis les termes (inertes, le PDF les
 *   ignore pour le ponctuel).
 */
export function quoteToContractData(
  quote: QuoteForContract,
  terms: ContractTerms,
  packPriceCents: number,
): ContractData {
  const { type, nbMensualites } = detectContractType(quote, packPriceCents);

  const client: ContractClient = {
    nom: quote.clientNom,
    etablissement: "",
    identifiant: "",
    adresse: quote.clientAdresse ?? "",
    email: quote.clientEmail ?? "",
    tel: quote.clientTel ?? "",
  };

  // Prix mensuel : ligne pack détectée en priorité, sinon termes.
  const packLine = quote.lignes.find((l) => isPackLine(l, packPriceCents));
  const prixMensuelCents =
    type === "ABONNEMENT" && packLine ? packLine.unitCents : terms.prixMensuelCents;

  return {
    type,
    numero: terms.numero,
    date: terms.date,
    lieu: terms.lieu,
    devisNumero: quote.numero,
    client,

    // Abonnement
    prixMensuelCents,
    kitsBain: terms.kitsBain,
    kitsLit: terms.kitsLit,
    livraisonsIncluses: terms.livraisonsIncluses,
    dateDebut: terms.dateDebut,
    engagementMois: terms.engagementMois,
    preavisJours: terms.preavisJours,
    jourFacturation: terms.jourFacturation,
    nbMensualitesDevis: type === "ABONNEMENT" ? nbMensualites : undefined,

    // Ponctuel
    lignes: type === "PONCTUEL" ? quote.lignes.map((l) => ({ ...l })) : [],
    totalCents: quote.totalNetCents,
    tvaApplicable: quote.tvaApplicable,

    // Commun
    depotGarantieCents: terms.depotGarantieCents,
    conditionsParticulieres: terms.conditionsParticulieres,
    signatureSrc: terms.signatureSrc,
  };
}
