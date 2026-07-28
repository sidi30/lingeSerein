import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { useAuthStore } from "./store";
import { invalidateAfter } from "./query";
import { queryClient, SHARED_STATE_STALE_TIME } from "./queryClient";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

// Transport: interdire le cleartext (HTTP) hors développement. Un build
// release qui pointerait vers http:// exposerait le Bearer token à un MITM.
// NB: la garde est évaluée à CHAQUE requête (apiFetch), jamais au chargement du
// module. Un throw au top-level planterait le bundle release au lancement
// (l'écran de login importe ce fichier) → l'app se fermerait aussitôt ouverte.
const CLEARTEXT_IN_PROD = !__DEV__ && API_URL.startsWith("http://");

/** Délai au-delà duquel une requête est abandonnée (réseau mobile dégradé). */
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Code machine renvoyé par l'API (AppError.code), ex. "CLIENT_DUPLICATE_PHONE". */
    public code?: string,
    /** Détails structurés (AppError.details) — Record<string, string[]>. */
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/**
 * Message affichable pour une erreur de mutation.
 *
 * `fetch` échoue avec des messages anglais bruts (« Network request failed »)
 * qu'on ne montre jamais tels quels dans une interface française. Seules les
 * ApiError portent un message rédigé par le serveur, donc affichable.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status !== 0) return e.message;
  return "Connexion au serveur impossible. Vérifiez votre réseau, puis réessayez.";
}

/**
 * Extrait un id d'entité des `details` d'une ApiError.
 * L'API sérialise details en Record<string, string[]> ; on tolère plusieurs
 * noms de clé pour ne pas casser si le backend en change un.
 */
export function extractDetailId(
  details: Record<string, string[]> | undefined,
  keys: string[],
): string | null {
  if (!details) return null;
  for (const k of keys) {
    const v = details[k];
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].length > 0) return v[0];
  }
  return null;
}

// ─── Refresh token (single-flight) ───────────────────────────────
// Un seul appel /auth/refresh à la fois ; les requêtes concurrentes en 401
// partagent la même promesse pour éviter une rafale de refresh.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as {
          data?: { accessToken?: string; refreshToken?: string };
        } | null;
        const next = body?.data;
        if (next?.accessToken && next?.refreshToken) {
          useAuthStore.getState().setTokens(next.accessToken, next.refreshToken);
          return next.accessToken;
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// ─── Generic fetch ───────────────────────────────────────────────

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  retried = false,
): Promise<T> {
  // Garde transport: refuse le cleartext en prod au moment de l'appel (erreur
  // catchable, surfacée comme état d'erreur de requête) plutôt qu'un crash global.
  if (CLEARTEXT_IN_PROD) {
    throw new ApiError(0, "Configuration invalide : l'API doit utiliser HTTPS en production.");
  }

  const token = useAuthStore.getState().accessToken;
  const hasBody = options?.body != null;

  // Sans délai maximal, une requête émise dans une zone blanche reste en vol
  // jusqu'au timeout de l'OS (~60 s sur iOS) : le livreur voit un bouton qui
  // tourne indéfiniment et finit par revalider son arrêt. On coupe court.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
        // Authorization placé en dernier pour ne pas être écrasé par options.headers
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (e) {
    // status 0 = pas de réponse du serveur (abandon ou réseau). `errorMessage`
    // le traduit en message français ; le message natif est en anglais.
    const aborted = (e as { name?: string } | null)?.name === "AbortError";
    throw new ApiError(
      0,
      aborted ? "Délai dépassé — le serveur ne répond pas." : "Réseau indisponible.",
    );
  } finally {
    clearTimeout(timeout);
  }

  // 401 sur une route protégée → tenter un refresh une seule fois, puis rejouer.
  // Les routes /auth/* (login, refresh, logout) sont exclues : un 401 y est
  // légitime (mauvais identifiants) et ne doit pas déclencher de refresh/logout.
  if (
    res.status === 401 &&
    !retried &&
    !path.startsWith("/auth/") &&
    useAuthStore.getState().refreshToken
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, options, true);
    }
    // Refresh impossible → session expirée : on purge et on renvoie au login.
    // `qc.clear()` est indispensable ici : ce chemin ne passe pas par
    // `useLogout`, et sans lui le compte suivant retrouvait à l'écran les
    // données du précédent — y compris avec un autre rôle.
    useAuthStore.getState().logout();
    queryClient.clear();
    router.replace("/(auth)/login");
    throw new ApiError(401, "Session expirée, veuillez vous reconnecter.");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; details?: Record<string, string[]> };
    };
    const msg = body?.error?.message ?? `API error: ${res.status}`;
    throw new ApiError(res.status, msg, body?.error?.code, body?.error?.details);
  }

  return res.json() as Promise<T>;
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

