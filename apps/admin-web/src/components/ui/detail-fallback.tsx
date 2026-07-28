"use client";

import { RefreshCw, SearchX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DetailState } from "@/lib/query";

interface DetailFallbackProps {
  /** État renvoyé par `detailState()`. « ready » n'est jamais passé ici. */
  state: Exclude<DetailState, "ready">;
  /** Nom de l'objet, au singulier : « Cette commande », « Ce devis ». */
  label: string;
  /** Relance la requête. Proposé uniquement quand réessayer a un sens. */
  onRetry?: () => void;
}

/**
 * Ce qu'un écran de détail affiche quand il n'a pas (encore) sa donnée.
 *
 * L'enjeu est de ne plus confondre deux situations que l'ancien code
 * présentait à l'identique : « cet objet n'existe pas » (404 — l'utilisateur
 * doit revenir à la liste) et « je n'ai pas réussi à joindre le serveur »
 * (le plus souvent juste après une action, quand plusieurs requêtes repartent
 * ensemble — l'objet est toujours là, il faut réessayer). Annoncer une
 * suppression qui n'a pas eu lieu est le pire des deux messages.
 */
export function DetailFallback({ state, label, onRetry }: DetailFallbackProps) {
  if (state === "loading") {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <SearchX className="h-8 w-8 text-gray-300" aria-hidden="true" />
        <p className="text-sm font-semibold text-gray-900">{label} est introuvable</p>
        <p className="max-w-sm text-sm text-gray-500">
          Il a peut-être été supprimé, ou vous n&apos;y avez pas accès.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <WifiOff className="h-8 w-8 text-warning-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-gray-900">Chargement impossible</p>
      <p className="max-w-sm text-sm text-gray-500">
        {label} n&apos;a pas pu être chargé — le serveur n&apos;a pas répondu. Les données
        n&apos;ont pas été perdues.
      </p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      )}
    </div>
  );
}
