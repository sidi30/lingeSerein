"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DeleteAction } from "@/components/ui/delete-action";
import { DELETE_BLOCKED } from "@/lib/deletion";
import { DetailFallback } from "@/components/ui/detail-fallback";
import { detailState, invalidateAfter } from "@/lib/query";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/lib/toast";
import { formatPrice, formatDate, formatDateTime } from "@/lib/format";
import {
  formatDeliveryFee,
  orderAmounts,
  quoteGenerationBlockedReason,
  quoteLinks,
} from "@/lib/order-quote";
import {
  QuoteFromOrderPrompt,
  useQuoteFromOrder,
  type OrderRef,
} from "@/components/orders/quote-from-order";
import { ORDER_TRANSITIONS } from "@lingengo/shared";
import type { OrderDetailDTO, OrderStatus } from "@/lib/types";
import { EmailText } from "@/components/ui/email-text";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  Package,
  ArrowRight,
  User,
  MapPin,
  FileText,
  FilePlus2,
} from "lucide-react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const statusConfig: Record<
  OrderStatus,
  { label: string; variant: BadgeVariant; icon: React.ReactNode }
> = {
  PENDING: { label: "En attente", variant: "warning", icon: <Clock className="h-4 w-4" /> },
  CONFIRMED: { label: "Confirmée", variant: "info", icon: <CheckCircle2 className="h-4 w-4" /> },
  IN_DELIVERY: { label: "En livraison", variant: "default", icon: <Truck className="h-4 w-4" /> },
  DELIVERED: { label: "Livrée", variant: "success", icon: <Package className="h-4 w-4" /> },
  CANCELLED: { label: "Annulée", variant: "danger", icon: <XCircle className="h-4 w-4" /> },
};

const sourceLabels: Record<string, string> = {
  MOBILE: "Application mobile",
  QUOTE_CONVERSION: "Conversion devis",
  MANUAL: "Manuel",
};

const nextActionLabels: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Confirmer",
  IN_DELIVERY: "En livraison",
  DELIVERED: "Marquer livrée",
};

