/**
 * Conventions de cache react-query.
 *
 * Deux problèmes récurrents sont traités ici, une fois pour toutes :
 *
 * 1. **Écrans pas à jour après une action.** Chaque mutation invalidait « ses »
 *    clés au cas par cas, et en oubliait toujours (une commande touche aussi
 *    les KPI, le stock et les notifications que le serveur vient de créer).
 *    `invalidateAfter` centralise, par domaine, l'ensemble des familles
 *    impactées.
 *
 * 2. **« Introuvable » affiché à tort.** Les écrans de détail testaient
 *    `isError || (!isLoading && !data)`, ce qui transforme un simple échec de
 *    rafraîchissement réseau — fréquent en mobile — en « cet objet n'existe
 *    pas », alors que la donnée est encore en cache. `detailState` distingue
 *    les quatre situations réelles.
 */

import { AppState, Platform } from "react-native";
import { focusManager } from "@tanstack/react-query";

// ─── Retour au premier plan ──────────────────────────────────────

/**
 * react-query se cale par défaut sur `window.focus`, qui n'existe pas en React
 * Native : revenir dans l'app ne déclenchait donc aucun rafraîchissement, et
 * l'utilisateur pouvait rester jusqu'à 60 s (le cycle de polling) devant des
 * données périmées.
 *
 * On branche `AppState` — API du cœur de React Native, aucun module natif
 * ajouté. Seules les requêtes réellement périmées (`staleTime`) sont
 * rechargées, et toujours en arrière-plan : l'écran ne se vide pas.
 *
 * À appeler une seule fois, au montage de l'app.
 */
export function setUpAppStateRefetch(): () => void {
  if (Platform.OS === "web") return () => {};

  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (status) => {
      handleFocus(status === "active");
    });
    return () => sub.remove();
  });

  return () => focusManager.setEventListener(() => () => {});
}

export {
  KEY,
  AFFECTED,
  affectedFamilies,
  invalidateAfter,
  detailState,
  errorStatus,
} from "./cache";
export type { MutationScope, DetailState } from "./cache";
