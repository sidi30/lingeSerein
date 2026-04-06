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

/** Prix par set (en centimes) pour éviter les erreurs de virgule flottante */
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

/** Formules d'abonnement */
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

/** Rate limiting */
export const RATE_LIMITS = {
  PER_IP: 100,
  PER_TOKEN: 1000,
  WINDOW_MS: 60_000,
} as const;
