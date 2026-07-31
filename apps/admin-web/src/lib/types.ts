/**
 * Types partagés pour l'admin-web — conformes au contrat api-contracts.json.
 */

import type { QuoteStatus, OrderStatus, OrderSource } from "@lingengo/shared";
export type { QuoteStatus, OrderStatus, OrderSource };

/* ─── Pagination ─── */

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
  meta?: Record<string, unknown>;
}

/* ─── Devis ─── */

export interface QuoteLineDTO {
  id: string;
  designation: string;
  qty: number;
  unitCents: number;
  position: number;
}

export interface QuoteTotals {
  sousTotal: number;
  remise: number;
  totalHT: number;
  tva: number;
  totalTTC: number;
}

export interface QuoteDTO {
  id: string;
  numero: string;
  status: QuoteStatus;
  clientNom: string;
  clientEmail: string | null;
  clientTel: string | null;
  clientAdresse: string | null;
  userId: string | null;
  user: { id: string; name: string; email: string | null } | null;
  lignes: QuoteLineDTO[];
  remisePct: number;
  livraisonCents: number;
  /**
   * Aucun tarif public sur cette course : `livraisonCents` vaut 0 SANS être
   * offerte. Optionnel — une API plus ancienne ne renvoie pas le champ, l'écran
   * retombe alors sur le libellé déduit du montant (voir `quoteDeliveryLabel`).
   */
  livraisonSurDevis?: boolean | null;
  /** Libellé figé par le serveur, affiché mot pour mot quand il existe. */
  livraisonLabel?: string | null;
  tvaApplicable: boolean;
  notes: string | null;
  validiteJours: number;
  dateEnvoi: string | null;
  dateReponse: string | null;
  convertedToOrderId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  totals: QuoteTotals;
}

/* ─── Clients (CRM) ─── */

/**
 * Origine d'un client. `APP` = auto-inscrit via l'app mobile, les autres sont
 * saisis par l'artisan.
 */
export type ClientSource = "APP" | "ADMIN" | "BOUCHE_A_OREILLE" | "MARCHE" | "DEVIS" | "SITE_WEB";

export const CLIENT_SOURCE_LABELS: Record<ClientSource, string> = {
  APP: "Application",
  ADMIN: "Saisie admin",
  BOUCHE_A_OREILLE: "Bouche à oreille",
  MARCHE: "Marché",
  DEVIS: "Devis",
  SITE_WEB: "Site web",
};

export interface ClientStockDTO {
  productRange: string;
  cleanSets: number;
  dirtySets: number;
  totalInCirculation: number;
}

export interface ClientSubscriptionDTO {
  id?: string;
  plan: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  committedUntil?: string | null;
  pausedAt?: string | null;
  cancelledAt?: string | null;
}

/** Champs commerciaux calculés côté API, communs à la liste et à la fiche. */
interface ClientMetrics {
  ordersCount: number;
  revenueCents: number;
  lastOrderAt: string | null;
  hasAppAccess: boolean;
}

export interface ClientListDTO extends ClientMetrics {
  id: string;
  name: string;
  companyName: string | null;
  // Nullable depuis le CRM : un client saisi par l'artisan peut n'avoir aucun email.
  email: string | null;
  phone: string | null;
  city: string | null;
  postalCode: string | null;
  /**
   * Code INSEE de la commune, choisi dans la liste fermée du Vaucluse — c'est
   * lui, et non le code postal, qui détermine le palier de livraison. Optionnel :
   * les fiches antérieures à la liste fermée n'en portent pas, l'écran retombe
   * alors sur le code postal en signalant le doute (voir `clientZone`).
   */
  communeInsee?: string | null;
  accommodationType: string | null;
  zoneId: string | null;
  isActive: boolean;
  rating: number | null;
  source: ClientSource;
}

export interface ClientDetailDTO extends ClientListDTO {
  address: string | null;
  preferredTimeSlot: string | null;
  requirements: string | null;
  notes: string | null;
  stockAlertThreshold: number;
  createdAt?: string;
  subscription: ClientSubscriptionDTO | null;
  stocks: ClientStockDTO[];
  orders: ClientOrderDTO[];
}

