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
  user: { id: string; name: string; email: string } | null;
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
    email: string;
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
  user: { id: string; name: string; email: string };
  items: OrderItemDTO[];
}

/* ─── Utilisateurs ─── */

export type UserRole = "ROLE_CLIENT" | "ROLE_LIVREUR" | "ROLE_ADMIN" | "ROLE_SUPER_ADMIN";

export interface UserDTO {
  id: string;
  email: string;
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
