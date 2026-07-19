"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Sections portant un badge. Doit rester aligné sur NOTIFICATION_SECTIONS de l'API. */
export const NOTIFICATION_SECTIONS = ["devis", "commandes", "utilisateurs", "stock"] as const;
export type NotificationSection = (typeof NOTIFICATION_SECTIONS)[number];

export type UnreadCounts = Record<NotificationSection, number>;

const EMPTY: UnreadCounts = { devis: 0, commandes: 0, utilisateurs: 0, stock: 0 };

/** Chemin de la section correspondant à une route, ou null si non concernée. */
export function sectionForPathname(pathname: string): NotificationSection | null {
  if (pathname.startsWith("/devis")) return "devis";
  if (pathname.startsWith("/commandes")) return "commandes";
  if (pathname.startsWith("/utilisateurs")) return "utilisateurs";
  if (pathname.startsWith("/stock")) return "stock";
  return null;
}

export const unreadCountsKey = ["notifications", "unread-counts"] as const;

/**
 * Compteurs de non-lus, en quasi temps réel.
 *
 * `refetchInterval` à 20s plutôt qu'un flux SSE : derrière Traefik, une
 * connexion longue durée ajoute des reconnexions à gérer et une surface de
 * panne, pour un gain de latence sans intérêt ici. `refetchOnWindowFocus`
 * rattrape l'essentiel — revenir sur l'onglet rafraîchit immédiatement.
 */
export function useUnreadCounts() {
  const { data } = useQuery({
    queryKey: unreadCountsKey,
    queryFn: () => api.get<UnreadCounts>("/notifications/unread-counts"),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  return data ?? EMPTY;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Métadonnées libres côté API. `href` est le lien profond vers l'objet concerné. */
  data: { href?: string; [k: string]: unknown };
  readAt: string | null;
  createdAt: string;
}

export const notificationsListKey = ["notifications", "list"] as const;

/**
 * Liste du panneau de la cloche. Volontairement courte (20) : c'est un aperçu
 * des dernières notifications, pas un historique complet.
 * Ne fetch QUE si le panneau est ouvert — inutile de charger la liste à chaque
 * page pour un panneau que l'admin n'ouvrira peut-être jamais.
 */
/** Enveloppe renvoyée par GET /notifications (getRaw ne déballe pas `data`). */
interface NotificationsEnvelope {
  data: NotificationDTO[];
  unreadCount: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function useNotificationsList(enabled: boolean) {
  return useQuery({
    queryKey: notificationsListKey,
    queryFn: () => api.getRaw<NotificationsEnvelope>("/notifications", { page: 1, limit: 20 }),
    enabled,
    staleTime: 10_000,
  });
}

/** Marque UNE notification comme lue, et rafraîchit les badges en conséquence. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsListKey });
      queryClient.invalidateQueries({ queryKey: unreadCountsKey });
    },
  });
}

/** Marque TOUTES les notifications comme lues (vide aussi tous les badges). */
export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch("/notifications/read-all", {}),
    onSuccess: () => {
      queryClient.setQueryData<UnreadCounts>(unreadCountsKey, EMPTY);
      queryClient.invalidateQueries({ queryKey: notificationsListKey });
    },
  });
}

/**
 * Ancienneté en français, format court ("il y a 5 min").
 * Pas d'Intl.RelativeTimeFormat : l'ICU de l'image Node de prod n'est pas
 * garanti complet, et le rendu resterait à formuler à la main de toute façon.
 */
export function formatRelativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * Marque une section comme lue (ouvrir la section vide son badge, comme un
 * dossier de boîte mail). Met à jour le cache local immédiatement pour que le
 * badge disparaisse sans attendre l'aller-retour réseau.
 */
export function useMarkSectionRead() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (section: NotificationSection) =>
      api.patch(`/notifications/sections/${section}/read`, {}),
    onSuccess: (_data, section) => {
      queryClient.setQueryData<UnreadCounts>(unreadCountsKey, (prev) =>
        prev ? { ...prev, [section]: 0 } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    },
    // Échec silencieux assumé : ne pas polluer l'écran d'un toast d'erreur
    // parce qu'un badge n'a pas pu être remis à zéro. Le prochain polling
    // réaffichera simplement le compteur.
  });

  return useCallback(
    (section: NotificationSection) => mutation.mutate(section),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutation.mutate],
  );
}
