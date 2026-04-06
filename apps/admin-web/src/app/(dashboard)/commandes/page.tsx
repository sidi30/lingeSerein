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
import { useState } from "react";
import { ClipboardList, ArrowRight } from "lucide-react";

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
  totalCents: number;
  deliveryDate: string;
  timeSlot: string;
  specialNotes: string | null;
  items: OrderItem[];
  user: { id: string; name: string; email: string };
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

const statusConfig: Record<OrderStatus, { label: string; variant: "warning" | "info" | "default" | "success" | "danger" }> = {
  PENDING: { label: "En attente", variant: "warning" },
  CONFIRMED: { label: "Confirmée", variant: "info" },
  IN_DELIVERY: { label: "En livraison", variant: "default" },
  DELIVERED: { label: "Livrée", variant: "success" },
  CANCELLED: { label: "Annulée", variant: "danger" },
};

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
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["orders", page, statusFilter, search],
    queryFn: () =>
      api.get<OrdersResponse>("/orders", {
        page,
        pageSize: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
  });

  const orders = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      toast("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: () => toast("Erreur lors de la mise à jour", "error"),
  });

  return (
    <>
      <Header title="Commandes" />

      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full max-w-xs">
            <SearchInput
              placeholder="N° commande ou client..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onClear={() => { setSearch(""); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            />
          </div>
          {(search || statusFilter) && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); }} className="text-xs text-primary-600 hover:underline">
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
            description={search || statusFilter ? "Essayez de modifier vos filtres." : "Les commandes de vos clients apparaîtront ici."}
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
                          <p className="text-xs text-gray-500">{order.user.email}</p>
                        </div>
                      </Td>
                      <Td>
                        <div className="space-y-0.5">
                          {order.items.map((item) => (
                            <p key={item.id} className="text-xs text-gray-600">{item.quantity}x {item.product.name}</p>
                          ))}
                        </div>
                      </Td>
                      <Td><span className="font-semibold text-gray-900">{formatPrice(order.totalCents)}</span></Td>
                      <Td><span className="text-sm">{formatDate(order.deliveryDate)}</span></Td>
                      <Td><span className="text-xs text-gray-500">{order.timeSlot}</span></Td>
                      <Td>
                        {status ? <Badge variant={status.variant}>{status.label}</Badge> : <Badge variant="neutral">{order.status}</Badge>}
                      </Td>
                      <Td>
                        {nextStatus && nextLabel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: order.id, status: nextStatus })}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            {nextLabel}
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>

            <Pagination page={page} totalPages={totalPages} total={pagination?.total ?? 0} label="commandes" onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
