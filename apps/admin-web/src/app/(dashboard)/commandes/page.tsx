"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmailText } from "@/components/ui/email-text";
import { Modal } from "@/components/ui/modal";
import { DeleteAction } from "@/components/ui/delete-action";
import { DELETE_BLOCKED } from "@/lib/deletion";
import { OrderForm } from "@/components/orders/order-form";
import { QuoteFromOrderPrompt, type OrderRef } from "@/components/orders/quote-from-order";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, ArrowRight, Plus } from "lucide-react";
import { invalidateAfter } from "@/lib/query";
import { formatDeliveryFee, orderAmounts, quoteLinks } from "@/lib/order-quote";
import { useClampedPage } from "@/lib/use-clamped-page";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  product: { name: string; range: string; category: string };
}

interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  status: string;
  isRecurring: boolean;
  /** SOUS-TOTAL des articles — le total à payer y ajoute la livraison. */
  totalCents: number;
  /** Optionnel : une API plus ancienne ne le renvoie pas (≠ livraison offerte). */
  deliveryFeeCents?: number | null;
  /** Zone sans tarif public : 0 € y signifie « à chiffrer », pas « offerte ». */
  deliveryFeeSurDevis?: boolean | null;
  deliveryDate: string;
  timeSlot: string;
  specialNotes: string | null;
  items: OrderItem[];
  user: { id: string; name: string; email: string | null };
  /** Devis déjà émis depuis la commande : sert à ne pas le reproposer. */
  generatedQuote?: { id: string; numero: string } | null;
}

