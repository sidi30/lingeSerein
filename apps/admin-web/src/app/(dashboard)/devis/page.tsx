"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Plus, FileText } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import type { PaginatedResponse, QuoteDTO, QuoteStatus } from "@/lib/types";
import { QUOTE_TRANSITIONS } from "@lingengo/shared";

const statusOptions = [
  { value: "", label: "Tous les statuts" },
  { value: "BROUILLON", label: "Brouillon" },
  { value: "ENVOYE", label: "Envoyé" },
  { value: "ACCEPTE", label: "Accepté" },
  { value: "REFUSE", label: "Refusé" },
  { value: "EXPIRE", label: "Expiré" },
];

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const statusConfig: Record<QuoteStatus, { label: string; variant: BadgeVariant }> = {
  BROUILLON: { label: "Brouillon", variant: "neutral" },
  ENVOYE: { label: "Envoyé", variant: "info" },
  ACCEPTE: { label: "Accepté", variant: "success" },
  REFUSE: { label: "Refusé", variant: "danger" },
  EXPIRE: { label: "Expiré", variant: "warning" },
};

// Vérifie si un devis est "expirant" (envoyé depuis > 25 j sur validité 30j)
function isExpiringSoon(
  quote: Partial<QuoteDTO> & {
    dateEnvoi: string | null;
    validiteJours: number;
    status: QuoteStatus;
  },
): boolean {
  if (quote.status !== "ENVOYE" || !quote.dateEnvoi) return false;
  const sent = new Date(quote.dateEnvoi).getTime();
  const expires = sent + quote.validiteJours * 24 * 60 * 60 * 1000;
  const remaining = (expires - Date.now()) / (1000 * 60 * 60 * 24);
  return remaining < 5 && remaining > 0;
}

export default function DevisListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce 300ms
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    const t = setTimeout(() => {
      setSearchDebounced(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["quotes", page, statusFilter, searchDebounced],
    queryFn: () =>
      api.getRaw<PaginatedResponse<QuoteDTO>>("/quotes", {
        page,
        limit: 25,
        status: statusFilter || undefined,
        search: searchDebounced || undefined,
      }),
  });

  const quotes = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;

  return (
    <>
      <Header
        title="Devis"
        actions={
          <Link href="/devis/nouveau">
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau devis
            </Button>
          </Link>
        }
      />

      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full max-w-xs">
              <SearchInput
                placeholder="Numéro, nom ou email client..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => {
                  handleSearch("");
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
                aria-label="Filtrer par statut"
              />
            </div>
            {(search || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchDebounced("");
                  setStatusFilter("");
                  setPage(1);
                }}
                className="text-xs text-primary-600 hover:underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
          {pagination && (
            <p className="text-sm text-gray-500">
              {pagination.total} devis{pagination.total > 1 ? "" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : quotes.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title={search || statusFilter ? "Aucun devis trouvé" : "Aucun devis"}
            description={
              search || statusFilter
                ? "Essayez de modifier vos filtres."
                : "Créez votre premier devis pour un client."
            }
            action={
              <Link href="/devis/nouveau">
                <Button size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nouveau devis
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>Numéro</Th>
                  <Th>Client</Th>
                  <Th>Statut</Th>
                  <Th>Total TTC</Th>
                  <Th>Date</Th>
                  <Th>Validité</Th>
                </tr>
              </Thead>
              <tbody>
                {quotes.map((quote) => {
                  const sc = statusConfig[quote.status];
                  const expiring = isExpiringSoon(quote);
                  const nextStatuses = QUOTE_TRANSITIONS[quote.status];
                  return (
                    <Tr key={quote.id} onClick={() => router.push(`/devis/${quote.id}`)}>
                      <Td>
                        <span className="font-mono text-sm font-semibold text-gray-900">
                          {quote.numero}
                        </span>
                      </Td>
                      <Td>
                        <div>
                          <p className="font-medium text-gray-900">{quote.clientNom}</p>
                          {quote.clientEmail && (
                            <p className="text-xs text-gray-500">{quote.clientEmail}</p>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                          {expiring && <Badge variant="warning">Expire bientôt</Badge>}
                          {quote.convertedToOrderId && <Badge variant="success">Converti</Badge>}
                        </div>
                      </Td>
                      <Td>
                        <span className="font-semibold text-gray-900">
                          {formatPrice(quote.totals?.totalTTC ?? 0)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-sm text-gray-600">{formatDate(quote.createdAt)}</span>
                      </Td>
                      <Td>
                        <span className="text-xs text-gray-500">
                          {quote.validiteJours} j
                          {nextStatuses.length === 0 && (
                            <span className="ml-1 text-gray-400">(terminal)</span>
                          )}
                        </span>
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
              label="devis"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
