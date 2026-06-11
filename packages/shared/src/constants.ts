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
  KIT_COMPLET_CENTS: 2200, // 750 + 1650 - 200
  KIT_COMPLET_DISCOUNT_CENTS: 200, // remise groupage bain+lit
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
    description: "Kit Bain + Kit Lit groupés (remise groupage −2 €)",
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

/** Abonnement Pack Sérénité — valeurs par défaut (source de vérité pour seeding + vitrine) */
export const SUBSCRIPTION_DEFAULTS = {
  PLAN_NAME: "Pack Sérénité",
  PRICE_CENTS: 8900, // 89 €/mois
  KIT_BAIN_QTY: 8,
  KIT_LIT_QTY: 4,
  MIN_ENGAGEMENT_MONTHS: 3,
  NOTICE_PERIOD_DAYS: 30,
} as const;

/** Livraison — seuils par défaut */
export const DELIVERY_DEFAULTS = {
  FREE_THRESHOLD_CENTS: 12000, // offerte dès 120 €
  FREE_MIN_KITS_ORANGE: 4, // offerte dès 4 kits à Orange
} as const;

/** Rate limiting */
export const RATE_LIMITS = {
  PER_IP: 100,
  PER_TOKEN: 1000,
  WINDOW_MS: 60_000,
} as const;
