"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { invalidateAfter, type MutationScope } from "@/lib/query";
import { useToast } from "@/lib/toast";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Action « Supprimer » unique de l'admin.
 *
 * Le propriétaire a demandé la même suppression partout ; la seule façon de la
 * tenir est un composant unique plutôt que dix implémentations qui divergent.
 * Il porte donc les trois règles d'un coup :
 *
 * 1. jamais de suppression sans confirmation explicite ;
 * 2. jamais de bouton qui échoue — quand l'API refuse la suppression pour cet
 *    état (facture émise, rotation en cours), on passe `disabledReason` et le
 *    bouton est désactivé AVEC son explication, au lieu d'appeler pour se
 *    prendre un 422 ;
 * 3. toujours un retour visuel et un rafraîchissement de la liste.
 *
 * Les listes déclarent `invalidateKeys` : la liste et les compteurs se
 * rafraîchissent tout seuls, sans que chaque écran réinvente son invalidation.
 */
interface DeleteActionProps {
  /** Chemin passé tel quel à `api.delete` (ex. `/quotes/abc`). */
  endpoint: string;
  title: string;
  description: string;
  /** Message du toast de succès. */
  successMessage: string;
  /**
   * Raison du refus. Non nulle ⇒ bouton désactivé + explication au survol.
   * C'est la traduction UI d'une règle métier de l'API (statut non supprimable).
   */
  disabledReason?: string | null;
  /** Saisie obligatoire de ce texte avant d'activer la confirmation. */
  requireTypedText?: string;
  /** Récapitulatif d'impact affiché dans la modale. */
  children?: React.ReactNode;
  /** Bloque la confirmation (aperçu d'impact encore en chargement). */
  confirmDisabled?: boolean;
  /** Clés react-query à invalider après succès. */
  invalidateKeys?: string[][];
  /**
   * Domaines métier touchés — préférer ceci à `invalidateKeys` : la carte des
   * familles impactées vit dans `lib/query`, au lieu d'être recopiée (et
   * oubliée) sur chaque écran.
   */
  scopes?: MutationScope[];
  /**
   * Entrées de cache à PURGER, pas seulement à invalider. À renseigner quand
   * l'écran affiche encore l'objet supprimé : invalider relancerait un GET sur
   * une ressource qui n'existe plus, et l'écran afficherait « introuvable »
   * avant que la navigation ne l'emporte.
   */
  removeKeys?: string[][];
  onDeleted?: () => void;
  /** Sans libellé, le bouton est une icône seule (usage en ligne de tableau). */
  label?: string;
  confirmLabel?: string;
  size?: "sm" | "md";
  variant?: "danger" | "ghost";
  /** Nom de l'élément, pour l'aria-label du bouton icône. */
  itemLabel: string;
  dialogSize?: "sm" | "md";
}

export function DeleteAction({
  endpoint,
  title,
  description,
  successMessage,
  disabledReason,
  requireTypedText,
  children,
  confirmDisabled,
  invalidateKeys = [],
  scopes = [],
  removeKeys = [],
  onDeleted,
  label,
  confirmLabel = "Supprimer",
  size = "sm",
  variant = "ghost",
  itemLabel,
  dialogSize,
}: DeleteActionProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.delete(endpoint),
    onSuccess: async () => {
      setOpen(false);
      toast(successMessage);
      // Purger avant d'invalider : une fiche encore montée sur l'objet supprimé
      // relancerait sinon un GET voué au 404.
      for (const key of removeKeys) {
        queryClient.removeQueries({ queryKey: key });
      }
      // Naviguer D'ABORD, invalider ensuite. `invalidateQueries` attend les
      // requêtes ACTIVES : tant que la fiche supprimée est encore montée, elle
      // relance un GET voué au 404, react-query le retente, et l'attente durait
      // plusieurs secondes pendant lesquelles l'écran restait sur un objet qui
      // n'existe plus. La liste d'arrivée est quand même à jour : elle se monte
      // sur des requêtes invalidées, donc rechargées.
      onDeleted?.();
      await Promise.all([
        invalidateAfter(queryClient, ...scopes),
        ...invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      ]);
    },
    onError: (err: unknown) => {
      // Un 404 sur une suppression, ce n'est pas « introuvable » côté écran :
      // c'est presque toujours la route qui n'est pas encore déployée. Le dire
      // évite de chercher un bug de données là où il n'y en a pas.
      if (err instanceof ApiError && err.status === 404) {
        toast("Suppression indisponible : le serveur ne propose pas encore cette route.", "error");
        return;
      }
      // Sinon on affiche le message de l'API : c'est lui qui porte la règle
      // exacte (« Seul un devis en brouillon peut être supprimé »).
      toast(err instanceof Error ? err.message : "Erreur lors de la suppression", "error");
    },
  });

  const button = (
    <Button
      variant={disabledReason ? "ghost" : variant}
      size={size}
      disabled={Boolean(disabledReason)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      aria-label={label ? undefined : `Supprimer ${itemLabel}`}
    >
      {/* La teinte rouge vit sur l'icône, pas sur le bouton : posée sur le
          bouton, elle entrerait en concurrence avec la couleur de texte du
          variant (`text-white` sur `danger`, `text-gray-600` sur `ghost`) et
          c'est l'ordre des utilitaires dans la feuille générée qui trancherait
          — pas l'ordre d'écriture. Sur l'icône, aucun conflit possible. */}
      <Trash2
        className={`h-4 w-4 ${!disabledReason && variant === "ghost" ? "text-danger-600" : ""}`}
        aria-hidden="true"
      />
      {label}
    </Button>
  );

  return (
    // Le conteneur stoppe la propagation : ces boutons vivent dans des lignes de
    // tableau cliquables, un clic sur « Supprimer » ne doit pas aussi naviguer.
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
      className="inline-flex"
    >
      {/* Le title vit sur le span, pas sur le bouton : un bouton désactivé a
          pointer-events:none et n'afficherait jamais son propre tooltip. */}
      {disabledReason ? (
        <span title={disabledReason} className="inline-flex">
          {button}
        </span>
      ) : (
        button
      )}

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate()}
        loading={mutation.isPending}
        variant="danger"
        size={dialogSize ?? (children ? "md" : "sm")}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        requireTypedText={requireTypedText}
        confirmDisabled={confirmDisabled}
      >
        {children}
      </ConfirmDialog>
    </span>
  );
}