/**
 * Commande telle que la projette `GET /clients/:id` — une VUE RÉDUITE, pas un
 * `OrderDetailDTO`. Le `select` côté service ne renvoie aujourd'hui que
 * `id`, `orderNumber`, `status`, `totalCents`, `deliveryDate` et `createdAt`.
 *
 * Les champs que la route ne projette pas sont donc optionnels : les déclarer
 * obligatoires faisait passer le typage au vert sur une donnée absente, et
 * `order.items.map(...)` plantait la fiche de tout client ayant une commande.
 */
export interface ClientOrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** SOUS-TOTAL des articles, comme partout — voir `OrderDetailDTO`. */
  totalCents: number;
  /** Non projeté à ce jour ⇒ frais INCONNUS, surtout pas « offerte ». */
  deliveryFeeCents?: number | null;
  deliveryFeeSurDevis?: boolean | null;
  deliveryDate: string;
  timeSlot?: string | null;
  createdAt: string;
  items?: { id: string; quantity: number; product: { name: string } }[];
}

/** Corps de POST /clients. */
export interface CreateClientInput {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  /** Code INSEE de la commune livrée (5 caractères, liste fermée du Vaucluse). */
  communeInsee?: string;
  accommodationType?: string;
  zoneId?: string;
  preferredTimeSlot?: string;
  rating?: number;
  requirements?: string;
  notes?: string;
  source?: ClientSource;
  grantAppAccess?: boolean;
  force?: boolean;
}

export interface CreateClientResult {
  client: ClientDetailDTO;
  temporaryPassword?: string;
}

/* ─── Commandes ─── */

export interface OrderItemDTO {
  id: string;
  productId: string;
  product: { id: string; name: string; range: string; category: string };
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface OrderStatusHistoryEntry {
  at: string;
  by: { id: string | null; name: string | null };
  from: OrderStatus | null;
  to: OrderStatus;
  raison: string | null;
}

export interface OrderDetailDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  /** SOUS-TOTAL des articles, pas le total à payer — voir `orderAmounts`. */
  totalCents: number;
  /**
   * Frais de livraison. Optionnel côté lecture : l'API peut être plus ancienne
   * que cet écran, et un champ absent se lit « inconnu », jamais « offerte ».
   */
  deliveryFeeCents?: number | null;
  /** Zone sans tarif public : 0 € y signifie « à chiffrer », pas « offerte ». */
  deliveryFeeSurDevis?: boolean | null;
  /**
   * Résumé calculé par le serveur (`resumeFrais`), présent sur la fiche mais
   * pas sur la liste. Il fait foi quand il est là — voir `orderAmounts`.
   */
  deliveryFee?: { cents: number; label: string; surDevis: boolean } | null;
  deliveryDate: string;
  timeSlot: string | null;
  specialNotes: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDTO[];
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    zone: { id: string; name: string } | null;
  };
  statusHistory: OrderStatusHistoryEntry[];
  convertedFromQuote: { id: string; numero: string } | null;
  /**
   * Devis ÉMIS DEPUIS cette commande (`Quote.fromOrderId`) — relation distincte
   * de `convertedFromQuote`, et les deux peuvent coexister. `null` aussi quand
   * le devis a été supprimé : l'API filtre les devis effacés.
   */
  generatedQuote?: { id: string; numero: string; status?: QuoteStatus } | null;
}

export interface OrderListDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  /** SOUS-TOTAL des articles — voir `OrderDetailDTO.totalCents`. */
  totalCents: number;
  deliveryFeeCents?: number | null;
  deliveryFeeSurDevis?: boolean | null;
  deliveryDate: string;
  timeSlot: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string | null };
  items: OrderItemDTO[];
}

/* ─── Utilisateurs ─── */

export type UserRole = "ROLE_CLIENT" | "ROLE_LIVREUR" | "ROLE_ADMIN" | "ROLE_SUPER_ADMIN";

