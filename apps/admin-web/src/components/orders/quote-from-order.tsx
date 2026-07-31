"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { invalidateAfter } from "@/lib/query";
import { quoteFromOrderMessage } from "@/lib/order-quote";
import { useToast } from "@/lib/toast";
import type { QuoteDTO } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Génération du devis correspondant à une commande.
 *
 * Le propriétaire veut, en confirmant une commande, retrouver le devis qui va
 * avec dans SA section devis. La règle qu'il a posée est aussi importante que
 * la fonctionnalité : rien ne part dans la section devis sans qu'il l'ait
 * décidé. D'où une confirmation explicite plutôt qu'un effet de bord attaché à
 * la transition de statut.
 *
 * La mutation vit ici, partagée par la fiche et la liste : sans cela, deux
 * écrans réimplémenteraient l'invalidation et la navigation, et l'un des deux
 * finirait par arriver sur un écran affichant l'état d'avant.
 */

/** Commande minimale nécessaire pour générer et annoncer le devis. */
export interface OrderRef {
  id: string;
  orderNumber: string;
}

export function useQuoteFromOrder() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    // Idempotent côté serveur, et garanti par un index UNIQUE en base plutôt
    // que par un test applicatif : deux appels concurrents (double-clic) ne
    // peuvent pas produire deux devis. L'écran n'a donc aucune garde à
    // bricoler — seulement à dire la vérité sur ce qui vient de se passer,
    // d'où `postWithStatus` (201 = créé, 200 = déjà émis).
    mutationFn: (orderId: string) => api.postWithStatus<QuoteDTO>(`/quotes/from-order/${orderId}`),
    onSuccess: async ({ data: quote, status }) => {
      toast(quoteFromOrderMessage(status, quote.numero));
      // Deux domaines écrivent : un devis naît, et la commande porte désormais
      // le lien vers lui. Attendre avant de naviguer, sinon la fiche du devis
      // s'ouvre sur une liste et des compteurs d'avant l'action.
      await invalidateAfter(queryClient, "quote", "order");
      router.push(`/devis/${quote.id}`);
    },
    onError: (err: unknown) => {
      // Un 404 ici n'est pas « commande introuvable » : c'est presque toujours
      // la route qui n'est pas encore déployée. Le dire évite de chercher un
      // bug de données là où il n'y en a pas (même diagnostic que DeleteAction).
      if (err instanceof ApiError && err.status === 404) {
        toast("Génération indisponible : le serveur ne propose pas encore cette route.", "error");
        return;
      }
      // Sinon le message de l'API porte la règle exacte (statut refusé, client
      // manquant…) : il est plus utile qu'un texte générique.
      toast(err instanceof Error ? err.message : "Erreur lors de la génération du devis", "error");
    },
  });
}

interface QuoteFromOrderPromptProps {
  /** Commande concernée ; `null` ⇒ dialogue fermé. */
  order: OrderRef | null;
  onClose: () => void;
}

/**
 * Proposition « générer le devis », affichée juste après le passage en
 * CONFIRMED. Refusable sans conséquence : le bouton de la fiche commande reste
 * disponible ensuite.
 */
export function QuoteFromOrderPrompt({ order, onClose }: QuoteFromOrderPromptProps) {
  const mutation = useQuoteFromOrder();

  return (
    <ConfirmDialog
      open={Boolean(order)}
      onClose={onClose}
      onConfirm={() => {
        // `onSettled`, pas `onSuccess` : en cas de succès la navigation démonte
        // l'écran et masquerait l'oubli, mais sur un refus (commande annulée,
        // route pas encore déployée) le dialogue resterait planté par-dessus le
        // toast qui explique le refus. `ConfirmDialog` ne se referme jamais de
        // lui-même — il ne connaît pas l'issue de l'action.
        if (order) mutation.mutate(order.id, { onSettled: onClose });
      }}
      loading={mutation.isPending}
      title="Générer le devis correspondant ?"
      description={
        order
          ? `La commande ${order.orderNumber} est confirmée. Vous pouvez créer maintenant le devis qui va avec : il apparaîtra en brouillon dans votre section Devis, prêt à être relu puis envoyé au client.`
          : undefined
      }
      confirmLabel="Générer le devis"
      cancelLabel="Plus tard"
    />
  );
}
