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

export interface ClientOrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalCents: number;
  deliveryDate: string;
  timeSlot: string | null;
  createdAt: string;
  items: { id: string; quantity: number; product: { name: string } }[];
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
  totalCents: number;
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
}

export interface OrderListDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  totalCents: number;
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
}

export interface SubscriptionConfigDTO extends SubscriptionConfigPublicDTO {
  id: string;
  operatorId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
