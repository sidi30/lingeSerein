"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { dayKeyFromISO, daysBetweenKeys, todayKey } from "@/lib/calendar";
import { invalidateAfter } from "./query";

/* ─── Contrat d'API (GET /rotations, GET /stock) ─── */

export const ROTATION_STATUSES = [
  "PLANIFIEE",
  "LIVREE",
  "REPRISE",
  "EN_RETARD",
  "ANNULEE",
] as const;
export type RotationStatus = (typeof ROTATION_STATUSES)[number];

export type RotationFormule = "PONCTUEL" | "ABONNEMENT";

export interface RotationLigne {
  id: string;
  productSlug: string;
  designation: string;
  qtyLivree: number;
  /**
   * `null` tant que RIEN n'a été repris — l'API distingue « pas encore saisi »
   * de « 0 repris ». Le champ était déclaré `number` : React n'affiche rien
   * pour `null`, et le compteur du détail sortait « / 4 » au lieu de « 0 / 4 ».
   * Passer par {@link qtyReprise} pour lire une quantité.
   */
  qtyReprise: number | null;
}

/** Quantité déjà reprise d'une ligne, `null` (jamais saisie) compris comme 0. */
export function qtyReprise(ligne: Pick<RotationLigne, "qtyReprise">): number {
  return ligne.qtyReprise ?? 0;
}

export interface RotationDTO {
  id: string;
  clientNom: string;
  clientAdresse: string | null;
  formule: RotationFormule;
  status: RotationStatus;
  dateLivraison: string;
  dateReprisePrevue: string | null;
  dateRepriseReelle: string | null;
  passage: number | null;
  lignes: RotationLigne[];
  joursDeRetard: number;
}

export interface StockItemDTO {
  productSlug: string;
  name: string;
  totalOwned: number;
  inCirculation: number;
  dirtyPending: number;
  retired: number;
  disponible: number;
}

/* ─── Dégradation propre quand la route n'existe pas encore ─── */

/**
 * Résultat d'une liste distante qui peut ne pas être déployée.
 *
 * Le module rotations arrive côté API après cet écran : tant que la route
 * répond 404, on affiche un bandeau explicite plutôt qu'une erreur rouge ou,
 * pire, un écran blanc. `available: false` veut dire « la route n'existe pas »,
 * ce qui n'est pas la même chose qu'une liste vide (`available: true, data: []`).
 */
export interface RemoteList<T> {
  available: boolean;
  data: T[];
}

const MISSING_ROUTE_STATUSES = new Set([404, 501]);

async function fetchList<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<RemoteList<T>> {
  try {
    const envelope = await api.getRaw<{ data?: T[] }>(endpoint, params);
    return { available: true, data: envelope?.data ?? [] };
  } catch (err) {
    if (err instanceof ApiError && MISSING_ROUTE_STATUSES.has(err.status)) {
      return { available: false, data: [] };
    }
    throw err;
  }
}

/** Repli stable en référence : recréer l'objet à chaque rendu invaliderait
 *  inutilement les `useMemo` des écrans qui en dépendent. */
const EMPTY_LIST: RemoteList<never> = { available: true, data: [] };

/* ─── Rotations ─── */

export interface RotationsFilter {
  from?: string;
  to?: string;
  status?: RotationStatus | "";
  /**
   * Ne remonter que les rotations échues. À utiliser SEUL : côté API, ce filtre
   * réécrit la contrainte de date, donc le combiner avec `from`/`to` annulerait
   * silencieusement la fenêtre demandée.
   */
  enRetard?: boolean;
}

export const rotationsKey = (filter: RotationsFilter) =>
  [
    "rotations",
    filter.from ?? "",
    filter.to ?? "",
    filter.status ?? "",
    filter.enRetard ? "retard" : "",
  ] as const;

/** Plafond du schéma de l'API. Le défaut (50) tronquerait un mois chargé. */
const ROTATIONS_PAGE_LIMIT = 200;

export function useRotations(filter: RotationsFilter) {
  const query = useQuery({
    queryKey: rotationsKey(filter),
    queryFn: () =>
      fetchList<RotationDTO>("/rotations", {
        from: filter.from,
        to: filter.to,
        status: filter.status || undefined,
        enRetard: filter.enRetard || undefined,
        limit: ROTATIONS_PAGE_LIMIT,
      }),
    // Une route absente ne se répare pas en réessayant : 3 tentatives ne
    // feraient que retarder l'affichage du bandeau d'indisponibilité.
    retry: false,
  });

  const result = query.data ?? EMPTY_LIST;
  return {
    rotations: result.data,
    available: result.available,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

export interface RepriseLigneInput {
  id: string;
  qtyReprise: number;
}

/** Enregistre la reprise (linge revenu) d'une rotation. */
export function useSaveReprise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      lignes,
      dateRepriseReelle,
    }: {
      id: string;
      lignes: RepriseLigneInput[];
      dateRepriseReelle?: string;
    }) => api.patch(`/rotations/${id}/reprise`, { lignes, dateRepriseReelle }),
    onSuccess: () => {
      void invalidateAfter(queryClient, "rotation");
    },
  });
}

export function useUpdateRotationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RotationStatus }) =>
      api.patch(`/rotations/${id}/status`, { status }),
    onSuccess: () => {
      void invalidateAfter(queryClient, "rotation");
    },
  });
}

/* ─── Stock par article ─── */

export const stockBySlugKey = ["stock", "by-slug"] as const;