// Miroir de orders.service.ts:getById → statusHistory (dérivé de l'AuditLog).
export interface StatusHistoryEntry {
  at: string;
  by: { id: string | null; name: string | null };
  from: string | null;
  to: string | null;
  raison: string | null;
}

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
  user?: {
    id: string;
    name: string;
    /** null : client créé sans compte (terrain/marché) — cf. User.email nullable */
    email: string | null;
    phone?: string;
    zone?: { name: string };
  };
  statusHistory?: StatusHistoryEntry[];
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  product: {
    id: string;
    name: string;
    range: string | null;
    category: string | null;
    kind?: ProductKind;
  };
}

/** Type de produit — miroir de l'enum Prisma ProductKind (ADR-V2-001) */
export type ProductKind = "KIT" | "ARTICLE";

export interface Product {
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
  serviceType?: { kind: string; name: string };
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

/** Configuration publique du Pack Sérénité (EP-SUB-CFG01, SubscriptionConfigPublicDTO) */
export interface SubscriptionConfig {
  planName: string;
  priceCents: number;
  kitBainQty: number;
  kitLitQty: number;
  minEngagementMonths: number;
  noticePeriodDays: number;
}

export interface Subscription {
  id: string;
  /** Legacy plan field (ESSENTIELLE/CONFORT/PRESTIGE) — null pour les nouvelles souscriptions Pack Sérénité */
  plan: string | null;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  /** Prix mensuel snapshot au moment de la souscription (centimes) — null si abonnement legacy non migré */
  priceCents: number | null;
  /** Durée d'engagement minimale snapshot (mois) */
  minEngagementMonths: number;
  /** Date jusqu'à laquelle la résiliation est bloquée — null si exempté ou non calculé */
  committedUntil: string | null;
  /** Nombre de kits bain inclus/mois snapshot */
  kitBainQty: number;
  /** Nombre de kits lit inclus/mois snapshot */
  kitLitQty: number;
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
  /** null : compte sans e-mail (client créé sur le terrain) */
  email: string | null;
  name: string;
  role: string;
  accommodationType: string | null;
  isEmailVerified: boolean;
  stockAlertThreshold: number;
  preferredTimeSlot: string | null;
  createdAt: string;
}

// ─── CRM client ───────────────────────────────────────────────────

/** Miroir de l'enum Prisma ClientSource. */
export type ClientSource = "APP" | "ADMIN" | "BOUCHE_A_OREILLE" | "MARCHE" | "DEVIS" | "SITE_WEB";

export const CLIENT_SOURCES: { value: ClientSource; label: string }[] = [
  { value: "MARCHE", label: "Marché" },
  { value: "BOUCHE_A_OREILLE", label: "Bouche à oreille" },
  { value: "ADMIN", label: "Saisie manuelle" },
  { value: "DEVIS", label: "Devis" },
  { value: "SITE_WEB", label: "Site web" },
  { value: "APP", label: "Application" },
];

export const CLIENT_SOURCE_LABELS: Record<ClientSource, string> = {
  APP: "Application",
  ADMIN: "Saisie manuelle",
  BOUCHE_A_OREILLE: "Bouche à oreille",
  MARCHE: "Marché",
  DEVIS: "Devis",
  SITE_WEB: "Site web",
};

/**
 * Sous-titre d'une ligne client : e-mail si présent, sinon téléphone,
 * sinon mention explicite. Ne renvoie JAMAIS "" ni "null".
 */
export function clientSubtitle(c: {
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}): string {
  if (c.email) return c.email;
  if (c.phone) return c.phone;
  if (c.city) return c.city;
  return "Aucun contact enregistré";
}

// ─── GET /clients list item (no stockSummary, no zone object) ────
export interface ClientListItem {
  id: string;
  name: string;
  companyName: string | null;
  /** null : client créé sans compte (pas d'accès à l'app) */
  email: string | null;
  phone: string | null;
  city: string | null;
  postalCode: string | null;
  accommodationType: string | null;
  isActive: boolean;
  zoneId: string | null;
  stockAlertThreshold: number;
  rating: number | null;
  requirements: string | null;
  notes: string | null;
  source: ClientSource;
  createdAt: string;
  subscription: { plan: string | null; status: string } | null;
  /** stocks array from joined ClientStock rows */
  stocks: ClientStock[];
  ordersCount: number;
  revenueCents: number;
  lastOrderAt: string | null;
  hasAppAccess: boolean;
}

// ─── GET /clients/:id detail ──────────────────────────────────────
export interface ClientDetail {
  id: string;
  name: string;
  companyName: string | null;
  /** null : client créé sans compte (pas d'accès à l'app) */
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  accommodationType: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  zoneId: string | null;
  stockAlertThreshold: number;
  preferredTimeSlot: string | null;
  rating: number | null;
  requirements: string | null;
  notes: string | null;
  source: ClientSource;
  createdAt: string;
  updatedAt: string;
  /** Single subscription with products */
  subscription: {
    plan: string | null;
    status: string;
    products: Array<{
      id: string;
      quantity: number;
      product: { id: string; name: string; range: string | null; priceCents: number };
    }>;
  } | null;
  /** 50 dernières commandes */
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalCents: number;
    deliveryDate: string;
    createdAt: string;
  }>;
  stocks: ClientStock[];
  ordersCount: number;
  revenueCents: number;
  lastOrderAt: string | null;
  hasAppAccess: boolean;
}

