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
