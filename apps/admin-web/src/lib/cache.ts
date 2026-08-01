/**
 * Conventions de cache react-query pour l'admin — logique pure, sans React.
 *
 * Séparée de `query.tsx` (qui porte le provider) pour rester testable en
 * `node --test` : les deux règles ci-dessous sont exactement celles qui, mal
 * appliquées, produisaient les symptômes rapportés par le propriétaire, et
 * elles méritent un test plutôt qu'une relecture.
 *
 * 1. **Écrans pas à jour après une action.** Chaque mutation invalidait « ses »
 *    clés au cas par cas, et en oubliait toujours (créer une commande touche
 *    aussi les KPI du tableau de bord, le stock, le badge de l'onglet et la
 *    fiche du client concerné). `invalidateAfter` centralise, par domaine,
 *    l'ensemble des familles impactées.
 *
 * 2. **« Introuvable » affiché à tort.** Les écrans de détail testaient
 *    `!isLoading && !data`, ce qui transforme un simple échec de
 *    rafraîchissement — fréquent juste après une mutation, quand plusieurs
 *    requêtes repartent en même temps — en « cet objet n'existe pas », alors
 *    que la donnée est encore en cache. `detailState` distingue les quatre
 *    situations réelles.
 */

import type { QueryClient } from "@tanstack/react-query";

/**
 * Code HTTP porté par une ApiError, lu en canard plutôt qu'importé : ce module
 * est chargé par des écrans qui importent aussi `api.ts`, et l'import croisé
 * n'apporte rien ici — seul le champ `status` nous intéresse.
 */
export function errorStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : 0;
}

// ─── Familles de clés ────────────────────────────────────────────

/**
 * Première position d'une clé = la famille. react-query invalide par préfixe :
 * invalider `["order"]` touche donc `["order", <n'importe quel id>]`, ce qui
 * évite d'avoir à connaître l'id concerné au moment de l'écriture.
 *
 * Toute nouvelle `queryKey` doit être déclarée ici, sinon elle sera
 * silencieusement absente des invalidations.
 */
export const KEY = {
  clients: "clients",
  client: "client",
  clientsForAttach: "clients-for-attach",
  clientsForOrder: "clients-for-order",
  quotes: "quotes",
  quote: "quote",
  orders: "orders",
  order: "order",
  ordersBadge: "orders-badge",
  invoices: "invoices",
  invoice: "invoice",
  users: "users",
  user: "user",
  usersSearch: "users-search",
  subscriptions: "subscriptions",
  subscriptionConfig: "subscription-config-admin",
  products: "products-v2",
  product: "product",
  productsForOrder: "products-for-order",
  productsForConvert: "products-for-convert",
  stock: "stock",
  stockThresholds: "stock-thresholds",
  zones: "zones",
  zonesSelect: "zones-select",
  settings: "settings",
  operator: "operator",
  operatorBl: "operator-bl",
  deliveries: "deliveries",
  rotations: "rotations",
  /**
   * Propositions de passage groupé, panneau du Planning.
   *
   * La seule famille du projet qui était utilisée SANS être déclarée ici : elle
   * n'appartenait donc à aucun domaine et n'était jamais invalidée. Annuler une
   * tournée supprime bien les propositions côté serveur, mais le panneau —
   * affiché sur le MÊME écran, juste au-dessus du calendrier — continuait de
   * lister les clients intéressés. L'exploitant rappelait un client pour une
   * offre qui n'existait plus.
   */
  passages: "passages",
  dashboard: "dashboard",
  notifications: "notifications",
  deletionPreview: "deletion-preview",
} as const;

/** Domaine métier touché par une écriture. */
export type MutationScope =
  | "quote"
  | "order"
  | "invoice"
  | "client"
  | "user"
  | "subscription"
  | "product"
  | "stock"
  | "delivery"
  | "rotation"
  | "settings"
  | "notification";

/**
 * Familles à rafraîchir après chaque type d'écriture.
 *
 * Volontairement large : invalider une requête non montée ne coûte qu'un
 * marquage « périmée » (aucune requête réseau), alors qu'une famille oubliée
 * laisse un écran mentir à l'utilisateur. En cas de doute, ajouter la clé.
 *
 * `dashboard` et `notifications` figurent dans presque tous les domaines : les
 * KPI et le badge de section sont recalculés par le serveur à chaque écriture,
 * et doivent bouger tout de suite plutôt qu'au prochain cycle de polling (20 s).
 * `deletion-preview` est invalidé partout : un aperçu d'impact affiché après
 * une écriture doit compter l'état réel, pas celui d'avant.
 *
 * Le domaine `settings` porte une correction précise : la même ressource
 * `/settings/zones` est mise en cache sous trois clés distinctes selon l'écran
 * (`zones`, `settings`, `zones-select`), et l'opérateur sous deux (`operator`,
 * `operator-bl`). Créer une zone dans Réglages n'en rafraîchissait qu'une.
 */
