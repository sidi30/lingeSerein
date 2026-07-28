"use client";

import { Scale } from "lucide-react";
import { Skeleton } from "./skeleton";
import { ModuleUnavailable } from "./module-unavailable";
import { hasIssuedInvoices, type DeletionPreviewState } from "@/lib/deletion";

/**
 * Récapitulatif « voici ce qui sera supprimé », affiché dans la modale AVANT la
 * confirmation. Sans lui, la suppression en cascade se ferait à l'aveugle.
 */
export function DeletionImpact({ state }: { state: DeletionPreviewState }) {
  const { preview, isLoading, unavailable } = state;

  if (unavailable) {
    return (
      <ModuleUnavailable
        title="Aperçu d'impact indisponible"
        description="Le serveur ne sait pas encore dire ce que cette suppression entraînerait. Tant que ce n'est pas le cas, la suppression en cascade reste bloquée : on ne supprime pas à l'aveugle."
      />
    );
  }

  if (isLoading || !preview) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  const rows: { label: string; count: number }[] = [];
  const push = (label: string, count: number | undefined) => {
    if (count !== undefined && count > 0) rows.push({ label, count });
  };

  push("devis (brouillons)", preview.quotes?.draft);
  push("devis envoyés ou aboutis", preview.quotes?.other);
  push("factures brouillon", preview.invoices?.draft);
  push("commandes", preview.orders);
  push("rotations en cours", preview.rotations?.active);
  push("rotations clôturées", preview.rotations?.closed);
  push("arrêts de tournée", preview.deliveryStops);
  if (preview.subscription) rows.push({ label: "abonnement lié", count: 1 });

  const issued = preview.invoices?.issued ?? 0;
  const recurring = preview.recurringInvoices ?? 0;
  const engagement = preview.engagement;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Sera supprimé
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune donnée rattachée.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-700">{row.label}</span>
                <span className="font-semibold text-gray-900 tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Les factures d'abonnement déjà émises ne sont PAS supprimées : elles
          appartiennent au bloc « conservé », pas au bloc « sera supprimé ». */}
      {recurring > 0 && (
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">
            {recurring} facture{recurring > 1 ? "s" : ""} d&apos;abonnement déjà émise
            {recurring > 1 ? "s" : ""}
          </span>{" "}
          {recurring > 1 ? "sont conservées" : "est conservée"} : ce sont des pièces comptables.
        </p>
      )}

      {engagement?.active && (
        <p className="text-sm text-warning-600">
          Engagement contractuel encore actif ({engagement.joursRestants} jour
          {engagement.joursRestants > 1 ? "s" : ""} restant
          {engagement.joursRestants > 1 ? "s" : ""}). Supprimer l&apos;abonnement n&apos;est pas une
          résiliation : si le client part, résiliez-le plutôt depuis sa fiche.
        </p>
      )}

      {hasIssuedInvoices(state.preview) && (
        <div className="flex items-start gap-3 rounded-lg border border-warning-500/30 bg-warning-50 p-3">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
          <div className="text-sm text-warning-600">
            <p className="font-semibold">
              {issued} facture{issued > 1 ? "s" : ""} émise{issued > 1 ? "s" : ""} — conservation
              obligatoire
            </p>
            <p className="mt-0.5 text-warning-600/90">
              Une facture émise est une pièce comptable : la loi impose de la conserver 10 ans (art.
              L123-22 du code de commerce). Elle ne peut pas être supprimée, même en cascade.
              Anonymisez le client à la place : son identité disparaît de vos listes, les factures
              et leur numérotation restent intactes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
