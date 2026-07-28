"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";

/**
 * Aperçu d'impact d'une suppression en cascade.
 *
 * Contrat : `GET /users/:id/deletion-preview` et
 * `GET /subscriptions/:id/deletion-preview`. Tous les champs sont optionnels
 * côté lecture : l'API peut être plus ancienne que cet écran, et un compteur
 * absent doit se lire « inconnu », jamais « zéro » — afficher zéro
 * ferait croire qu'il n'y a rien à supprimer.
 */
export interface DeletionPreviewDTO {
  quotes?: { draft?: number; other?: number };
  invoices?: { draft?: number; issued?: number };
  orders?: number;
  rotations?: { active?: number; closed?: number };
  subscription?: boolean;
  deliveryStops?: number;
  /** Faux quand une pièce comptable interdit la suppression pure. */
  canHardDelete?: boolean;
  blockingReason?: string;

  /* ─── Aperçu d'un ABONNEMENT (forme distincte côté API) ─── */

  /** Factures d'abonnement déjà émises. CONSERVÉES : jamais dans « sera supprimé ». */
  recurringInvoices?: number;
  /**
   * Engagement contractuel. Signalé, jamais bloquant : supprimer un abonnement
   * est un geste de gestion (doublon, erreur de saisie), pas une résiliation —
   * le blocage d'engagement vit sur `cancel`, où il a un sens contractuel.
   */
  engagement?: { committedUntil: string | null; active: boolean; joursRestants: number };
  canDelete?: boolean;
}

export interface DeletionPreviewState {
  preview: DeletionPreviewDTO | null;
  isLoading: boolean;
  /** L'API ne connaît pas encore la route : on dégrade, on ne bloque pas. */
  unavailable: boolean;
}

/**
 * Charge l'aperçu quand la modale s'ouvre (`enabled`), pas avant : un aperçu
 * par ligne de liste ferait autant de requêtes que de lignes affichées.
 */
export function useDeletionPreview(endpoint: string, enabled: boolean): DeletionPreviewState {
  const { data, isLoading, error } = useQuery({
    queryKey: ["deletion-preview", endpoint],
    queryFn: () => api.get<DeletionPreviewDTO>(endpoint),
    enabled,
    // Un 404 est une réponse définitive (route absente) : réessayer trois fois
    // ne fera qu'allonger l'attente devant une modale vide.
    retry: (_count, err) => !(err instanceof ApiError && err.status === 404),
    staleTime: 0,
  });

  return {
    preview: data ?? null,
    isLoading,
    unavailable: error instanceof ApiError && error.status === 404,
  };
}

/**
 * Raisons de refus des suppressions, alignées sur les règles que l'API applique
 * réellement. Elles vivent ici pour qu'une liste et une fiche ne puissent pas
 * expliquer la même règle avec deux phrases différentes.
 */
export const DELETE_BLOCKED = {
  /** `ORDER_DELETABLE = ["PENDING", "CANCELLED"]` (orders.service.ts). */
  order:
    "Une commande confirmée ou livrée est adossée à une tournée et à une facture : elle ne peut plus être supprimée. Annulez-la d'abord, la trace est conservée.",
  /** 422 `ROUND_HAS_COMPLETED_STOPS` (deliveries). */
  round:
    "Un arrêt de cette tournée est déjà livré : ses preuves de remise (signature, quantités) ne peuvent pas être effacées.",
} as const;

/** Une facture émise est une pièce comptable : sa conservation est légalement
 * obligatoire (art. L123-22 du code de commerce, 10 ans). L'UI doit donc
 * distinguer « rien à supprimer » de « interdit de supprimer ».
 *
 * L'ordre de lecture compte : `canHardDelete === false` est le verdict que
 * l'API rend elle-même, `invoices.issued` n'en est qu'un symptôme. Se fier au
 * seul compteur marche aujourd'hui, où la facture émise est le seul motif de
 * blocage — et se tairait le jour où un second motif apparaît côté serveur,
 * en laissant l'écran proposer une suppression que l'API refusera. */
export function hasIssuedInvoices(preview: DeletionPreviewDTO | null): boolean {
  if (preview?.canHardDelete === false) return true;
  return (preview?.invoices?.issued ?? 0) > 0;
}
