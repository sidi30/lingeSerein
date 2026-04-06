"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Users } from "lucide-react";

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

interface Client {
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

interface ClientsResponse {
  data: Client[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const rangeBadgeVariant: Record<string, "info" | "default" | "warning"> = {
  CONFORT: "info",
  HOTEL: "default",
  PRESTIGE: "warning",
};

const accommodationLabels: Record<string, string> = {
  HOTEL: "H\u00f4tel",
  GITE: "G\u00eete",
  AIRBNB: "Airbnb",
  AUBERGE: "Auberge",
  AUTRE: "Autre",
};

function stockLevelColor(clean: number, total: number): string {
  if (total === 0) return "bg-gray-300";
  const ratio = clean / total;
  if (ratio >= 0.5) return "bg-success-500";
  if (ratio >= 0.25) return "bg-warning-500";
  return "bg-danger-500";
}

function stockLevelTextColor(clean: number, total: number): string {
  if (total === 0) return "text-gray-500";
  const ratio = clean / total;
  if (ratio >= 0.5) return "text-success-600";
  if (ratio >= 0.25) return "text-warning-600";
  return "text-danger-600";
}

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", page, search],
    queryFn: () =>
      api.get<ClientsResponse>("/clients", { page, pageSize: 20, search: search || undefined }),
  });

  const clients = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;

  return (
    <>
      <Header title="Clients" />

      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full max-w-xs">
            <SearchInput
              placeholder="Rechercher un client..."
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
          <p className="text-sm text-gray-500">
            {pagination?.total ?? 0} client{(pagination?.total ?? 0) > 1 ? "s" : ""}
          </p>
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title={search ? "Aucun client trouvé" : "Aucun client enregistré"}
            description={search ? `Aucun résultat pour « ${search} »` : "Les clients apparaîtront ici après leur inscription."}
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>Nom</Th>
                  <Th>Email</Th>
                  <Th>Type</Th>
                  <Th>Gamme</Th>
                  <Th>Stock</Th>
                  <Th>Statut</Th>
                </tr>
              </Thead>
              <tbody>
                {clients.map((client) => {
                  const primaryStock = client.stocks.length > 0 ? client.stocks[0] : null;
                  const cleanSets = primaryStock?.cleanSets ?? 0;
                  const totalInCirculation = primaryStock?.totalInCirculation ?? 0;
                  const stockPct = totalInCirculation > 0 ? Math.round((cleanSets / totalInCirculation) * 100) : 0;

                  return (
                    <Tr key={client.id} onClick={() => router.push(`/clients/${client.id}`)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{client.name}</span>
                        </div>
                      </Td>
                      <Td><span className="text-gray-600">{client.email}</span></Td>
                      <Td>
                        <span className="text-sm text-gray-600">
                          {accommodationLabels[client.accommodationType] ?? client.accommodationType}
                        </span>
                      </Td>
                      <Td>
                        {primaryStock ? (
                          <Badge variant={rangeBadgeVariant[primaryStock.productRange] ?? "neutral"}>
                            {primaryStock.productRange}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">&mdash;</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-gray-200">
                            <div
                              className={`h-2 rounded-full transition-all ${stockLevelColor(cleanSets, totalInCirculation)}`}
                              style={{ width: `${Math.min(stockPct, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${stockLevelTextColor(cleanSets, totalInCirculation)}`}>
                            {stockPct}%
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={client.isActive ? "success" : "neutral"}>
                          {client.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>

            <Pagination page={page} totalPages={totalPages} total={pagination?.total ?? 0} label="clients" onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