interface OrdersResponse {
  data: Order[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

type OrderStatus = "PENDING" | "CONFIRMED" | "IN_DELIVERY" | "DELIVERED" | "CANCELLED";

const statusOptions = [
  { value: "", label: "Tous les statuts" },
  { value: "PENDING", label: "En attente" },
  { value: "CONFIRMED", label: "Confirmée" },
  { value: "IN_DELIVERY", label: "En livraison" },
  { value: "DELIVERED", label: "Livrée" },
  { value: "CANCELLED", label: "Annulée" },
];

const statusConfig: Record<
  OrderStatus,
  { label: string; variant: "warning" | "info" | "default" | "success" | "danger" }
> = {
  PENDING: { label: "En attente", variant: "warning" },
  CONFIRMED: { label: "Confirmée", variant: "info" },
  IN_DELIVERY: { label: "En livraison", variant: "default" },
  DELIVERED: { label: "Livrée", variant: "success" },
  CANCELLED: { label: "Annulée", variant: "danger" },
};

/** MIROIR de `ORDER_DELETABLE` (packages/api/src/services/orders.service.ts),
 *  qui reste l'autorité : l'API refuse en 422 même si l'UI proposait le bouton. */
const ORDER_DELETABLE: string[] = ["PENDING", "CANCELLED"];

const nextStatusMap: Record<string, OrderStatus> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "IN_DELIVERY",
  IN_DELIVERY: "DELIVERED",
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function CommandesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  /** Commande dont on propose le devis juste après sa confirmation. */
  const [quotePrompt, setQuotePrompt] = useState<OrderRef | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", page, statusFilter, search],
    queryFn: () =>
      // getRaw : `get` deballe deja `data`, la page lisait `.data` sur le tableau
      // deja deballe -> undefined -> « Aucune commande » en toutes circonstances.
      api.getRaw<OrdersResponse>("/orders", {
        page,
        limit: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  });

  const orders = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  useClampedPage(page, totalPages, setPage);

  const statusMutation = useMutation({
    // On passe la commande entière, pas seulement son id : `onSuccess` a besoin
    // de son numéro et de son éventuel devis déjà rattaché pour proposer — ou
    // non — la génération.
    mutationFn: ({ order, status }: { order: Order; status: string }) =>
      api.patch(`/orders/${order.id}/status`, { status }),
    onSuccess: (_data, { order, status }) => {
      toast("Statut mis à jour");
      void invalidateAfter(queryClient, "order");
      // Même enchaînement que sur la fiche : confirmer est le moment où le
      // propriétaire veut son devis. On le PROPOSE — rien ne part dans sa
      // section devis sans qu'il ait dit oui.
      if (status === "CONFIRMED" && !quoteLinks(order).generated) {
        setQuotePrompt({ id: order.id, orderNumber: order.orderNumber });
      }
    },
    onError: () => toast("Erreur lors de la mise à jour", "error"),
  });

  return (
    <>
      <Header
        title="Commandes"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvelle commande
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full max-w-xs">
            <SearchInput
              placeholder="N° commande ou client..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              onClear={() => {
                setSearch("");
                setPage(1);
              }}
            />
          </div>
          <div className="w-44">
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {(search || statusFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPage(1);
              }}
              className="text-xs text-primary-600 hover:underline"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-12 w-12" />}
            title={search || statusFilter ? "Aucune commande trouvée" : "Aucune commande"}
            description={
              search || statusFilter
                ? "Essayez de modifier vos filtres."
                : "Les commandes de vos clients apparaîtront ici."
            }
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>N° Commande</Th>
                  <Th>Client</Th>
                  <Th>Produits</Th>
                  <Th>Total</Th>
                  <Th>Livraison</Th>
                  <Th>Créneau</Th>
                  <Th>Statut</Th>
                  <Th />
                </tr>
              </Thead>
              <tbody>
                {orders.map((order) => {
                  const status = statusConfig[order.status as OrderStatus];
                  const nextStatus = nextStatusMap[order.status];
                  const nextLabel = nextStatus ? statusConfig[nextStatus]?.label : null;
                  const amounts = orderAmounts(order);

                  return (
                    <Tr key={order.id}>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900">{order.orderNumber}</span>
                          {order.isRecurring && <Badge variant="info">Récurrent</Badge>}
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <p className="font-medium text-gray-900">{order.user.name}</p>
                          <EmailText email={order.user.email} className="text-xs text-gray-500" />
                        </div>
                      </Td>
                      <Td>
                        <div className="space-y-0.5">
                          {order.items.map((item) => (
                            <p key={item.id} className="text-xs text-gray-600">
                              {item.quantity}x {item.product.name}
                            </p>
                          ))}
                        </div>
                      </Td>
                      <Td>
                        {/* Le total affiché est celui que le client paie ;
                            `totalCents` seul oublierait la livraison. Le détail
                            reste lisible sous le montant plutôt que dans une
                            colonne de plus. */}
                        <div className="space-y-0.5">
                          <p className="font-semibold text-gray-900 tabular-nums">
                            {formatPrice(amounts.totalCents)}
                          </p>
                          {amounts.deliveryFeeCents !== null && (
                            <p className="text-xs text-gray-500">
                              {formatPrice(amounts.subtotalCents)} + livraison{" "}
                              {amounts.deliveryFeeSurDevis ? (
                                // 0 € « sur devis » n'est pas une gratuité :
                                // la course reste à chiffrer, et le total
                                // affiché ne la comprend donc pas.
                                <span className="text-warning-700">à chiffrer</span>
                              ) : amounts.deliveryFeeCents === 0 ? (
                                <span className="text-success-600">offerte</span>
                              ) : (
                                formatDeliveryFee(amounts.deliveryFeeCents)
                              )}
                            </p>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-sm">{formatDate(order.deliveryDate)}</span>
                      </Td>
                      <Td>
                        <span className="text-xs text-gray-500">{order.timeSlot}</span>
                      </Td>
                      <Td>
                        {status ? (
                          <Badge variant={status.variant}>{status.label}</Badge>
                        ) : (
                          <Badge variant="neutral">{order.status}</Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          {nextStatus && nextLabel && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ order, status: nextStatus })}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              {nextLabel}
                            </Button>
                          )}
                          {/* PENDING ou CANCELLED uniquement (ORDER_DELETABLE) :
                              au-delà, la commande est adossée à une tournée et
                              à une facture. */}
                          <DeleteAction
                            endpoint={`/orders/${order.id}`}
                            itemLabel={`la commande ${order.orderNumber}`}
                            title="Supprimer cette commande ?"
                            description={`La commande ${order.orderNumber} (${order.user.name}) sera supprimée. Cette action n'est pas réversible depuis l'admin.`}
                            successMessage="Commande supprimée"
                            disabledReason={
                              ORDER_DELETABLE.includes(order.status) ? null : DELETE_BLOCKED.order
                            }
                            scopes={["order"]}
                          />
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={pagination?.total ?? 0}
              label="commandes"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Même formulaire que la fiche client, sans clientId → sélecteur intégré */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvelle commande"
        className="max-w-2xl"
      >
        <OrderForm
          onCancel={() => setCreateOpen(false)}
          onSuccess={(order) => {
            setCreateOpen(false);
            router.push(`/commandes/${order.id}`);
          }}
        />
      </Modal>

      {/* Proposition de devis, juste après le passage en « Confirmée » */}
      <QuoteFromOrderPrompt order={quotePrompt} onClose={() => setQuotePrompt(null)} />
    </>
  );
}