export interface UserDTO {
  id: string;
  // Nullable : un client créé depuis l'admin/le mobile peut n'avoir pas d'email.
  email: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
  /**
   * Localisation du client, telle que la projette `GET /users` quand elle est
   * disponible. Optionnelle : une API plus ancienne ne renvoie pas ces champs, et
   * un client sans commune confirmée n'en porte pas. Absents, le devis ne
   * présélectionne aucune zone plutôt que d'en supposer une.
   */
  city?: string | null;
  postalCode?: string | null;
  communeInsee?: string | null;
  zoneId: string | null;
  zone: { id: string; name: string } | null;
  isActive: boolean;
  isEmailVerified: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ─── Réglages ─── */

export interface DeliveryZoneDTO {
  id: string;
  name: string;
  postalCodes: string[];
  deliveryFeeCents: number;
  isActive: boolean;
  userCount: number;
}

export interface OperatorDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  siret: string | null;
  legalMentions: string | null;
  /** Coordonnées bancaires imprimées sur les factures (normalisées, sans espaces). */
  iban: string | null;
  bic: string | null;
  isActive: boolean;
}

export interface StockThresholdDTO {
  productId: string;
  name: string;
  // V2 : les produits KITS ont range/category null (ADR-V2-001).
  range: string | null;
  category: string | null;
  stockAlertThreshold: number;
}

/* ─── Produits (pour le sélecteur de conversion, legacy) ─── */

export interface ProductDTO {
  id: string;
  name: string;
  range: "CONFORT" | "HOTEL" | "PRESTIGE";
  category: string;
  pricePerSetCents: number;
}

/* ─── Produits V2 (F5 — catalogue KITS) ─── */

export type ProductKind = "KIT" | "ARTICLE";

export interface ProductV2DTO {
  id: string;
  slug: string | null;
  kind: ProductKind;
  category: string | null;
  range: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  attributes: Record<string, unknown>;
  imageUrl: string | null;
  isActive: boolean;
  serviceType: { kind: string; name: string };
}

/* ─── Config abonnement Pack Sérénité (F6) ─── */

export interface SubscriptionConfigPublicDTO {
  planName: string;
  priceCents: number;
  kitBainQty: number;
  kitLitQty: number;
  minEngagementMonths: number;
  noticePeriodDays: number;
  /** Facturation récurrente avec TVA. Absent des API plus anciennes. */
  tvaApplicable?: boolean;
}

export interface SubscriptionConfigDTO extends SubscriptionConfigPublicDTO {
  id: string;
  operatorId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ─── Factures ─── */

/**
 * Types du snapshot de facture : ceux de @lingengo/shared, pas une copie locale.
 * `InvoiceMetadataLine` y admet les DEUX formes écrites en base — `designation`/
 * `qty` (facturation d'un devis) et `product`/`quantity` (worker d'abonnement) —
 * et `normalizeInvoiceLines` les ramène à une forme unique. L'écran et le PDF
 * lisent ainsi exactement les mêmes lignes, sans divergence possible.
 */
export type {
  InvoiceStatus,
  InvoiceMetadata,
  InvoiceMetadataLine,
  InvoiceLine,
} from "@lingengo/shared";

import type { InvoiceStatus, InvoiceMetadata } from "@lingengo/shared";

/**
 * Machine à états des factures — MIROIR de INVOICE_TRANSITIONS
 * (packages/api/src/services/invoices.service.ts), qui reste l'autorité :
 * l'API rejette toute transition invalide même si l'UI la proposait.
 * Sert uniquement à n'afficher que les boutons réellement possibles.
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED"],
  PAID: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export interface InvoiceDTO {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  userId: string | null;
  user: { id: string; name: string; email: string | null } | null;
  quoteId: string | null;
  quote: { id: string; numero: string; status?: QuoteStatus } | null;
  clientNom: string | null;
  clientEmail: string | null;
  clientAdresse: string | null;
  totalHtCents: number;
  vatRate: number;
  vatAmountCents: number;
  totalTtcCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  paidAt: string | null;
  pdfUrl: string | null;
  metadata: InvoiceMetadata;
  createdAt: string;
  updatedAt: string;
}
