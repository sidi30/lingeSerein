"use client";

/**
 * Liste des clients (CRM).
 *
 * Mobile-first : cartes empilées en dessous de lg, tableau au-delà — un tableau
 * à 6 colonnes déborde forcément à 390px.
 */

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Download, Plus, Users } from "lucide-react";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
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
import { RatingStars } from "@/components/clients/rating-stars";
import { ClientCreateModal } from "@/components/clients/client-create-modal";
import { formatPrice } from "@/lib/format";
import {
  CLIENT_SOURCE_LABELS,
  type ClientListDTO,
  type ClientSource,
  type DeliveryZoneDTO,
  type PaginatedResponse,
} from "@/lib/types";

const statusOptions = [
  { value: "", label: "Tous les statuts" },
  { value: "active", label: "Actifs" },
  { value: "inactive", label: "Inactifs" },
];

const sourceOptions = [
  { value: "", label: "Toutes les origines" },
  ...(Object.keys(CLIENT_SOURCE_LABELS) as ClientSource[]).map((s) => ({
    value: s,
    label: CLIENT_SOURCE_LABELS[s],
  })),
];

function AccessBadge({ hasAppAccess }: { hasAppAccess: boolean }) {
  return hasAppAccess ? (
    <Badge variant="info">app</Badge>
  ) : (
    <Badge variant="neutral">hors-ligne</Badge>
  );
}

export default function ClientsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // La route /clients/export renvoie du text/csv, pas l'enveloppe JSON habituelle :
  // le client `api` la parserait en JSON et échouerait. On passe donc par fetch
  // direct, en réutilisant le même jeton d'authentification.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/clients/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Révocation différée : révoquer dans le même tick peut annuler le
      // téléchargement avant que le navigateur ait lu le blob.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export impossible", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    const t = setTimeout(() => {
      setSearchDebounced(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const { data: zones } = useQuery({
    queryKey: ["settings", "zones"],
    queryFn: () => api.get<DeliveryZoneDTO[]>("/settings/zones"),
  });

  const zoneOptions = [
    { value: "", label: "Toutes les zones" },
    ...(zones ?? []).map((z) => ({ value: z.id, label: z.name })),
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["clients", page, searchDebounced, statusFilter, zoneFilter, sourceFilter],
    queryFn: () =>
      api.getRaw<PaginatedResponse<ClientListDTO>>("/clients", {
        page,
        limit: 20,
        search: searchDebounced || undefined,
        status: statusFilter || undefined,
        zoneId: zoneFilter || undefined,
        source: sourceFilter || undefined,
      }),
  });

  const clients = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = !!(searchDebounced || statusFilter || zoneFilter || sourceFilter);

  const resetFilters = () => {
    setSearch("");
    setSearchDebounced("");
    setStatusFilter("");
    setZoneFilter("");
    setSourceFilter("");
    setPage(1);
  };

  return (
    <>
      <Header
        title="Clients"
        actions={
          <>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau client
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv} loading={exporting}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Exporter CSV
            </Button>
          </>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* ─── Filtres ─── */}
        <div className="space-y-3">
          <SearchInput
            placeholder="Établissement, ville, email, téléphone..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onClear={() => handleSearch("")}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select
              options={statusOptions}
              value={statusFilter}
              aria-label="Filtrer par statut"
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            />
            <Select
              options={zoneOptions}
              value={zoneFilter}
              aria-label="Filtrer par zone"
              onChange={(e) => {
                setZoneFilter(e.target.value);
                setPage(1);
              }}
            />
            <Select
              options={sourceOptions}
              value={sourceFilter}
              aria-label="Filtrer par origine"
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {pagination?.total ?? 0} client{(pagination?.total ?? 0) > 1 ? "s" : ""}
            </p>
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="min-h-11 px-2 text-xs text-primary-600 hover:underline sm:min-h-0"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title={hasFilters ? "Aucun client trouvé" : "Aucun client enregistré"}
            description={
              hasFilters
                ? "Essayez de modifier vos filtres."
                : "Créez votre premier client pour commencer."
            }
            action={<Button onClick={() => setCreateOpen(true)}>Nouveau client</Button>}
          />
        ) : (
          <>
            {/* ─── Cartes (mobile) ─── */}
            <ul className="space-y-3 lg:hidden">
              {clients.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/clients/${client.id}`)}
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">
                          {client.companyName ?? client.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {client.city ?? "Ville non renseignée"}
                        </p>
                      </div>
                      <AccessBadge hasAppAccess={client.hasAppAccess} />
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          {client.ordersCount} commande{client.ordersCount > 1 ? "s" : ""}
                        </p>
                        <p className="text-sm font-bold text-gray-900 tabular-nums">
                          {formatPrice(client.revenueCents)}
                        </p>
                      </div>
                      <RatingStars value={client.rating} size="sm" />
                    </div>

                    <div className="mt-2 border-t border-gray-100 pt-2">
                      <EmailText email={client.email} className="text-xs text-gray-500" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {/* ─── Tableau (desktop) ─── */}
            <div className="hidden lg:block">
              <Table>
                <Thead>
                  <tr>
                    <Th>Établissement</Th>
                    <Th>Ville</Th>
                    <Th>Commandes</Th>
                    <Th>CA</Th>
                    <Th>Accès</Th>
                    <Th>Note</Th>
                  </tr>
                </Thead>
                <tbody>
                  {clients.map((client) => (
                    <Tr key={client.id} onClick={() => router.push(`/clients/${client.id}`)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
                            {(client.companyName ?? client.name).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">
                              {client.companyName ?? client.name}
                            </p>
                            <EmailText email={client.email} className="text-xs text-gray-500" />
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-sm text-gray-600">
                          {client.city ?? <span className="text-gray-300">&mdash;</span>}
                        </span>
                      </Td>
                      <Td className="tabular-nums">{client.ordersCount}</Td>
                      <Td className="font-semibold tabular-nums">
                        {formatPrice(client.revenueCents)}
                      </Td>
                      <Td>
                        <AccessBadge hasAppAccess={client.hasAppAccess} />
                      </Td>
                      <Td>
                        <RatingStars value={client.rating} size="sm" />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={pagination?.total ?? 0}
              label="clients"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <ClientCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
