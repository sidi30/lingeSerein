"use client";

import { useEffect } from "react";

/**
 * Ramène la pagination dans les clous quand le nombre de pages diminue.
 *
 * Sans ça, supprimer le dernier élément d'une dernière page laissait
 * l'utilisateur devant une page vide : la liste avait bien été rechargée, mais
 * elle demandait toujours la page 4 d'un jeu qui n'en compte plus que 3. Le
 * symptôme se lit « la page ne s'actualise pas », alors que c'est le curseur de
 * pagination qui n'a pas suivi.
 *
 * `totalPages === 0` est ignoré : c'est aussi l'état d'un chargement en cours,
 * et remettre la page à 1 à chaque rafraîchissement annulerait la navigation de
 * l'utilisateur.
 */
export function useClampedPage(
  page: number,
  totalPages: number,
  setPage: (page: number) => void,
): void {
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);
}
