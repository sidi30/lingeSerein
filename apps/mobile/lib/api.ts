import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "./store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

// ─── Generic fetch ───────────────────────────────────────────────

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `API error: ${res.status}`;
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ─── Response wrappers ───────────────────────────────────────────

interface ApiRes<T> {
  success: boolean;
  data: T;
}

interface ApiListRes<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface NotifListRes {
  success: boolean;
  data: Notification[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Types ───────────────────────────────────────────────────────

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  isRecurring: boolean;
  totalCents: number;
  deliveryDate: string;
  timeSlot: string | null;
  specialNotes: string | null;
  cancelledReason: string | null;
  createdAt: string;
  items: OrderItem[];
  user?: { id: string; name: string; email: string };
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  product: { name: string; range: string; category: string };
}

export interface Product {
  id: string;
  category: string;
  range: string;
  name: string;
  description: string | null;
  priceCents: number;
  attributes: Record<string, unknown>;
  imageUrl: string | null;
}

export interface ClientStock {
  productRange: string;
  cleanSets: number;
  dirtySets: number;
  totalInCirculation: number;
}

export interface StockMovement {
  id: string;
  productRange: string;
  type: string;
  quantity: number;
  reason: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  pauseMonthsUsed: number;
  cancelledAt: string | null;
  cancelEffectiveAt: string | null;
  products: SubProduct[];
}

interface SubProduct {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    range: string;
    category: string;
    priceCents: number;
  };
}

export interface Notification {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  accommodationType: string | null;
  isEmailVerified: boolean;
  stockAlertThreshold: number;
  preferredTimeSlot: string | null;
  createdAt: string;
}

// ─── Role helper ─────────────────────────────────────────────────

export function useIsClient() {
  return useAuthStore((s) => s.user?.role === "ROLE_CLIENT");
}

// ─── Hooks: Orders ───────────────────────────────────────────────

export function useOrders(status?: string) {
  const token = useAuthStore((s) => s.accessToken);
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", "50");
  return useQuery<Order[]>({
    queryKey: ["orders", status],
    queryFn: async () => {
      const res = await apiFetch<ApiListRes<Order>>(`/orders?${params.toString()}`);
      return res.data;
    },
    enabled: !!token,
  });
}

export function useOrder(id: string) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery<Order>({
    queryKey: ["order", id],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<Order>>(`/orders/${id}`);
      return res.data;
    },
    enabled: !!token && !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      items: { productId: string; quantity: number }[];
      deliveryDate: string;
      timeSlot?: string;
      specialNotes?: string;
    }) => {
      const res = await apiFetch<ApiRes<Order>>("/orders", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await apiFetch<ApiRes<Order>>(`/orders/${id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      return res.data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", id] });
    },
  });
}

// ─── Hooks: Products ─────────────────────────────────────────────

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await apiFetch<ApiListRes<Product>>("/products?limit=100");
      return res.data;
    },
  });
}

// ─── Hooks: Stock (client only) ──────────────────────────────────

export function useMyStock() {
  const token = useAuthStore((s) => s.accessToken);
  const isClient = useIsClient();
  return useQuery<{ stocks: ClientStock[]; recentMovements: StockMovement[] }>({
    queryKey: ["stock-me"],
    queryFn: async () => {
      const res =
        await apiFetch<ApiRes<{ stocks: ClientStock[]; recentMovements: StockMovement[] }>>(
          "/stock/me",
        );
      return res.data;
    },
    enabled: !!token && isClient,
  });
}

// ─── Hooks: Subscription (client only) ───────────────────────────

export function useMySubscription() {
  const token = useAuthStore((s) => s.accessToken);
  const isClient = useIsClient();
  return useQuery<Subscription | null>({
    queryKey: ["subscription-me"],
    queryFn: async () => {
      try {
        const res = await apiFetch<ApiRes<Subscription>>("/subscriptions/me");
        return res.data;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          return null;
        }
        throw e;
      }
    },
    enabled: !!token && isClient,
  });
}

export function usePauseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/subscriptions/me/pause", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription-me"] }),
  });
}

export function useResumeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/subscriptions/me/resume", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription-me"] }),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/subscriptions/me/cancel", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription-me"] }),
  });
}

// ─── Hooks: Notifications ────────────────────────────────────────

export function useNotifications() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await apiFetch<NotifListRes>("/notifications?limit=50");
      return { notifications: res.data, unreadCount: res.unreadCount };
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ─── Hooks: Profile ──────────────────────────────────────────────

export function useProfile() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<UserProfile>>("/auth/me");
      return res.data;
    },
    enabled: !!token,
  });
}

// ─── Hooks: Deliveries (driver only) ─────────────────────────────

export interface DeliveryRound {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stops: DeliveryStop[];
  zone?: { name: string };
}

export interface DeliveryStop {
  id: string;
  stopOrder: number;
  status: string;
  setsToDeliver: number;
  setsDelivered: number | null;
  dirtyPickedUp: number | null;
  specialInstructions: string | null;
  completedAt: string | null;
  client: { id: string; name: string; address?: string; phone?: string };
  order?: { orderNumber: string } | null;
}

export function useTodayRound() {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery<DeliveryRound | null>({
    queryKey: ["today-round"],
    queryFn: async () => {
      try {
        const res = await apiFetch<ApiRes<DeliveryRound>>("/deliveries/today");
        return res.data;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
          return null;
        }
        throw e;
      }
    },
    enabled: !!token && role === "ROLE_LIVREUR",
  });
}

export function useCompleteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      stopId,
      data,
    }: {
      stopId: string;
      data: { setsDelivered: number; dirtyPickedUp?: number };
    }) => {
      const res = await apiFetch<ApiRes<DeliveryStop>>(`/deliveries/stops/${stopId}/complete`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["today-round"] }),
  });
}

export function useCompleteRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roundId: string) => {
      const res = await apiFetch<ApiRes<DeliveryRound>>(`/deliveries/rounds/${roundId}/complete`, {
        method: "PATCH",
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["today-round"] }),
  });
}

// ─── Hooks: Dashboard (admin only) ──────────────────────────────

export interface DashboardKpis {
  revenueCents: number;
  revenuePrevWeekCents: number;
  deliveriesCompleted: number;
  newClients: number;
  activeSubscriptions: number;
  lowStockAlerts: number;
}

export function useDashboardKpis() {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery<DashboardKpis>({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<DashboardKpis>>("/dashboard/kpis");
      return res.data;
    },
    enabled: !!token && (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN"),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " \u20ac";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
