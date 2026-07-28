import { QueryClient } from "@tanstack/react-query";
import { errorStatus } from "./cache";

/**
 * Client react-query unique de l'application.
 *
 * Il vit ici, et non dans `app/_layout.tsx`, parce que `api.ts` en a besoin :
 * la session peut expirer au milieu de n'importe quelle requête, et c'est
 * `apiFetch` — pas un composant — qui détecte le 401. Sans accès au client, ce
 * chemin déconnectait l'utilisateur **sans vider le cache**, et le compte
 * suivant retrouvait à l'écran les commandes et les clients du précédent, quel
 * que soit son rôle. `useLogout` faisait bien le ménage, mais une session
 * expirée ne passe pas par lui.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 404 ou un 403 est une réponse définitive : réessayer ne fait que
      // retarder le bon message. Les pannes réseau, elles, méritent un essai.
      retry: (count, error) => {
        const status = errorStatus(error);
        if (status >= 400 && status < 500) return false;
        return count < 1;
      },
      staleTime: 2 * 60 * 1000,
      // Rafraîchit au retour au premier plan (via AppState, cf.
      // setUpAppStateRefetch). Limité aux requêtes périmées par `staleTime`,
      // et exécuté en arrière-plan : le contenu affiché n'est jamais vidé.
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * Fraîcheur des familles que l'admin modifie dans le dos du mobile.
 *
 * Une commande confirmée, un statut changé ou une tournée replanifiée depuis
 * admin-web n'émet aucun signal vers le téléphone : sans `staleTime` court,
 * le livreur pouvait rester deux minutes devant un état déjà faux. 30 s est le
 * compromis retenu — assez court pour que le retour au premier plan recharge
 * presque toujours, assez long pour ne pas requêter à chaque navigation.
 */
export const SHARED_STATE_STALE_TIME = 30_000;