export default function CommandeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cancelModal, setCancelModal] = useState(false);
  const [cancelRaison, setCancelRaison] = useState("");
  const [cancelError, setCancelError] = useState("");
  /** Commande dont on propose le devis juste après sa confirmation. */
  const [quotePrompt, setQuotePrompt] = useState<OrderRef | null>(null);

  const orderQuery = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.get<OrderDetailDTO>(`/orders/${id}`),
  });
  const order = orderQuery.data;
  const state = detailState(orderQuery, Boolean(id));

  const quoteMutation = useQuoteFromOrder();

  const statusMutation = useMutation({
    mutationFn: ({ status, raison }: { status: OrderStatus; raison?: string }) =>
      api.patch<OrderDetailDTO>(`/orders/${id}/status`, { status, raison }),
    onSuccess: (updated, variables) => {
      toast("Statut mis à jour");
      // Un changement de statut ne touche pas que la commande : la tournée, le
      // stock, la facture adossée et les KPI bougent avec elle.
      void invalidateAfter(queryClient, "order");
      setCancelModal(false);
      setCancelRaison("");
      // C'est le moment où le propriétaire attend son devis : on le PROPOSE,
      // sans rien écrire dans sa section devis avant qu'il ait dit oui. On lit
      // la commande renvoyée par le PATCH plutôt que celle du cache : elle
      // porte l'état d'après, et reproposer un devis déjà généré serait un
      // faux départ. Repli sur le cache si la route ne renvoie pas la commande.
      const confirmed = updated ?? order;
      if (variables.status === "CONFIRMED" && confirmed && !quoteLinks(confirmed).generated) {
        setQuotePrompt({ id: confirmed.id, orderNumber: confirmed.orderNumber });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur lors du changement de statut";
      toast(msg, "error");
    },
  });

  const handleCancel = () => {
    if (!cancelRaison.trim()) {
      setCancelError("La raison du refus est obligatoire");
      return;
    }
    setCancelError("");
    statusMutation.mutate({ status: "CANCELLED", raison: cancelRaison });
  };

  if (state !== "ready" || !order) {
    return (
      <>
        <Header title="Commande" />
        <DetailFallback
          state={state === "ready" ? "loading" : state}
          label="Cette commande"
          onRetry={() => void orderQuery.refetch()}
        />
      </>
    );
  }

  const sc = statusConfig[order.status];
  const nextStatuses = ORDER_TRANSITIONS[order.status].filter((s) => s !== "CANCELLED");
  const canCancel = ORDER_TRANSITIONS[order.status].includes("CANCELLED");
  const isTerminal = ORDER_TRANSITIONS[order.status].length === 0;
  // Deux liens distincts : le devis d'ORIGINE et celui ÉMIS depuis la commande.
  // Le second remplace le bouton — reproposer la génération d'un devis qui
  // existe déjà laisse croire qu'il en manque un.
  const links = quoteLinks(order);
  const quoteBlockedReason = quoteGenerationBlockedReason(order.status);
  const amounts = orderAmounts(order);

  return (
    <>
      <Header
        title={order.orderNumber}
        actions={
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                loading={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: s })}
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                {nextActionLabels[s] ?? s}
              </Button>
            ))}
            {/* Devis existant ⇒ on y renvoie ; sinon on propose de le produire,
                désactivé AVEC sa raison quand l'état de la commande l'interdit
                (motif `disabledReason` de DeleteAction). */}
            {links.generated ? (
              // Bouton qui navigue, et non `<Link>` enveloppant un `<Button>` :
              // un `<button>` dans un `<a>` est du contenu interactif imbriqué,
              // invalide et ambigu au clavier. Le vrai lien (ouvrable dans un
              // onglet) vit dans le bandeau de statut, juste en dessous.
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/devis/${links.generated?.id}`)}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Voir le devis {links.generated.numero}
              </Button>
            ) : (
              // Le title vit sur le span : un bouton désactivé a
              // pointer-events:none et n'afficherait jamais son propre tooltip.
              <span title={quoteBlockedReason ?? "Créer le devis correspondant à cette commande"}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={Boolean(quoteBlockedReason)}
                  loading={quoteMutation.isPending}
                  onClick={() => quoteMutation.mutate(order.id)}
                >
                  <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                  Générer le devis
                </Button>
              </span>
            )}
            {canCancel && (
              <Button variant="danger" size="sm" onClick={() => setCancelModal(true)}>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Refuser
              </Button>
            )}
            {/* PENDING ou CANCELLED uniquement (ORDER_DELETABLE côté API). */}
            <DeleteAction
              endpoint={`/orders/${order.id}`}
              itemLabel={`la commande ${order.orderNumber}`}
              label="Supprimer"
              title="Supprimer cette commande ?"
              description={`La commande ${order.orderNumber} sera supprimée. Cette action n'est pas réversible depuis l'admin.`}
              successMessage="Commande supprimée"
              disabledReason={
                order.status === "PENDING" || order.status === "CANCELLED"
                  ? null
                  : DELETE_BLOCKED.order
              }
              scopes={["order"]}
              removeKeys={[["order", id]]}
              onDeleted={() => router.push("/commandes")}
            />
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Statut */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">{sc.icon}</span>
            <Badge variant={sc.variant}>{sc.label}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Source :</span>
            <span className="font-medium text-gray-700">
              {sourceLabels[order.source] ?? order.source}
            </span>
          </div>
          {/* Groupés dans un seul conteneur poussé à droite : deux `ml-auto`
              frères se disputaient l'espace restant quand les deux mentions
              apparaissaient ensemble. */}
          <div className="ml-auto flex flex-wrap items-center gap-4">
            {isTerminal && (
              <span className="text-xs text-gray-400">Cette commande a déjà été traitée</span>
            )}
            {/* Les deux sens s'affichent ensemble le cas échéant : une commande
                née du devis A peut avoir produit le devis B, et masquer l'un
                des deux reviendrait à effacer une partie de son histoire. */}
            {links.converted && (
              <Link
                href={`/devis/${links.converted.id}`}
                className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Commande issue du devis {links.converted.numero}
              </Link>
            )}
            {links.generated && (
              <Link
                href={`/devis/${links.generated.id}`}
                className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Devis émis : {links.generated.numero}
              </Link>
            )}
          </div>
        </div>

        {order.cancelledReason && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-danger-800">Motif du refus</p>
              <p className="mt-1 text-sm text-danger-700">{order.cancelledReason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Client */}
          <Card title="Client">
            <dl className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <div>
                  <dd className="font-medium text-gray-900">{order.user.name}</dd>
                  <dd className="text-gray-500">
                    <EmailText email={order.user.email} />
                  </dd>
                  {order.user.phone && <dd className="text-gray-500">{order.user.phone}</dd>}
                </div>
              </div>
              {order.user.zone && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                  <dd className="text-gray-700">{order.user.zone.name}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Livraison */}
          <Card title="Livraison">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Date de livraison</dt>
                <dd className="font-medium text-gray-900">{formatDate(order.deliveryDate)}</dd>
              </div>
              {order.timeSlot && (
                <div>
                  <dt className="text-xs text-gray-500">Créneau</dt>
                  <dd className="text-gray-700">{order.timeSlot}</dd>
                </div>
              )}
              {order.specialNotes && (
                <div>
                  <dt className="text-xs text-gray-500">Notes spéciales</dt>
                  <dd className="text-gray-700">{order.specialNotes}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Total — détaillé : `totalCents` est le sous-total des articles, et
              l'afficher seul sous le mot « Total » sous-facture la livraison. */}
          <Card title="Total">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">
                  Sous-total ({order.items.length} produit{order.items.length > 1 ? "s" : ""})
                </dt>
                <dd className="font-medium tabular-nums">{formatPrice(amounts.subtotalCents)}</dd>
              </div>
              {/* `null` = l'API ne renvoie pas encore le champ : on se tait
                  plutôt que d'annoncer une gratuité qu'on ne connaît pas. */}
              {amounts.deliveryFeeCents !== null && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Frais de livraison</dt>
                  <dd
                    className={
                      amounts.deliveryFeeSurDevis
                        ? "font-medium text-warning-600"
                        : amounts.deliveryFeeCents === 0
                          ? "font-medium text-success-600"
                          : "font-medium tabular-nums"
                    }
                  >
                    {formatDeliveryFee(amounts.deliveryFeeCents, amounts.deliveryFeeSurDevis)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2">
                <dt className="font-semibold text-primary-900">Total</dt>
                <dd className="text-2xl font-bold text-primary-700 tabular-nums">
                  {formatPrice(amounts.totalCents)}
                </dd>
              </div>
              {/* Hors zone tarifée : le total est exact SUR LES ARTICLES, et la
                  course reste à chiffrer. Le taire ferait passer ce montant
                  pour le prix final. */}
              {amounts.deliveryFeeSurDevis && (
                <p className="text-xs text-warning-700">
                  Livraison non tarifée sur cette zone : ce total n&apos;inclut pas la course, à
                  chiffrer sur le devis.
                </p>
              )}
            </dl>
          </Card>
        </div>

        {/* Articles commandés */}
        <Card title="Articles commandés">
          <Table>
            <Thead>
              <tr>
                <Th>Produit</Th>
                <Th>Gamme</Th>
                <Th>Qté</Th>
                <Th>P.U.</Th>
                <Th>Total</Th>
              </tr>
            </Thead>
            <tbody>
              {order.items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <div>
                      <p className="font-medium text-gray-900">{item.product.name}</p>
                      <p className="text-xs text-gray-500">{item.product.category}</p>
                    </div>
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        item.product.range === "PRESTIGE"
                          ? "warning"
                          : item.product.range === "HOTEL"
                            ? "default"
                            : "info"
                      }
                    >
                      {item.product.range}
                    </Badge>
                  </Td>
                  <Td>{item.quantity}</Td>
                  <Td className="tabular-nums">{formatPrice(item.unitCents)}</Td>
                  <Td className="tabular-nums font-semibold">{formatPrice(item.totalCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Historique des statuts */}
        {order.statusHistory.length > 0 && (
          <Card title="Historique des statuts">
            <ol className="relative border-l border-gray-200 pl-6 space-y-4">
              {order.statusHistory.map((entry, i) => {
                const toSc = statusConfig[entry.to];
                return (
                  <li key={i} className="relative">
                    <div className="absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-gray-200">
                      <div
                        className={`h-2 w-2 rounded-full ${toSc.variant === "success" ? "bg-success-500" : toSc.variant === "danger" ? "bg-danger-500" : toSc.variant === "warning" ? "bg-warning-500" : "bg-primary-500"}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={toSc.variant} className="text-xs">
                          {toSc.label}
                        </Badge>
                        {entry.from && (
                          <span className="text-xs text-gray-400">
                            depuis {statusConfig[entry.from]?.label ?? entry.from}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {formatDateTime(entry.at)}
                        {entry.by.name && ` · ${entry.by.name}`}
                      </div>
                      {entry.raison && (
                        <p className="mt-1 text-xs text-gray-600 italic">{entry.raison}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>

      {/* Modal refus avec raison */}
      <Modal
        open={cancelModal}
        onClose={() => {
          setCancelModal(false);
          setCancelRaison("");
          setCancelError("");
        }}
        title="Refuser la commande"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="cancel-raison" className="block text-sm font-medium text-gray-700 mb-1">
              Raison du refus <span className="text-danger-600">*</span>
            </label>
            <textarea
              id="cancel-raison"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Ex : Créneau indisponible sur votre zone..."
              value={cancelRaison}
              onChange={(e) => {
                setCancelRaison(e.target.value);
                setCancelError("");
              }}
              aria-describedby={cancelError ? "cancel-raison-error" : undefined}
            />
            {cancelError && (
              <p id="cancel-raison-error" className="mt-1 text-xs text-danger-600">
                {cancelError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setCancelModal(false);
                setCancelRaison("");
                setCancelError("");
              }}
            >
              Annuler
            </Button>
            <Button variant="danger" loading={statusMutation.isPending} onClick={handleCancel}>
              Confirmer le refus
            </Button>
          </div>
        </div>
      </Modal>

      {/* Proposition de devis, juste après le passage en « Confirmée » */}
      <QuoteFromOrderPrompt order={quotePrompt} onClose={() => setQuotePrompt(null)} />
    </>
  );
}
