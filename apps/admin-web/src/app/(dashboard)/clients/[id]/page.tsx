"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "next/navigation";
import { useState } from "react";

interface ClientStock {
  productRange: string;
  cleanSets: number;
  dirtySets: number;
  totalInCirculation: number;
}

interface ClientSubscription {
  plan: string;
  status: string;
}

interface ClientDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  accommodationType: string;
  isActive: boolean;
  zoneId: string;
  stockAlertThreshold: number;
  notes: string;
  subscription: ClientSubscription | null;
  stocks: ClientStock[];
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  product: {
    name: string;
    range: string;
    category: string;
  };
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
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface OrdersResponse {
  data: Order[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const rangeBadgeVariant: Record<string, "info" | "default" | "warning"> = {
  CONFORT: "info",
  HOTEL: "default",
  PRESTIGE: "warning",
};

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  PENDING: { label: "En attente", variant: "warning" },
  CONFIRMED: { label: "Confirmée", variant: "info" },
  IN_DELIVERY: { label: "En livraison", variant: "info" },
  DELIVERED: { label: "Livrée", variant: "success" },
  CANCELLED: { label: "Annulée", variant: "danger" },
  ACTIVE: { label: "Actif", variant: "success" },
  PAUSED: { label: "En pause", variant: "warning" },
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

function GaugeBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">
          {value} / {max}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-200">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => api.get<ClientDetail>(`/clients/${id}`),
  });

  const { data: ordersData } = useQuery({
    queryKey: ["orders", "client", id],
    queryFn: () => api.get<OrdersResponse>("/orders", { userId: id, pageSize: 50 }),
    enabled: !!client,
  });

  const orders = ordersData?.data ?? [];

  const [notes, setNotes] = useState<string | null>(null);

  const notesMutation = useMutation({
    mutationFn: (newNotes: string) => api.patch(`/clients/${id}`, { notes: newNotes }),
    onSuccess: () => {
      toast("Notes mises à jour");
      queryClient.invalidateQueries({ queryKey: ["client", id] });
    },
    onError: () => toast("Erreur lors de la mise à jour", "error"),
  });

  if (isLoading) {
    return (
      <>
        <Header title="Client" />
        <div className="space-y-6 p-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!client) {
    return (
      <>
        <Header title="Client" />
        <div className="flex items-center justify-center p-12 text-gray-400">Client introuvable</div>
      </>
    );
  }

  const currentNotes = notes ?? client.notes ?? "";

  return (
    <>
      <Header title={client.name} />

      <div className="space-y-6 p-6">
        {/* Informations client */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Informations" className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium">{client.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Téléphone</p>
                <p className="text-sm font-medium">{client.phone || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Type d&apos;hébergement</p>
                <p className="text-sm font-medium">{client.accommodationType}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Zone</p>
                <p className="text-sm font-medium">{client.zoneId || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Seuil d&apos;alerte stock</p>
                <p className="text-sm font-medium">{client.stockAlertThreshold}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Statut</p>
                <Badge variant={client.isActive ? "success" : "neutral"}>
                  {client.isActive ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Jauges de stock */}
          <Card title="Niveaux de stock">
            {client.stocks.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun stock enregistré</p>
            ) : (
              <div className="space-y-5">
                {client.stocks.map((stock, idx) => (
                  <div key={idx}>
                    <div className="mb-2">
                      <Badge variant={rangeBadgeVariant[stock.productRange] ?? "neutral"}>
                        {stock.productRange}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <GaugeBar
                        label="Propres"
                        value={stock.cleanSets}
                        max={stock.totalInCirculation}
                        color="bg-success-500"
                      />
                      <GaugeBar
                        label="Sales"
                        value={stock.dirtySets}
                        max={stock.totalInCirculation}
                        color="bg-warning-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Abonnement */}
        {client.subscription && (
          <Card title="Abonnement">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500">Formule</p>
                <Badge variant={rangeBadgeVariant[client.subscription.plan] ?? "neutral"}>
                  {client.subscription.plan}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Statut</p>
                {(() => {
                  const s = statusConfig[client.subscription.status];
                  return (
                    <Badge variant={s?.variant ?? "neutral"}>
                      {s?.label ?? client.subscription.status}
                    </Badge>
                  );
                })()}
              </div>
            </div>
          </Card>
        )}

        {/* Historique des commandes */}
        <Card title="Historique des commandes">
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune commande</p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>N° Commande</Th>
                  <Th>Date livraison</Th>
                  <Th>Produits</Th>
                  <Th>Statut</Th>
                  <Th>Total</Th>
                </tr>
              </Thead>
              <tbody>
                {orders.map((order) => {
                  const s = statusConfig[order.status];
                  return (
                    <Tr key={order.id}>
                      <Td className="font-medium">{order.orderNumber}</Td>
                      <Td>{formatDate(order.deliveryDate)}</Td>
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
                        <Badge variant={s?.variant ?? "neutral"}>
                          {s?.label ?? order.status}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="font-semibold">{formatPrice(order.totalCents)}</span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Notes */}
        <Card
          title="Notes"
          actions={
            <Button
              size="sm"
              loading={notesMutation.isPending}
              onClick={() => notesMutation.mutate(currentNotes)}
              disabled={currentNotes === (client.notes ?? "")}
            >
              Enregistrer
            </Button>
          }
        >
          <textarea
            rows={4}
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Notes internes sur ce client..."
          />
        </Card>
      </div>
    </>
  );
}
