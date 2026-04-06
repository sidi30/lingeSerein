"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface SubscriptionProduct {
  quantity: number;
  product: {
    name: string;
    range: string;
    priceCents: number;
  };
}

interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    accommodationType: string;
  };
  products: SubscriptionProduct[];
}

interface SubscriptionsResponse {
  data: Subscription[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const planOptions = [
  { value: "", label: "Toutes les formules" },
  { value: "ESSENTIELLE", label: "Essentielle" },
  { value: "CONFORT", label: "Confort" },
  { value: "PRESTIGE", label: "Prestige" },
];

const statusOptions = [
  { value: "", label: "Tous les statuts" },
  { value: "ACTIVE", label: "Actif" },
  { value: "PAUSED", label: "En pause" },
  { value: "CANCELLED", label: "Résilié" },
  { value: "TRIAL", label: "Essai" },
];

const planBadgeVariant: Record<string, "info" | "default" | "warning"> = {
  ESSENTIELLE: "neutral" as "info",
  CONFORT: "info",
  HOTEL: "default",
  PRESTIGE: "warning",
};

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  ACTIVE: { label: "Actif", variant: "success" },
  PAUSED: { label: "En pause", variant: "warning" },
  CANCELLED: { label: "Résilié", variant: "danger" },
  TRIAL: { label: "Essai", variant: "info" },
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function calculateMonthly(products: SubscriptionProduct[]): number {
  return products.reduce((sum, p) => sum + p.quantity * p.product.priceCents, 0);
}

export default function AbonnementsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions", page, statusFilter, planFilter, search],
    queryFn: () =>
      api.get<SubscriptionsResponse>("/subscriptions", {
        page,
        pageSize: 20,
        status: statusFilter || undefined,
        plan: planFilter || undefined,
        search: search || undefined,
      }),
  });

  const subscriptions = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = !!(search || statusFilter || planFilter);

  return (
    <>
      <Header title="Abonnements" />

      <div className="space-y-4 p-6">
        {/* Filtres */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full max-w-xs">
            <SearchInput
              placeholder="Rechercher un abonnement..."
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
              options={planOptions}
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-40">
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPlanFilter("");
                setPage(1);
              }}
              className="text-xs text-primary-600 hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            icon={<RefreshCw className="h-12 w-12" />}
            title={hasFilters ? "Aucun abonnement trouvé" : "Aucun abonnement"}
            description={hasFilters ? "Essayez de modifier vos filtres." : "Les abonnements de vos clients apparaîtront ici."}
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Formule</Th>
                  <Th>Statut</Th>
                  <Th>Période</Th>
                  <Th>Produits</Th>
                  <Th>Montant/mois</Th>
                </tr>
              </Thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const status = statusConfig[sub.status] ?? { label: sub.status, variant: "neutral" as const };
                  const monthlyCents = calculateMonthly(sub.products);

                  return (
                    <Tr key={sub.id}>
                      <Td>
                        <div>
                          <p className="font-medium text-gray-900">{sub.user.name}</p>
                          <p className="text-xs text-gray-500">{sub.user.email}</p>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={planBadgeVariant[sub.plan] ?? "neutral"}>
                          {sub.plan}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          <p className="text-gray-700">{formatDate(sub.currentPeriodStart)}</p>
                          <p className="text-gray-400">au {formatDate(sub.currentPeriodEnd)}</p>
                        </div>
                      </Td>
                      <Td>
                        <div className="space-y-0.5">
                          {sub.products.map((p, idx) => (
                            <p key={idx} className="text-xs text-gray-600">
                              {p.quantity}x {p.product.name}
                            </p>
                          ))}
                        </div>
                      </Td>
                      <Td>
                        <span className="font-semibold text-gray-900">{formatPrice(monthlyCents)}</span>
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
              label="abonnements"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
