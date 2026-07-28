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
import { Receipt, FileText } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import type { PaginatedResponse, InvoiceDTO, InvoiceStatus } from "@/lib/types";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

export const INVOICE_STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: "Brouillon", variant: "neutral" },
  SENT: { label: "Envoyée", variant: "info" },
  PAID: { label: "Payée", variant: "success" },
  OVERDUE: { label: "En retard", variant: "danger" },
  CANCELLED: { label: "Annulée", variant: "warning" },
  REFUNDED: { label: "Remboursée", variant: "warning" },
};

const statusOptions = [
  { value: "", label: "Tous les statuts" },
  ...(Object.keys(INVOICE_STATUS_CONFIG) as InvoiceStatus[]).map((s) => ({
    value: s,
    label: INVOICE_STATUS_CONFIG[s].label,
  })),
];

/** Millésimes proposés au filtre : l'année courante et les quatre précédentes. */
const currentYear = new Date().getFullYear();
const yearOptions = [
  { value: "", label: "Toutes les années" },
  ...Array.from({ length: 5 }, (_, i) => {
    const y = String(currentYear - i);
    return { value: y, label: y };
  }),
];

export default function FacturesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
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
    queryKey: ["invoices", page, statusFilter, yearFilter, searchDebounced],
    queryFn: () =>
      api.getRaw<PaginatedResponse<InvoiceDTO>>("/invoices", {
        page,
        limit: 25,
        status: statusFilter || undefined,
        year: yearFilter || undefined,
        search: searchDebounced || undefined,
      }),
  });

  const invoices = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = Boolean(search || statusFilter || yearFilter);

  return (
    <>
      <Header title="Factures" />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full max-w-xs">
              <SearchInput
                placeholder="Numéro, nom ou email client..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => handleSearch("")}
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
            <div className="w-36">
              <Select
                options={yearOptions}
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrer par année"
              />
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchDebounced("");
                  setStatusFilter("");
                  setYearFilter("");
                  setPage(1);
                }}
                className="text-xs text-primary-600 hover:underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
          {pagination && <p className="text-sm text-gray-500">{pagination.total} factures</p>}
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-12 w-12" />}
            title={hasFilters ? "Aucune facture trouvée" : "Aucune facture"}
            description={
              hasFilters
                ? "Essayez de modifier vos filtres."
                : "Les factures se créent depuis un devis envoyé ou accepté."
            }
            action={
              hasFilters ? undefined : (
                <Link href="/devis">
                  <Button size="sm">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Voir les devis
                  </Button>
                </Link>
              )
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
                  <Th>Émise le</Th>
                  <Th>Échéance</Th>
                </tr>
              </Thead>
              <tbody>
                {invoices.map((invoice) => {
                  const sc = INVOICE_STATUS_CONFIG[invoice.status];
                  const clientLabel = invoice.clientNom ?? invoice.user?.name ?? "—";
                  const clientEmail = invoice.clientEmail ?? invoice.user?.email;
                  return (
                    <Tr key={invoice.id} onClick={() => router.push(`/factures/${invoice.id}`)}>
                      <Td>
                        <span className="font-mono text-sm font-semibold text-gray-900">
                          {invoice.invoiceNumber}
                        </span>
                        {invoice.quote && (
                          <span className="ml-2 font-mono text-xs text-gray-400">
                            ← {invoice.quote.numero}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <div>
                          <p className="font-medium text-gray-900">{clientLabel}</p>
                          {clientEmail && <p className="text-xs text-gray-500">{clientEmail}</p>}
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={sc.variant}>{sc.label}</Badge>
                      </Td>
                      <Td>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {formatPrice(invoice.totalTtcCents)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-sm text-gray-600">
                          {formatDate(invoice.createdAt)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-sm text-gray-600">{formatDate(invoice.dueDate)}</span>
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
              label="factures"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
