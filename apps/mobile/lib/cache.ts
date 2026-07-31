/**
 * Conventions de cache react-query — logique pure, sans React Native.
 *
 * Séparée de `query.ts` (qui branche `AppState` sur le focusManager) pour
 * rester testable en `node --test` : ces deux règles sont exactement celles
 * qui, mal appliquées, affichaient « introuvable » après une action ou
 * laissaient un écran sur des données périmées.
 */

import type { QueryClient } from "@tanstack/react-query";

/**
 * Code HTTP porté par une ApiError, lu en canard plutôt qu'importé : ce module
 * est utilisé par `api.ts`, l'importer en retour créerait un cycle.
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
 */
export const KEY = {
  orders: "orders",
  order: "order",
  clients: "clients",
  client: "client",
  products: "products",
  stockMe: "stock-me",
  stockOperator: "stock-operator",
  stockClients: "stock-clients",
  subscriptionMe: "subscription-me",
  subscriptionConfig: "subscription-config",
  notifications: "notifications",
  profile: "profile",
  todayRound: "today-round",
  upcomingRounds: "upcoming-rounds",
  rotationsMe: "rotations-me",
  dashboardKpis: "dashboard-kpis",
  dashboardAlerts: "dashboard-alerts",
} as const;

/** Domaine métier touché par une écriture. */
export type MutationScope = "order" | "delivery" | "client" | "subscription" | "notification";

/**
 * Familles à rafraîchir après chaque type d'écriture.
 *
 * Volontairement large : invalider une requête non montée ne coûte qu'un
 * marquage « périmée » (aucune requête réseau), alors qu'une famille oubliée
 * laisse un écran mentir à l'utilisateur. En cas de doute, ajouter la clé.
 *
 * `notifications` figure dans presque tous les domaines : le serveur crée une
 * notification à la volée (ORDER_CREATED, ROTATION_*…) et le badge de l'onglet
 * doit bouger tout de suite, sans attendre le prochain cycle de polling (60 s).
 */
export const AFFECTED: Record<MutationScope, readonly string[]> = {
  // `client` / `clients` figurent dans les trois domaines ci-dessous : la fiche
  // client embarque ses stocks, ses 50 dernières commandes et ses agrégats
  // (`ordersCount`, `revenueCents`, `lastOrderAt`), et la liste embarque les
  // stocks. Les omettre laissait la fiche afficher les chiffres d'avant la
  // livraison — sans que rien ne signale l'écart.
  order: [
    KEY.orders,
    KEY.order,
    KEY.clients,
    KEY.client,
    KEY.stockMe,
    KEY.rotationsMe,
    KEY.notifications,
    KEY.dashboardKpis,
    KEY.dashboardAlerts,
  ],
  delivery: [
    KEY.todayRound,
    // Valider un arrêt fait avancer la tournée du jour, qui figure aussi dans
    // la fenêtre glissante : sans cette clé, la section « à venir » gardait
    // l'état d'avant la livraison.
    KEY.upcomingRounds,
    KEY.orders,
    KEY.order,
    KEY.clients,
    KEY.client,
    KEY.stockMe,
    KEY.stockOperator,
    KEY.stockClients,
    KEY.rotationsMe,
    KEY.notifications,
    KEY.dashboardKpis,
    KEY.dashboardAlerts,
  ],
  // `profile` en fait partie depuis que le client modifie lui-même ses
  // coordonnées (`PATCH /auth/me`) : sans elle, l'écran de profil continuait
  // d'afficher l'ancienne adresse après un enregistrement réussi.
  client: [
    KEY.clients,
    KEY.client,
    KEY.profile,
    KEY.stockClients,
    KEY.notifications,
    KEY.dashboardKpis,
  ],
  subscription: [
    KEY.subscriptionMe,
    KEY.subscriptionConfig,
    KEY.clients,
    KEY.client,
    KEY.profile,
    KEY.notifications,
    KEY.dashboardKpis,
  ],
  notification: [KEY.notifications],
};

/**
 * Familles qu'AUCUNE écriture mobile ne touche.
 *
 * Le catalogue produits est en lecture seule ici : il ne change que depuis
 * l'admin. Le déclarer explicitement plutôt que de le laisser tomber entre les
 * mailles — le test de couverture peut alors exiger que toute autre clé soit
 * rattachée à un domaine, et une clé réellement oubliée ne passe plus.
 * Sa fraîcheur repose sur `staleTime` et le retour au premier plan.
 */
export const READ_ONLY_KEYS: readonly string[] = [KEY.products];

/**
 * Marque périmées toutes les familles touchées par une écriture.
 *
 * Les requêtes montées se rafraîchissent en arrière-plan **en conservant leur
 * contenu actuel** : aucune liste ne se vide, aucun écran ne clignote pendant
 * le rechargement.
 */
export function affectedFamilies(scopes: readonly MutationScope[]): string[] {
  return [...new Set(scopes.flatMap((s) => AFFECTED[s]))];
}

export function invalidateAfter(qc: QueryClient, ...scopes: MutationScope[]): Promise<void> {
  // Renvoie une promesse plutôt que `void` : la plupart des appelants
  // l'ignorent (l'écran reste en place et se met à jour tout seul), mais celui
  // qui navigue juste après doit pouvoir attendre, sinon l'écran d'arrivée
  // repart de l'état d'avant l'action.
  return Promise.all(
    affectedFamilies(scopes).map((family) => qc.invalidateQueries({ queryKey: [family] })),
  ).then(() => undefined);
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

interface DetailQuery {
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