// ─── GET /stock/operator — rows per gamme ────────────────────────
export interface OperatorStock {
  id: string;
  operatorId: string;
  productRange: string;
  cleanAvailable: number;
  dirtyPending: number;
  inCirculation: number;
  retired: number;
}

// ─── GET /stock/clients — user row with embedded stocks ──────────
export interface ClientStockRow {
  id: string;
  name: string;
  email: string | null;
  accommodationType: string | null;
  zoneId: string | null;
  stockAlertThreshold: number;
  stocks: ClientStock[];
}

// ─── GET /dashboard/alerts — severity is lowercase string ────────
export interface DashboardAlert {
  type: string;
  severity: string; // "warning" | "error" | "info"
  message: string;
  entityId?: string;
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
    // L'admin confirme ou annule des commandes sans que le mobile en soit averti.
    staleTime: SHARED_STATE_STALE_TIME,
    // Changer de filtre crée une nouvelle clé : sans ça la liste se vide et
    // affiche un squelette à chaque bascule d'onglet.
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery<Order>({
    queryKey: ["order", id],
    // Cf. useOrders : état partagé avec l'admin.
    staleTime: SHARED_STATE_STALE_TIME,
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
    onSuccess: (order) => {
      // La réponse de création contient déjà la commande complète : on amorce
      // le cache de détail pour qu'une navigation immédiate vers
      // /orders/<id> affiche le contenu au lieu de « Commande introuvable »
      // le temps du premier GET.
      qc.setQueryData(["order", order.id], order);
      invalidateAfter(qc, "order");
    },
  });
}

