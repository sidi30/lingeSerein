"use client";

/**
 * Provider react-query de l'admin.
 *
 * Les conventions de cache elles-mêmes (familles de clés, `invalidateAfter`,
 * `detailState`) vivent dans `cache.ts`, sans React : c'est ce qui les rend
 * testables sous `node --test`. Ce module les réexporte pour que les écrans
 * n'aient qu'un seul point d'import.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { errorStatus } from "./cache";

export {
  KEY,
  AFFECTED,
  affectedFamilies,
  invalidateAfter,
  detailState,
  errorStatus,
} from "./cache";
export type { MutationScope, DetailState, DetailQuery } from "./cache";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Court : l'admin est un outil de travail où l'on enchaîne les
            // écritures. 30 s laissaient une liste mentir pendant une demi-minute
            // après une création faite depuis un autre écran.
            staleTime: 5_000,
            // Un onglet laissé ouvert pendant une réunion doit se remettre à
            // jour au retour, sans F5. Ne recharge que ce qui est périmé, en
            // arrière-plan : l'écran ne se vide pas.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // Réessayer un 404 ou un 403 ne fera que retarder l'affichage du
            // bon message : la réponse est définitive.
            retry: (count, error) => {
              const status = errorStatus(error);
              if (status >= 400 && status < 500) return false;
              return count < 1;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
