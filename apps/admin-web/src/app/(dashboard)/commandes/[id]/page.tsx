"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/toast";
import { formatPrice, formatDate, formatDateTime } from "@/lib/format";
import { ORDER_TRANSITIONS } from "@lingengo/shared";
import type { OrderDetailDTO, OrderStatus } from "@/lib/types";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cancelModal, setCancelModal] = useState(false);
  const [cancelRaison, setCancelRaison] = useState("");
  const [cancelError, setCancelError] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.get<OrderDetailDTO>(`/orders/${id}`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, raison }: { status: OrderStatus; raison?: string }) =>
      api.patch<OrderDetailDTO>(`/orders/${id}/status`, { status, raison }),
    onSuccess: () => {
      toast("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-badge"] });
      setCancelModal(false);
      setCancelRaison("");
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

  if (isLoading) {
    return (
      <>
        <Header title="Commande" />
        <div className="space-y-6 p-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Header title="Commande" />
        <div className="flex items-center justify-center p-12 text-gray-400">
          Commande introuvable
        </div>
      </>
    );
  }

  const sc = statusConfig[order.status];
  const nextStatuses = ORDER_TRANSITIONS[order.status].filter((s) => s !== "CANCELLED");
  const canCancel = ORDER_TRANSITIONS[order.status].includes("CANCELLED");
  const isTerminal = ORDER_TRANSITIONS[order.status].length === 0;

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
            {canCancel && (
              <Button variant="danger" size="sm" onClick={() => setCancelModal(true)}>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Refuser
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-6 p-6">
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
          {isTerminal && (
            <span className="ml-auto text-xs text-gray-400">Cette commande a déjà été traitée</span>
          )}
          {order.convertedFromQuote && (
            <Link
              href={`/devis/${order.convertedFromQuote.id}`}
              className="ml-auto flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Voir le devis {order.convertedFromQuote.numero}
            </Link>
          )}
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
                  <dd className="text-gray-500">{order.user.email}</dd>
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

          {/* Total */}
          <Card title="Total">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 tabular-nums">
                {formatPrice(order.totalCents)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {order.items.length} produit{order.items.length > 1 ? "s" : ""}
              </p>
            </div>
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
    </>
  );
}