/**
 * Applique au cache de détail la commande renvoyée par une mutation.
 *
 * ⚠️ `PATCH /orders/:id/cancel` et `/status` répondent avec la ligne Prisma
 * NUE : `prisma.order.update()` sans `include`, donc **sans `items`**. Écraser
 * l'entrée du cache avec cet objet fait disparaître les articles, et l'écran de
 * détail plante sur `order.items.map()`. On fusionne donc les champs mis à jour
 * en conservant les relations déjà connues.
 */
function mergeOrderIntoCache(qc: QueryClient, id: string, updated: Order | undefined): void {
  if (!updated) return;
  qc.setQueryData<Order>(["order", id], (prev) =>
    prev
      ? { ...prev, ...updated, items: prev.items, user: prev.user ?? updated.user }
      : // Sans commande en cache, on ne peut rien reconstituer : laisser vide
        // force un vrai GET plutôt que de stocker un objet incomplet.
        undefined,
  );
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
    onSuccess: (order, { id }) => {
      mergeOrderIntoCache(qc, id, order);
      invalidateAfter(qc, "order");
    },
  });
}

// ─── Hooks: Products ─────────────────────────────────────────────

export function useProducts() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await apiFetch<ApiListRes<Product>>("/products?limit=100");
      return res.data;
    },
    // Garde `enabled` comme tous les autres hooks : sans elle, le vidage du
    // cache à la déconnexion relançait aussitôt un GET /products sans jeton,
    // qui repartait en 401.
    enabled: !!token,
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

/**
 * Config publique du Pack Sérénité (EP-SUB-CFG01).
 * Le mobile affiche prix/composition/engagement depuis cette réponse — zéro valeur en dur (AC-F6-01).
 */
export function useSubscriptionConfig() {
  const token = useAuthStore((s) => s.accessToken);
  const isClient = useIsClient();
  return useQuery<SubscriptionConfig>({
    queryKey: ["subscription-config"],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<SubscriptionConfig>>("/subscriptions/config");
      return res.data;
    },
    enabled: !!token && isClient,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Souscrire au Pack Sérénité (EP-SUB01).
 * Le body est optionnel (le serveur dérive la composition depuis SubscriptionConfig).
 */
export function useSubscribeToPackSerenite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch<ApiRes<Subscription>>("/subscriptions", {
        method: "POST",
        body: JSON.stringify({}),
      });
      return res.data;
    },
    onSuccess: () => invalidateAfter(qc, "subscription"),
  });
}

export function usePauseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/subscriptions/me/pause", { method: "PATCH" }),
    onSuccess: () => invalidateAfter(qc, "subscription"),
  });
}

export function useResumeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/subscriptions/me/resume", { method: "PATCH" }),
    onSuccess: () => invalidateAfter(qc, "subscription"),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/subscriptions/me/cancel", { method: "PATCH" }),
    onSuccess: () => invalidateAfter(qc, "subscription"),
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
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => invalidateAfter(qc, "notification"),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => invalidateAfter(qc, "notification"),
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
    // Une tournée replanifiée depuis l'admin doit apparaître au retour dans
    // l'app, pas deux minutes plus tard.
    staleTime: SHARED_STATE_STALE_TIME,
  });
}

/**
 * Corps de PATCH /deliveries/stops/:id/complete.
 *
 * Les quatre champs de bon de livraison sont désormais acceptés ET persistés
 * par l'API (`completeStopSchema`, colonnes dédiées).
 *
 * On n'utilise volontairement PAS la colonne `signatureUrl` (VarChar(500) +
 * `z.string().url().max(500)`) : une signature ne tient pas en 500 caractères,
 * l'envoyer là renverrait un 400. `signatureDataUrl` est plafonné à 256 Ko
 * côté serveur — largement au-dessus des ~6 Ko d'une signature SVG.
 */
export interface CompleteStopInput {
  setsDelivered: number;
  dirtyPickedUp?: number;
  /** Data URL SVG de la signature manuscrite (quelques Ko). */
  signatureDataUrl?: string;
  /** Nom de la personne qui a signé. */
  signataireNom?: string;
  /** false = le client émet des réserves sur la livraison. */
  conforme?: boolean;
  /** Détail des réserves, saisi seulement si `conforme === false`. */
  reserves?: string;
}