export function useStockBySlug() {
  const query = useQuery({
    queryKey: stockBySlugKey,
    queryFn: () => fetchList<StockItemDTO>("/stock"),
    retry: false,
  });

  const result = query.data ?? EMPTY_LIST;
  return {
    items: result.data,
    available: result.available,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

/**
 * Part du parc en dessous de laquelle un article est signalé.
 *
 * Le seuil est relatif au parc possédé : 3 kits disponibles sur 5 est
 * confortable, 3 sur 200 est une rupture. Le minimum de 1 évite de ne jamais
 * alerter sur les tout petits parcs (20 % de 3 arrondit à 1).
 */
export const LOW_STOCK_RATIO = 0.2;

export function lowStockThreshold(item: StockItemDTO): number {
  return Math.max(1, Math.round(item.totalOwned * LOW_STOCK_RATIO));
}

export function isLowStock(item: StockItemDTO): boolean {
  // Parc non renseigné : rien à dire, ce n'est pas une alerte mais une saisie
  // qui manque.
  if (item.totalOwned <= 0) return false;
  return item.disponible <= lowStockThreshold(item);
}

export function useUpdateStockOwned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productSlug, totalOwned }: { productSlug: string; totalOwned: number }) =>
      // `/stock/item/:slug` et non `/stock/:slug` : la route est volontairement
      // préfixée pour ne pas capter « me », « clients » ou « operator » comme
      // des identifiants de produit.
      api.patch(`/stock/item/${productSlug}`, { totalOwned }),
    onSuccess: () => {
      void invalidateAfter(queryClient, "stock");
    },
  });
}

/* ─── Présentation ─── */

export const ROTATION_STATUS_LABELS: Record<RotationStatus, string> = {
  PLANIFIEE: "Planifiée",
  LIVREE: "Chez le client",
  REPRISE: "Reprise",
  EN_RETARD: "En retard",
  ANNULEE: "Annulée",
};

export const ROTATION_STATUS_BADGE: Record<
  RotationStatus,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  PLANIFIEE: "neutral",
  LIVREE: "info",
  REPRISE: "success",
  EN_RETARD: "danger",
  ANNULEE: "neutral",
};

export const FORMULE_LABELS: Record<RotationFormule, string> = {
  PONCTUEL: "Ponctuel",
  ABONNEMENT: "Pack Sérénité",
};

/* ─── Événements de calendrier ─── */

export type RotationEventKind = "livraison" | "reprise";

/**
 * Une rotation occupe DEUX cases du calendrier : le jour où le linge part
 * et le jour où il doit revenir. C'est la reprise que le propriétaire vient
 * chercher ici, la livraison sert de repère.
 */
export interface RotationEvent {
  key: string;
  kind: RotationEventKind;
  dayKey: string;
  rotation: RotationDTO;
  /** Reprise dépassée et pas encore enregistrée. */
  late: boolean;
  /** Jours de retard, 0 si à l'heure. */
  lateDays: number;
  /** Reprise effectivement enregistrée. */
  done: boolean;
}

/**
 * Le retard vient de l'API (`joursDeRetard`) quand elle le calcule ; à défaut
 * on le recalcule depuis la date de reprise prévue pour que l'écran reste juste
 * même si le champ n'est pas encore alimenté.
 */
export function lateDaysOf(rotation: RotationDTO): number {
  if (rotation.status === "REPRISE" || rotation.status === "ANNULEE") return 0;
  if (rotation.joursDeRetard > 0) return rotation.joursDeRetard;
  if (!rotation.dateReprisePrevue || rotation.dateRepriseReelle) return 0;
  const diff = daysBetweenKeys(dayKeyFromISO(rotation.dateReprisePrevue), todayKey());
  return diff > 0 ? diff : 0;
}

export function rotationEvents(rotations: RotationDTO[]): RotationEvent[] {
  const events: RotationEvent[] = [];

  for (const rotation of rotations) {
    const lateDays = lateDaysOf(rotation);

    if (rotation.dateLivraison) {
      events.push({
        key: `${rotation.id}-livraison`,
        kind: "livraison",
        dayKey: dayKeyFromISO(rotation.dateLivraison),
        rotation,
        late: false,
        lateDays: 0,
        done: rotation.status !== "PLANIFIEE" && rotation.status !== "ANNULEE",
      });
    }

    // La reprise s'affiche à sa date réelle une fois faite, sinon à la date prévue.
    const repriseDate = rotation.dateRepriseReelle ?? rotation.dateReprisePrevue;
    if (repriseDate) {
      events.push({
        key: `${rotation.id}-reprise`,
        kind: "reprise",
        dayKey: dayKeyFromISO(repriseDate),
        rotation,
        late: lateDays > 0,
        lateDays,
        done: Boolean(rotation.dateRepriseReelle) || rotation.status === "REPRISE",
      });
    }
  }

  return events;
}

export function groupEventsByDay(events: RotationEvent[]): Map<string, RotationEvent[]> {
  const map = new Map<string, RotationEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.dayKey);
    if (bucket) bucket.push(event);
    else map.set(event.dayKey, [event]);
  }
  // Les reprises d'abord dans chaque journée : c'est l'action à faire, la
  // livraison n'est qu'un repère.
  for (const bucket of map.values()) {
    bucket.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "reprise" ? -1 : 1));
  }
  return map;
}

/** Reste à reprendre sur une ligne (livré − déjà repris), jamais négatif. */
export function remainingQty(ligne: RotationLigne): number {
  return Math.max(ligne.qtyLivree - qtyReprise(ligne), 0);
}