export const AFFECTED: Record<MutationScope, readonly string[]> = {
  quote: [
    KEY.quotes,
    KEY.quote,
    KEY.clients,
    KEY.client,
    KEY.orders,
    KEY.order,
    KEY.ordersBadge,
    KEY.invoices,
    KEY.invoice,
    KEY.stock,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  order: [
    KEY.orders,
    KEY.order,
    KEY.ordersBadge,
    KEY.quotes,
    KEY.quote,
    KEY.invoices,
    KEY.invoice,
    KEY.clients,
    KEY.client,
    KEY.deliveries,
    KEY.rotations,
    KEY.passages,
    KEY.stock,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  invoice: [
    KEY.invoices,
    KEY.invoice,
    KEY.orders,
    KEY.order,
    KEY.clients,
    KEY.client,
    KEY.subscriptions,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  client: [
    KEY.clients,
    KEY.client,
    KEY.clientsForAttach,
    KEY.clientsForOrder,
    KEY.usersSearch,
    KEY.users,
    KEY.user,
    KEY.subscriptions,
    KEY.stock,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  user: [
    KEY.users,
    KEY.user,
    KEY.usersSearch,
    KEY.clients,
    KEY.client,
    KEY.clientsForAttach,
    KEY.clientsForOrder,
    KEY.deliveries,
    KEY.rotations,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  subscription: [
    KEY.subscriptions,
    KEY.subscriptionConfig,
    KEY.clients,
    KEY.client,
    KEY.invoices,
    KEY.invoice,
    KEY.rotations,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  product: [
    KEY.products,
    KEY.product,
    KEY.productsForOrder,
    KEY.productsForConvert,
    KEY.stock,
    KEY.stockThresholds,
    KEY.dashboard,
    KEY.notifications,
  ],
  stock: [
    KEY.stock,
    KEY.stockThresholds,
    KEY.products,
    KEY.product,
    KEY.dashboard,
    KEY.notifications,
  ],
  delivery: [
    KEY.deliveries,
    KEY.rotations,
    KEY.passages,
    KEY.orders,
    KEY.order,
    KEY.ordersBadge,
    KEY.stock,
    KEY.clients,
    KEY.client,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  rotation: [
    KEY.rotations,
    KEY.deliveries,
    KEY.subscriptions,
    KEY.clients,
    KEY.client,
    KEY.stock,
    KEY.dashboard,
    KEY.notifications,
    KEY.deletionPreview,
  ],
  settings: [
    KEY.settings,
    KEY.zones,
    KEY.zonesSelect,
    KEY.operator,
    KEY.operatorBl,
    KEY.stockThresholds,
    KEY.subscriptionConfig,
    KEY.products,
    KEY.productsForOrder,
    KEY.productsForConvert,
  ],
  notification: [KEY.notifications],
};

/** Familles impactées par une écriture, dédoublonnées. */
export function affectedFamilies(scopes: readonly MutationScope[]): string[] {
  return [...new Set(scopes.flatMap((s) => AFFECTED[s]))];
}

/**
 * Marque périmées toutes les familles touchées par une écriture, et attend que
 * les requêtes **actuellement affichées** soient rechargées.
 *
 * L'attente est ce qui rend l'appel utile avant une navigation : sans elle, un
 * `router.push()` enchaîné arrive sur une page qui affiche encore l'ancien
 * état. Les requêtes non montées sont seulement marquées périmées (aucune
 * requête réseau), et les montées se rafraîchissent en conservant leur contenu
 * actuel : aucune liste ne se vide, aucun écran ne clignote.
 */
export async function invalidateAfter(qc: QueryClient, ...scopes: MutationScope[]): Promise<void> {
  await Promise.all(
    affectedFamilies(scopes).map((family) => qc.invalidateQueries({ queryKey: [family] })),
  );
}

// ─── État d'un écran de détail ───────────────────────────────────

export type DetailState =
  /** Donnée disponible (éventuellement en cours de rafraîchissement). */
  | "ready"
  /** Premier chargement, ou requête en attente d'authentification. */
  | "loading"
  /** L'objet n'existe pas / plus, ou n'est pas accessible (404 · 403). */
  | "missing"
  /** Injoignable : réseau, serveur. La donnée existe peut-être toujours. */
  | "unavailable";

export interface DetailQuery {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

/**
 * Traduit une requête de détail en état affichable.
 *
 * L'ordre des tests porte toute la logique :
 * - une donnée en cache l'emporte **toujours** sur une erreur de
 *   rafraîchissement — on préfère un contenu légèrement périmé à un faux
 *   « introuvable » ;
 * - une requête désactivée (`enabled: false`, le temps que le token soit
 *   rechargé) est `isPending` sans être `isFetching` : c'est un chargement, pas
 *   une absence ;
 * - seul un 404/403 autorise à dire « n'existe pas » ; toute autre erreur est
 *   un problème de liaison, et doit se présenter comme tel.
 */
export function detailState(q: DetailQuery, hasId: boolean): DetailState {
  if (q.data != null) return "ready";
  if (!hasId) return "missing";
  if (q.isPending || q.isFetching) return "loading";
  if (q.isError) {
    const status = errorStatus(q.error);
    return status === 404 || status === 403 ? "missing" : "unavailable";
  }
  return "missing";
}