/**
 * Valide un arrêt de tournée.
 *
 * Le backend porte la signature sur `PATCH /deliveries/stops/:id/complete` —
 * la route historique, enrichie des champs du bon de livraison
 * (`completeStopSchema`). Il n'existe pas de route `PATCH /stops/:id` : la
 * tentative-puis-repli qui existait ici ne faisait que payer un 404 par session.
 *
 * `ALREADY_COMPLETED` est traité comme un SUCCÈS et non comme une erreur. C'est
 * l'échec typique du terrain : la requête aboutit, la réponse se perd (tunnel,
 * ascenseur), le livreur réessaie. Lui afficher « Erreur de validation » pour
 * une livraison bel et bien enregistrée le pousse à recommencer en boucle.
 * `null` signale « déjà validé, rien de neuf à appliquer ».
 */
async function patchStop(stopId: string, data: CompleteStopInput): Promise<DeliveryStop | null> {
  try {
    const res = await apiFetch<ApiRes<DeliveryStop>>(`/deliveries/stops/${stopId}/complete`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return res.data;
  } catch (e) {
    if (e instanceof ApiError && e.code === "ALREADY_COMPLETED") return null;
    throw e;
  }
}

export function useCompleteStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stopId, data }: { stopId: string; data: CompleteStopInput }) =>
      patchStop(stopId, data),
    // Valider un arrêt bouge la tournée, la commande liée, les stocks, la
    // rotation du client et les compteurs admin — pas seulement la tournée.
    onSuccess: () => invalidateAfter(qc, "delivery"),
  });
}

// ─── Hooks: Rotations (client) ───────────────────────────────────

/**
 * Une rotation = le cycle « linge propre livré → linge sale repris ».
 * Contrat visé : GET /rotations?mine=1. La route n'existe pas encore côté API
 * (livraison backend en cours) : `useMyRotations` renvoie donc `null` sur 404,
 * et l'écran d'accueil masque simplement la carte.
 */
/** Miroir de l'enum Prisma RotationStatus (packages/database/prisma/schema.prisma). */
export type RotationStatus = "PLANIFIEE" | "LIVREE" | "REPRISE" | "EN_RETARD" | "ANNULEE";

/** Statuts qui clôturent une rotation : le linge est rentré ou la rotation annulée. */
export const ROTATION_TERMINAL: RotationStatus[] = ["REPRISE", "ANNULEE"];

export interface RotationLine {
  designation: string;
  qtyLivree: number;
  /** null = reprise pas encore saisie ; 0 = rien n'est revenu. */
  qtyReprise?: number | null;
}

export interface Rotation {
  id: string;
  /** Typé large : le serveur peut ajouter un statut sans casser le mobile. */
  status: RotationStatus | string;
  dateLivraison: string;
  /** Requis côté base, toléré absent tant que le DTO n'est pas figé. */
  dateReprisePrevue: string | null;
  /** > 0 = la reprise est en retard. Calculé côté mobile s'il est absent. */
  joursDeRetard?: number | null;
  lignes: RotationLine[];
}

export function useMyRotations() {
  const token = useAuthStore((s) => s.accessToken);
  const isClient = useIsClient();
  return useQuery<Rotation[] | null>({
    queryKey: ["rotations-me"],
    queryFn: async () => {
      try {
        const res = await apiFetch<ApiListRes<Rotation>>("/rotations?mine=1");
        return res.data;
      } catch (e) {
        // 404 : route pas encore déployée. 403 : rôle sans rotations.
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
        throw e;
      }
    },
    enabled: !!token && isClient,
    // Inutile de réessayer en boucle tant que la route n'existe pas.
    retry: false,
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
    onSuccess: () => invalidateAfter(qc, "delivery"),
  });
}

