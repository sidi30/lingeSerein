/** Rôles utilisateur */
export const ROLES = {
  CLIENT: "ROLE_CLIENT",
  LIVREUR: "ROLE_LIVREUR",
  ADMIN: "ROLE_ADMIN",
  SUPER_ADMIN: "ROLE_SUPER_ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Gammes de linge */
export const PRODUCT_RANGES = {
  CONFORT: "CONFORT",
  HOTEL: "HOTEL",
  PRESTIGE: "PRESTIGE",
} as const;

export type ProductRange = (typeof PRODUCT_RANGES)[keyof typeof PRODUCT_RANGES];

/**
 * @deprecated V2 — barème CONFORT/HOTEL/PRESTIGE périmé (ADR-V2-007). Utiliser CATALOG_DEFAULTS / CATALOG_PRODUCTS.
 * Conservé temporairement pour ne pas casser un import résiduel. Aucun nouveau code ne doit l'utiliser.
 */
export const PRICE_PER_SET_CENTS: Record<ProductRange, number> = {
  CONFORT: 600,
  HOTEL: 900,
  PRESTIGE: 1400,
};

/** Grammage par gamme (g/m²) */
export const GRAMMAGE: Record<ProductRange, number> = {
  CONFORT: 500,
  HOTEL: 550,
  PRESTIGE: 600,
};

/** Seuil d'alerte stock par défaut (%) */
export const DEFAULT_STOCK_ALERT_THRESHOLD = 30;

/** Nombre max de lavages avant réforme */
export const MAX_WASH_CYCLES = 100;

/** Seuil d'alerte usure (lavages) */
export const WASH_ALERT_THRESHOLD = 80;

/** Durée JWT access token (secondes) */
export const JWT_ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes

/** Durée JWT refresh token (secondes) */
export const JWT_REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 jours

/** Tentatives de connexion avant blocage */
export const MAX_LOGIN_ATTEMPTS = 5;

/**
 * @deprecated V2 — modèle multi-plans périmé (ADR-V2-003/007). Utiliser SUBSCRIPTION_DEFAULTS (Pack Sérénité).
 * Conservé temporairement pour ne pas casser un import résiduel. Aucun nouveau code ne doit l'utiliser.
 */
export const SUBSCRIPTION_PLANS = {
  ESSENTIELLE: {
    name: "Essentielle",
    deliveriesPerMonth: 4,
    setsIncluded: 20,
  },
  CONFORT: {
    name: "Confort",
    deliveriesPerMonth: 8,
    setsIncluded: 40,
  },
  PRESTIGE: {
    name: "Prestige",
    deliveriesPerMonth: -1, // illimité
    setsIncluded: 60,
  },
} as const;

// ============================================================================
// V2 — SOURCE DE VÉRITÉ CATALOGUE & ABONNEMENT (F7, ADR-V2-007)
// Valeurs par défaut utilisées pour le SEEDING et l'affichage vitrine (Option A).
// NB: les prix de PRODUCTION sont ceux de la DB (paramétrables via l'admin).
// La vitrine affiche ces valeurs de départ — désynchro possible avec la DB, assumée en V1.
// ============================================================================

/** Type de produit catalogue (miroir de l'enum Prisma ProductKind) */
export type ProductKind = "KIT" | "ARTICLE";

/** Slug métier stable des 9 produits canoniques (clé d'upsert du seed) */
export type ProductSlug =
  | "kit-bain"
  | "kit-lit"
  | "kit-complet"
  | "serviette"
  | "drap-bain"
  | "tapis-bain"
  | "petite-serviette"
  | "drap-housse"
  | "housse-couette";

/** Catalogue produits — prix par défaut (centimes) */
export const CATALOG_DEFAULTS = {
  KIT_BAIN_CENTS: 750,
  KIT_LIT_CENTS: 1650,
  KIT_COMPLET_CENTS: 2900, // 750 + 1650 + 2 serviettes (2 × 450) − 400 de remise groupage
  KIT_COMPLET_DISCOUNT_CENTS: 400, // remise groupage bain+lit+serviettes
  /** Serviettes 50×90 incluses dans le Kit Complet (en plus du Kit Bain + Kit Lit). */
  KIT_COMPLET_SERVIETTES_INCLUSES: 2,
  SERVIETTE_CENTS: 450,
  DRAP_BAIN_CENTS: 650,
  TAPIS_BAIN_CENTS: 400,
  PETITE_SERVIETTE_CENTS: 250,
  DRAP_HOUSSE_CENTS: 750,
  HOUSSE_COUETTE_CENTS: 900,
} as const;

/**
 * Définition canonique des 9 produits, consommée par le seed/reseed (ADR-V2-007).
 * `category` est indicatif (nullable en DB) ; les KITS ont category=null, range=null.
 */
export interface CatalogProductDef {
  slug: ProductSlug;
  kind: ProductKind;
  name: string;
  description: string;
  category: "SERVIETTES" | "TAPIS_BAIN" | "LINGE_LIT" | null;
  priceCents: number;
}

export const CATALOG_PRODUCTS: readonly CatalogProductDef[] = [
  {
    slug: "kit-bain",
    kind: "KIT",
    name: "Kit Bain",
    description: "Drap de bain 70×150 + Serviette 50×90 + Tapis 50×70",
    category: null,
    priceCents: CATALOG_DEFAULTS.KIT_BAIN_CENTS,
  },
  {
    slug: "kit-lit",
    kind: "KIT",
    name: "Kit Lit",
    description: "Housse de couette + Drap housse + Taies",
    category: null,
    priceCents: CATALOG_DEFAULTS.KIT_LIT_CENTS,
  },
  {
    slug: "kit-complet",
    kind: "KIT",
    name: "Kit Complet (Bain + Lit)",
    description: "Kit Bain + Kit Lit + 2 serviettes 50×90 incluses (remise groupage −4 €)",
    category: null,
    priceCents: CATALOG_DEFAULTS.KIT_COMPLET_CENTS,
  },
  {
    slug: "serviette",
    kind: "ARTICLE",
    name: "Serviette de toilette",
    description: "50×90 cm",
    category: "SERVIETTES",
    priceCents: CATALOG_DEFAULTS.SERVIETTE_CENTS,
  },
  {
    slug: "drap-bain",
    kind: "ARTICLE",
    name: "Grand drap de bain",
    description: "70×150 cm",
    category: "SERVIETTES",
    priceCents: CATALOG_DEFAULTS.DRAP_BAIN_CENTS,
  },
  {
    slug: "tapis-bain",
    kind: "ARTICLE",
    name: "Tapis de bain",
    description: "50×70 cm",
    category: "TAPIS_BAIN",
    priceCents: CATALOG_DEFAULTS.TAPIS_BAIN_CENTS,
  },
  {
    slug: "petite-serviette",
    kind: "ARTICLE",
    name: "Petite serviette",
    description: "30×50 cm",
    category: "SERVIETTES",
    priceCents: CATALOG_DEFAULTS.PETITE_SERVIETTE_CENTS,
  },
  {
    slug: "drap-housse",
    kind: "ARTICLE",
    name: "Drap housse",
    description: "90×200 ou 160×200 cm",
    category: "LINGE_LIT",
    priceCents: CATALOG_DEFAULTS.DRAP_HOUSSE_CENTS,
  },
  {
    slug: "housse-couette",
    kind: "ARTICLE",
    name: "Housse de couette",
    description: "160×200 ou 240×220 cm",
    category: "LINGE_LIT",
    priceCents: CATALOG_DEFAULTS.HOUSSE_COUETTE_CENTS,
  },
] as const;

/**
 * Abonnement Pack Sérénité — valeurs par défaut (source de vérité pour seeding + vitrine).
 *
 * Dotation mensuelle livrée en DEUX passages (un par quinzaine) : le linge livré est
 * repris au passage suivant, il ne reste jamais plus de {@link SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS}
 * jours chez le client. KIT_*_QTY reste le total MENSUEL ; KIT_*_QTY_PER_PASSAGE la
 * dotation de chaque quinzaine.
 */
export const SUBSCRIPTION_DEFAULTS = {
  PLAN_NAME: "Pack Sérénité",
  PRICE_CENTS: 8900, // 89 €/mois
  KIT_BAIN_QTY: 8,
  KIT_LIT_QTY: 4,
  /** Nombre de livraisons/reprises incluses par mois (une par quinzaine). */
  DELIVERIES_PER_MONTH: 2,
  KIT_BAIN_QTY_PER_PASSAGE: 4,
  KIT_LIT_QTY_PER_PASSAGE: 2,
  /** Durée maximale (jours) pendant laquelle le linge reste chez le client avant reprise. */
  MAX_LINEN_KEEP_DAYS: 14,
  MIN_ENGAGEMENT_MONTHS: 3,
  NOTICE_PERIOD_DAYS: 30,
} as const;

/** Livraison — seuils par défaut */
export const DELIVERY_DEFAULTS = {
  FREE_THRESHOLD_CENTS: 12000, // offerte dès 120 €
  FREE_MIN_KITS_ORANGE: 4, // offerte dès 4 kits à Orange
  ZONE_ORANGE_CENTS: 1200, // Orange, sous le seuil de gratuité — 12 €
  ZONE_PROCHE_CENTS: 1200, // villes limitrophes d'Orange — 12 €
  /** Forfait Express 24 h (livraison le lendemain) — fixe, non soumis aux gratuités. */
  EXPRESS_24H_FEE_CENTS: 2500,
  /** Forfait Jour même (sous 8 h, commande avant 12 h) — fixe, non soumis aux gratuités. */
  JOUR_MEME_FEE_CENTS: 3900,
} as const;

/**
 * Zone de livraison.
 * ORANGE et PROCHE (villes limitrophes) ont un tarif public ; au-delà,
 * HORS_ZONE = systématiquement sur devis (aucun barème publié).
 */
export type DeliveryZone = "ORANGE" | "PROCHE" | "HORS_ZONE";

export const DELIVERY_ZONE_LABELS: Record<DeliveryZone, string> = {
  ORANGE: "Orange",
  PROCHE:
    "Villes limitrophes d'Orange (Jonquières, Courthézon, Camaret, Piolenc, Caderousse, Châteauneuf-du-Pape…)",
  HORS_ZONE: "Hors zone — sur devis",
};

/**
 * Niveau d'urgence de la livraison (la « jauge » du devis).
 * STANDARD = tournée planifiée J+2/J+3 ; EXPRESS_24H et JOUR_MEME = forfait
 * fixe qui REMPLACE le barème de zone ; FLASH = jamais de prix public
 * (un seul livreur : pas de SLA < 3 h garanti), toujours sur devis.
 */
export type UrgencyLevel = "STANDARD" | "EXPRESS_24H" | "JOUR_MEME" | "FLASH";

export interface UrgencyTier {
  level: UrgencyLevel;
  label: string;
  /** Délai promis, affiché tel quel (jauge, devis, contrat). */
  delaiText: string;
  /** Forfait en centimes — 0 = barème de zone, null = sur devis. */
  feeCents: number | null;
  description: string;
}

const STANDARD_TIER: UrgencyTier = {
  level: "STANDARD",
  label: "Standard",
  delaiText: "J+2 à J+3 selon zone",
  feeCents: 0,
  description: "Tournée planifiée — barème de zone (livraison offerte selon seuils).",
};

export const URGENCY_TIERS: readonly UrgencyTier[] = [
  STANDARD_TIER,
  {
    level: "EXPRESS_24H",
    label: "Express 24 h",
    delaiText: "livraison le lendemain (J+1)",
    feeCents: DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS,
    description: "Forfait fixe, remplace le barème de zone, non soumis aux seuils de gratuité.",
  },
  {
    level: "JOUR_MEME",
    label: "Jour même",
    delaiText: "sous 8 h — commande avant 12 h, selon disponibilité",
    feeCents: DELIVERY_DEFAULTS.JOUR_MEME_FEE_CENTS,
    description: "Sortie dédiée hors tournée. Forfait fixe, non soumis aux seuils de gratuité.",
  },
  {
    level: "FLASH",
    label: "Flash < 3 h",
    delaiText: "moins de 3 h, selon disponibilité du livreur",
    feeCents: null,
    description: "Tarif communiqué sur devis, après accord téléphonique.",
  },
] as const;

export function urgencyTier(level: UrgencyLevel): UrgencyTier {
  return URGENCY_TIERS.find((t) => t.level === level) ?? STANDARD_TIER;
}

/** Délais standard par formule — texte unique repris par la vitrine et le contrat. */
export const SERVICE_DELAY_TEXT = {
  ABONNEMENT:
    "Abonnement : rotations planifiées à jour fixe, une livraison/reprise par quinzaine — le linge livré est repris sous 14 jours maximum.",
  PONCTUEL: "Location ponctuelle : livraison sous J+2 à J+3 selon zone.",
  MISE_EN_PLACE:
    "Mise en place initiale (gros volumes, hors zone) : J+3 à J+5, précisé sur le devis.",
} as const;

export interface DeliveryFeeInput {
  /**
   * Délai entre la commande et la livraison, en jours (0 = jour même,
   * 1 = lendemain). Ignoré si `urgency` est fourni.
   */
  delaiJours?: number;
  /** Niveau d'urgence choisi sur la jauge — prioritaire sur `delaiJours`. */
  urgency?: UrgencyLevel;
  zone: DeliveryZone;
  /** Montant des articles APRÈS remise, en centimes (seuil de gratuité). */
  montantApresRemiseCents: number;
  /** Nombre de kits commandés (gratuité Orange). */
  nbKits: number;
}

export interface DeliveryFee {
  /** Montant facturé, en centimes (0 si offerte OU si sur devis — voir `surDevis`). */
  cents: number;
  /** Libellé exact repris tel quel sur le devis ET sur le contrat. */
  label: string;
  /** Niveau d'urgence effectivement appliqué. */
  urgencyLevel: UrgencyLevel;
  /** Forfait d'urgence appliqué (Express 24 h / Jour même). */
  urgent: boolean;
  /** Livraison offerte (seuil atteint). */
  offerte: boolean;
  /** Aucun tarif public : montant à saisir manuellement (hors zone ou Flash < 3 h). */
  surDevis: boolean;
}

/** Déduit le niveau d'urgence d'un délai en jours (compat anciens appels). */
export function urgencyFromDelaiJours(delaiJours: number | undefined): UrgencyLevel {
  if (delaiJours === undefined || !Number.isFinite(delaiJours)) return "STANDARD";
  if (delaiJours <= 0) return "JOUR_MEME";
  if (delaiJours === 1) return "EXPRESS_24H";
  return "STANDARD";
}

/**
 * Frais de livraison — SOURCE DE VÉRITÉ unique (devis, contrat, admin, vitrine).
 *
 * Règle métier :
 *  - zone HORS_ZONE → toujours sur devis (aucun barème public), quelle que soit l'urgence ;
 *  - urgence FLASH (< 3 h) → toujours sur devis (pas de SLA garanti avec un seul livreur) ;
 *  - urgence JOUR_MEME (< 8 h) → forfait 39 € fixe, ni gratuité ni tarif de zone ;
 *  - urgence EXPRESS_24H (J+1) → forfait 25 € fixe, ni gratuité ni tarif de zone ;
 *  - STANDARD (J+2/J+3) → tarif ordinaire : offerte dès 120 € de commande (après
 *    remise) ou dès 4 kits à Orange, sinon 12 € (Orange / villes limitrophes).
 */
export function computeDeliveryFee(input: DeliveryFeeInput): DeliveryFee {
  const { zone, montantApresRemiseCents, nbKits } = input;
  const level = input.urgency ?? urgencyFromDelaiJours(input.delaiJours);

  if (zone === "HORS_ZONE") {
    return {
      cents: 0,
      label: "Livraison hors zone — sur devis",
      urgencyLevel: level,
      urgent: false,
      offerte: false,
      surDevis: true,
    };
  }

  if (level === "FLASH") {
    return {
      cents: 0,
      label: "Livraison Flash (< 3 h) — sur devis, selon disponibilité",
      urgencyLevel: level,
      urgent: true,
      offerte: false,
      surDevis: true,
    };
  }

  if (level === "JOUR_MEME" || level === "EXPRESS_24H") {
    const tier = urgencyTier(level);
    return {
      cents: tier.feeCents ?? 0,
      label: `Livraison ${tier.label} (${tier.delaiText}) — forfait`,
      urgencyLevel: level,
      urgent: true,
      offerte: false,
      surDevis: false,
    };
  }

  const offerteSeuil = montantApresRemiseCents >= DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS;
  const offerteOrange = zone === "ORANGE" && nbKits >= DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE;

  if (offerteSeuil || offerteOrange) {
    return {
      cents: 0,
      label: offerteOrange
        ? `Livraison offerte (Orange, dès ${DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits)`
        : `Livraison offerte (dès ${DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande)`,
      urgencyLevel: level,
      urgent: false,
      offerte: true,
      surDevis: false,
    };
  }

  const cents =
    zone === "ORANGE" ? DELIVERY_DEFAULTS.ZONE_ORANGE_CENTS : DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS;

  return {
    cents,
    label: `Livraison — ${zone === "ORANGE" ? "Orange" : "villes limitrophes d'Orange"}`,
    urgencyLevel: level,
    urgent: false,
    offerte: false,
    surDevis: false,
  };
}

/**
 * Énoncé du barème de livraison, rédigé une seule fois : le devis et le contrat
 * impriment strictement la même clause.
 */
export const DELIVERY_RULE_TEXT =
  `Frais de livraison : standard (J+2 à J+3) — ` +
  `${DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS / 100} € à Orange et dans les villes limitrophes, ` +
  `offerte dès ${DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 100} € de commande ou dès ` +
  `${DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits à Orange ; au-delà des villes limitrophes, ` +
  `sur devis. Urgence : Express 24 h (J+1) — forfait de ` +
  `${DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS / 100} € ; Jour même (sous 8 h, commande avant ` +
  `12 h, selon disponibilité) — forfait de ${DELIVERY_DEFAULTS.JOUR_MEME_FEE_CENTS / 100} € ; ` +
  `moins de 3 h — sur devis, selon disponibilité. Les forfaits d'urgence sont fixes, non ` +
  `dégressifs et non soumis aux seuils de gratuité.`;

/**
 * Libellé de repli quand le délai/la zone ne sont pas connus (devis relu depuis
 * la base : seul le montant est persisté). Garantit que le contrat affiche le
 * même intitulé que le devis pour un même montant.
 */
export function deliveryLabelFromCents(cents: number): string {
  if (cents <= 0) return "Livraison offerte";
  if (cents === DELIVERY_DEFAULTS.EXPRESS_24H_FEE_CENTS) {
    return "Livraison Express 24 h (livraison le lendemain (J+1)) — forfait";
  }
  if (cents === DELIVERY_DEFAULTS.JOUR_MEME_FEE_CENTS) {
    return "Livraison Jour même (sous 8 h — commande avant 12 h, selon disponibilité) — forfait";
  }
  return "Livraison";
}

/**
 * Comparaison à-la-carte vs Pack Sérénité (base mensuelle, honnête).
 *
 * Le Pack Sérénité est un FORFAIT mensuel fixe (89 €) qui inclut un allotissement mensuel
 * FIXE : {@link SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain + {@link SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY}
 * kits lit + {@link SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH} livraisons/reprises incluses
 * (une par quinzaine). La base de comparaison honnête est donc la valeur à-la-carte de CE
 * panier mensuel fixe — jamais multipliée par le nombre de rotations/mois. Chaque livraison
 * est illustrée au tarif « villes limitrophes » (12 €).
 *
 * @returns montants en centimes : `alaCarteCents` (panier mensuel à l'unité),
 * `packCents` (prix du pack) et `economieCents` (= alaCarteCents − packCents).
 */
export function computePackSereniteComparison(): {
  alaCarteCents: number;
  packCents: number;
  economieCents: number;
} {
  const kitsCents =
    SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY * CATALOG_DEFAULTS.KIT_BAIN_CENTS +
    SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY * CATALOG_DEFAULTS.KIT_LIT_CENTS;
  const alaCarteCents =
    kitsCents + SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH * DELIVERY_DEFAULTS.ZONE_PROCHE_CENTS;
  const packCents = SUBSCRIPTION_DEFAULTS.PRICE_CENTS;
  return {
    alaCarteCents,
    packCents,
    economieCents: alaCarteCents - packCents,
  };
}

/** Rate limiting */
export const RATE_LIMITS = {
  PER_IP: 100,
  PER_TOKEN: 1000,
  WINDOW_MS: 60_000,
} as const;
