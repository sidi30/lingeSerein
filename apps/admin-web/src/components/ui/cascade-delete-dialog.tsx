"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { invalidateAfter, type MutationScope } from "@/lib/query";
import { useToast } from "@/lib/toast";
import { useDeletionPreview, hasIssuedInvoices } from "@/lib/deletion";
import { ConfirmDialog } from "./confirm-dialog";
import { DeletionImpact } from "./deletion-impact";

/**
 * Suppression en cascade d'une entité qui en entraîne d'autres (client,
 * abonnement).
 *
 * Trois différences avec `DeleteAction`, qui justifient un composant à part :
 *
 * - l'aperçu d'impact est chargé à l'ouverture et AFFICHÉ avant confirmation ;
 * - la confirmation exige une saisie délibérée, pas un « OK » réflexe ;
 * - quand une facture émise est en jeu, la suppression est légalement
 *   impossible : la modale bascule alors sur l'anonymisation plutôt que
 *   d'afficher une erreur sur un bouton qui semble cassé.
 */
interface CascadeDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  /** `GET` — alimente le récapitulatif d'impact. */
  previewEndpoint: string;
  /** `DELETE` — inclut déjà `?cascade=true`. */
  deleteEndpoint: string;
  title: string;
  description: string;
  successMessage: string;
  /** Texte à saisir pour armer la confirmation (nom du client, en général). */
  requireTypedText?: string;
  invalidateKeys?: string[][];
  /** Domaines métier touchés — voir `AFFECTED` dans `lib/query`. */
  scopes?: MutationScope[];
  /** Entrées de cache à purger (la fiche de l'objet supprimé). */
  removeKeys?: string[][];
  onDeleted?: () => void;
  /**
   * Porte de sortie légale quand des factures émises existent. Absente ⇒ le
   * blocage est affiché sans issue, et signalé comme tel.
   */
  anonymize?: {
    /** `POST`. */
    endpoint: string;
    successMessage: string;
  };
}

export function CascadeDeleteDialog({
  open,
  onClose,
  previewEndpoint,
  deleteEndpoint,
  title,
  description,
  successMessage,
  requireTypedText,
  invalidateKeys = [],
  scopes = [],
  removeKeys = [],
  onDeleted,
  anonymize,
}: CascadeDeleteDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const state = useDeletionPreview(previewEndpoint, open);

  const blockedByLaw = hasIssuedInvoices(state.preview);
  const canAnonymize = blockedByLaw && Boolean(anonymize);

  /**
   * Purge d'abord, invalide ensuite, et rend la main seulement quand les
   * requêtes affichées sont rechargées : l'appelant navigue derrière, et la
   * page d'arrivée ne doit pas repartir de l'état d'avant la suppression.
   */
  const invalidateAll = () =>
    Promise.all([
      invalidateAfter(queryClient, ...scopes),
      ...invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    ]);

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 404) {
      toast("Action indisponible : le serveur ne propose pas encore cette route.", "error");
      return;
    }
    toast(err instanceof Error ? err.message : "Erreur lors de la suppression", "error");
  };

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(deleteEndpoint),
    onSuccess: async () => {
      onClose();
      toast(successMessage);
      for (const key of removeKeys) queryClient.removeQueries({ queryKey: key });
      await invalidateAll();
      onDeleted?.();
    },
    onError,
  });

  const anonymizeMutation = useMutation({
    mutationFn: () => api.post(anonymize?.endpoint ?? ""),
    onSuccess: async () => {
      onClose();
      toast(anonymize?.successMessage ?? "Client anonymisé");
      await invalidateAll();
      onDeleted?.();
    },
    onError,
  });

  // Tant que l'impact n'est pas connu, on ne laisse rien partir : c'est la
  // traduction directe de « ne jamais supprimer à l'aveugle ».
  const previewMissing = state.unavailable || state.isLoading || !state.preview;
  const blockedWithoutIssue = blockedByLaw && !anonymize;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => (canAnonymize ? anonymizeMutation.mutate() : deleteMutation.mutate())}
      loading={deleteMutation.isPending || anonymizeMutation.isPending}
      variant="danger"
      size="md"
      title={title}
      description={
        canAnonymize
          ? "Ce client porte des factures émises : elles doivent être conservées. La suppression est donc remplacée par une anonymisation — l'identité disparaît, la comptabilité reste."
          : description
      }
      confirmLabel={canAnonymize ? "Anonymiser le client" : "Supprimer définitivement"}
      cancelLabel="Annuler"
      confirmDisabled={previewMissing || blockedWithoutIssue}
      // Anonymiser est réversible côté comptable et ne détruit rien : exiger la
      // saisie du nom n'y ajouterait qu'une friction sans contrepartie.
      requireTypedText={canAnonymize ? undefined : requireTypedText}
    >
      <DeletionImpact state={state} />
      {blockedWithoutIssue && (
        <p className="mt-3 text-sm font-medium text-danger-600">
          Suppression impossible et aucune anonymisation disponible sur le serveur. Signalez-le :
          sans cette route, ce client ne peut pas être retiré de vos listes.
        </p>
      )}
    </ConfirmDialog>
  );
}