// ─── Hooks: Admin order status ───────────────────────────────────

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      // Le schéma /orders/:id/status attend `raison` (français), pas `reason`.
      // NB: /orders/:id/cancel attend bien `reason` (cf. useCancelOrder).
      const res = await apiFetch<ApiRes<Order>>(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, raison: reason }),
      });
      return res.data;
    },
    onSuccess: (order, { id }) => {
      mergeOrderIntoCache(qc, id, order);
      invalidateAfter(qc, "order");
    },
  });
}

// ─── Hooks: Clients (admin only) ─────────────────────────────────

export function useClients(search?: string) {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", "50");
  return useQuery<ClientListItem[]>({
    queryKey: ["clients", search],
    queryFn: async () => {
      const res = await apiFetch<ApiListRes<ClientListItem>>(`/clients?${params.toString()}`);
      return res.data;
    },
    enabled: !!token && (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN"),
    // La recherche re-clé la requête à chaque frappe débouncée : on conserve
    // les résultats précédents pour éviter le clignotement.
    placeholderData: keepPreviousData,
  });
}

export function useClient(id: string) {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery<ClientDetail>({
    queryKey: ["client", id],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<ClientDetail>>(`/clients/${id}`);
      return res.data;
    },
    enabled: !!token && !!id && (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN"),
  });
}

/** Corps de POST /clients — miroir strict du contrat d'API. */
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
  /** true → crée un accès applicatif et renvoie un mot de passe temporaire */
  grantAppAccess?: boolean;
  /** true → passe outre la détection de doublon (409 CLIENT_DUPLICATE_PHONE) */
  force?: boolean;
}

export interface CreateClientResult {
  client: ClientDetail;
  temporaryPassword?: string;
}

/**
 * POST /clients — création d'un client depuis le terrain (admin).
 * Un 409 CLIENT_DUPLICATE_PHONE remonte tel quel : l'appelant décide s'il
 * ouvre la fiche existante ou s'il rejoue avec `force: true`.
 */
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation<CreateClientResult, ApiError, CreateClientInput>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiRes<CreateClientResult>>("/clients", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSuccess: async () => {
      // Surtout NE PAS amorcer ["client", id] avec cette réponse : `POST
      // /clients` renvoie 22 champs plats, sans `stocks` ni `orders`
      // (clients.service.ts), et la fiche fait `client.stocks.reduce()` dès le
      // premier rendu — l'écran plantait à chaque création de client. Le GET
      // qui suit ramène la fiche complète, et `detailState` affiche un
      // chargement en attendant, plus « introuvable ».
      await invalidateAfter(qc, "client");
    },
  });
}

// ─── Hooks: Stock operator (admin only) ──────────────────────────

export function useOperatorStock() {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery<OperatorStock[]>({
    queryKey: ["stock-operator"],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<OperatorStock[]>>("/stock/operator");
      return res.data;
    },
    enabled: !!token && (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN"),
  });
}

// ─── Hooks: Stock clients (admin only) ───────────────────────────

export function useClientStocks(search?: string) {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", "100");
  return useQuery<ClientStockRow[]>({
    queryKey: ["stock-clients", search],
    queryFn: async () => {
      const res = await apiFetch<ApiListRes<ClientStockRow>>(`/stock/clients?${params.toString()}`);
      return res.data;
    },
    enabled: !!token && (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN"),
    placeholderData: keepPreviousData,
  });
}

// ─── Hooks: Dashboard alerts (admin only) ────────────────────────

export function useDashboardAlerts() {
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery<DashboardAlert[]>({
    queryKey: ["dashboard-alerts"],
    queryFn: async () => {
      const res = await apiFetch<ApiRes<DashboardAlert[]>>("/dashboard/alerts");
      return res.data;
    },
    enabled: !!token && (role === "ROLE_ADMIN" || role === "ROLE_SUPER_ADMIN"),
    staleTime: 5 * 60 * 1000,
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
  if (typeof cents !== "number" || Number.isNaN(cents)) return "-";
  return (cents / 100).toFixed(2).replace(".", ",") + " \u20ac";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
