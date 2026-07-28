"use client";

/**
 * Liste des factures — groupée par client, brouillons isolés.
 *
 * Deux décisions structurent cet écran :
 *
 * 1. Les brouillons vivent dans leur propre onglet. Un brouillon n'est pas une
 *    facture : ce n'est pas une pièce comptable, il n'est dû par personne, et
 *    le mélanger aux factures émises fausse la lecture du « reste à encaisser ».
 * 2. Les factures sont regroupées par client. La question posée à cet écran est
 *    « où en est ce client ? », pas « quelle est la dernière facture émise ».
 *
 * L'exclusion des brouillons est faite par le SERVEUR (`?excludeStatus=DRAFT`) :
 * le total et la pagination restent donc exacts. Le compte de brouillons du
 * badge vient d'un appel séparé `status=DRAFT&limit=1` dont on ne lit que
 * `pagination.total` — une ligne transférée, pas la liste.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Thead, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { DeleteAction } from "@/components/ui/delete-action";
import { ChevronDown, ChevronRight, Receipt, FileText } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import type { PaginatedResponse, InvoiceDTO, InvoiceStatus } from "@/lib/types";
import { useClampedPage } from "@/lib/use-clamped-page";

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

/** Statuts proposés au filtre de l'onglet « Émises » — DRAFT en est exclu :
 *  il a son propre onglet, le proposer ici recréerait le mélange qu'on défait. */
const ISSUED_STATUSES: InvoiceStatus[] = ["SENT", "PAID", "OVERDUE", "CANCELLED", "REFUNDED"];

const issuedStatusOptions = [
  { value: "", label: "Tous les statuts" },
  ...ISSUED_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_CONFIG[s].label })),
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

/** Statuts qui pèsent sur le « reste à encaisser » : la facture est partie chez
 *  le client et n'est pas payée. Une annulée ou une remboursée ne doit rien. */
const DUE_STATUSES: InvoiceStatus[] = ["SENT", "OVERDUE"];

/** Fenêtre large : le regroupement par client n'a de sens que si les factures
 *  d'un même client tombent dans la même page. 100 = maximum accepté par l'API. */
const PAGE_SIZE = 100;

interface InvoiceGroup {
  key: string;
  clientLabel: string;
  clientEmail: string | null;
  userId: string | null;
  invoices: InvoiceDTO[];
  dueCents: number;
  totalCents: number;
}

function groupByClient(invoices: InvoiceDTO[]): InvoiceGroup[] {
  const groups = new Map<string, InvoiceGroup>();

  for (const invoice of invoices) {
    // Une facture est un snapshot : le client peut ne pas exister dans `users`
    // (devis saisi à la volée). On se rabat donc sur l'email puis sur le nom,
    // sinon deux factures du même client atterriraient dans deux groupes.
    const label = invoice.clientNom ?? invoice.user?.name ?? "Client non renseigné";
    const email = invoice.clientEmail ?? invoice.user?.email ?? null;
    const key = invoice.userId ?? email ?? label;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        clientLabel: label,
        clientEmail: email,
        userId: invoice.userId,
        invoices: [],
        dueCents: 0,
        totalCents: 0,
      };
      groups.set(key, group);
    }

    group.invoices.push(invoice);
    group.totalCents += invoice.totalTtcCents;
    if (DUE_STATUSES.includes(invoice.status)) group.dueCents += invoice.totalTtcCents;
  }

  // Les clients qui doivent de l'argent remontent : c'est l'information qui
  // appelle une action. À égalité, on classe par montant facturé.
  return [...groups.values()].sort(
    (a, b) => b.dueCents - a.dueCents || b.totalCents - a.totalCents,
  );
}

function StatusCounts({ invoices }: { invoices: InvoiceDTO[] }) {
  const counts = new Map<InvoiceStatus, number>();
  for (const inv of invoices) counts.set(inv.status, (counts.get(inv.status) ?? 0) + 1);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[...counts.entries()].map(([status, count]) => {
        const sc = INVOICE_STATUS_CONFIG[status];
        return (
          <Badge key={status} variant={sc.variant}>
            {count} {sc.label.toLowerCase()}
          </Badge>
        );
      })}
    </div>
  );
}

export default function FacturesListPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"issued" | "drafts">("issued");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  // Écart au pli par défaut, par groupe. Le défaut lui-même dépend du nombre de
  // groupes : à deux clients, tout replier n'aiderait personne.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [collapseAll, setCollapseAll] = useState<boolean | null>(null);

  // Debounce 300ms
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    const t = setTimeout(() => {
      setSearchDebounced(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const isDrafts = tab === "drafts";

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", tab, page, statusFilter, yearFilter, searchDebounced],
    queryFn: () =>
      api.getRaw<PaginatedResponse<InvoiceDTO>>("/invoices", {
        page,
        limit: PAGE_SIZE,
        // `status` (filtre positif) l'emporte côté API sur `excludeStatus` :
        // les deux ne sont donc jamais envoyés en même temps utilement.
        status: isDrafts ? "DRAFT" : statusFilter || undefined,
        excludeStatus: !isDrafts && !statusFilter ? "DRAFT" : undefined,
        year: yearFilter || undefined,
        search: searchDebounced || undefined,
      }),
  });

  // Compte des brouillons pour le badge d'onglet : une seule ligne demandée, on
  // ne lit que `pagination.total`.
  const { data: draftsMeta } = useQuery({
    queryKey: ["invoices", "drafts-count", yearFilter, searchDebounced],
    queryFn: () =>
      api.getRaw<PaginatedResponse<InvoiceDTO>>("/invoices", {
        page: 1,
        limit: 1,
        status: "DRAFT",
        year: yearFilter || undefined,
        search: searchDebounced || undefined,
      }),
  });

  const draftsTotal = draftsMeta?.pagination?.total ?? 0;
  const pagination = data?.pagination;

  // Plus de filtrage côté client : `excludeStatus` fait le tri côté serveur,
  // donc le total et la pagination sont exacts dans les deux onglets.
  const groups = useMemo(() => groupByClient(data?.data ?? []), [data]);

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  useClampedPage(page, totalPages, setPage);
  const hasFilters = Boolean(search || statusFilter || yearFilter);

  const defaultExpanded = collapseAll === null ? groups.length <= 8 : !collapseAll;
  const isExpanded = (key: string) => toggled[key] ?? defaultExpanded;

  const switchTab = (next: "issued" | "drafts") => {
    setTab(next);
    setPage(1);
    // Le filtre de statut n'a pas de sens dans l'onglet brouillons : le laisser
    // actif ferait revenir une liste vide sans raison visible.
    if (next === "drafts") setStatusFilter("");
  };

  return (
    <>
      <Header title="Factures" />

      <div className="space-y-4 p-4 sm:p-6">
        {/* ─── Onglets : les brouillons ne polluent plus la vue principale ─── */}
        <div
          className="flex gap-1 rounded-lg bg-gray-100 p-1"
          role="tablist"
          aria-label="Type de factures"
        >
          {(
            [
              { id: "issued", label: "Émises", count: total },
              { id: "drafts", label: "Brouillons", count: draftsTotal },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTab(t.id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-0 sm:py-2 ${
                tab === t.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  tab === t.id ? "bg-primary-50 text-primary-600" : "bg-gray-200 text-gray-600"
                }`}
              >
                {t.id === "issued" ? total : draftsTotal}
              </span>
            </button>
          ))}
        </div>

        {isDrafts && (
          <p className="text-sm text-gray-500">
            Un brouillon n&apos;a pas été émis : il n&apos;est dû par personne et ne compte pas dans
            votre comptabilité. C&apos;est le seul état où une facture peut encore être supprimée.
          </p>
        )}

        {/* ─── Filtres ─── */}
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
            {!isDrafts && (
              <div className="w-44">
                <Select
                  options={issuedStatusOptions}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filtrer par statut"
                />
              </div>
            )}
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
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {total} facture{total > 1 ? "s" : ""} · {groups.length} client
              {groups.length > 1 ? "s" : ""}
            </p>
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setCollapseAll(defaultExpanded);
                  setToggled({});
                }}
                className="text-xs text-primary-600 hover:underline"
              >
                {defaultExpanded ? "Tout replier" : "Tout déplier"}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-12 w-12" />}
            title={
              hasFilters
                ? "Aucune facture trouvée"
                : isDrafts
                  ? "Aucun brouillon"
                  : "Aucune facture émise"
            }
            description={
              hasFilters
                ? "Essayez de modifier vos filtres."
                : isDrafts
                  ? "Les brouillons apparaîtront ici avant d'être émis."
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
            <div className="space-y-3">
              {groups.map((group) => {
                const expanded = isExpanded(group.key);
                const panelId = `factures-groupe-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                return (
                  <section
                    key={group.key}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setToggled((prev) => ({ ...prev, [group.key]: !expanded }))}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      {expanded ? (
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{group.clientLabel}</p>
                        {group.clientEmail && (
                          <p className="truncate text-xs text-gray-500">{group.clientEmail}</p>
                        )}
                      </div>
                      <div className="hidden sm:block">
                        <StatusCounts invoices={group.invoices} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-500">
                          {isDrafts ? "Total brouillons" : "Reste dû"}
                        </p>
                        <p
                          className={`font-bold tabular-nums ${
                            !isDrafts && group.dueCents > 0 ? "text-danger-600" : "text-gray-900"
                          }`}
                        >
                          {formatPrice(isDrafts ? group.totalCents : group.dueCents)}
                        </p>
                      </div>
                    </button>

                    {expanded && (
                      <div id={panelId} className="border-t border-gray-100">
                        <div className="px-2 pb-2 sm:hidden">
                          <StatusCounts invoices={group.invoices} />
                        </div>
                        {/* Table brut plutôt que le composant `Table` : celui-ci
                            porte sa propre bordure et ses coins arrondis, qui
                            feraient un cadre dans le cadre à l'intérieur du
                            groupe (et que des classes d'annulation ne
                            gagneraient pas de façon fiable, l'ordre des
                            utilitaires Tailwind ne se pilotant pas depuis
                            l'attribut class). */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <Thead>
                              <tr>
                                <Th>Numéro</Th>
                                <Th>Statut</Th>
                                <Th>Total TTC</Th>
                                <Th>Émise le</Th>
                                <Th>Échéance</Th>
                                <Th className="text-right">Actions</Th>
                              </tr>
                            </Thead>
                            <tbody>
                              {group.invoices.map((invoice) => {
                                const sc = INVOICE_STATUS_CONFIG[invoice.status];
                                return (
                                  <Tr
                                    key={invoice.id}
                                    onClick={() => router.push(`/factures/${invoice.id}`)}
                                  >
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
                                      <span className="text-sm text-gray-600">
                                        {formatDate(invoice.dueDate)}
                                      </span>
                                    </Td>
                                    <Td className="text-right">
                                      {/* Seul un brouillon est supprimable
                                        (INVOICE_DELETABLE = ["DRAFT"]). Au-delà,
                                        la conservation est une obligation légale :
                                        le bouton est désactivé et le dit. */}
                                      <DeleteAction
                                        endpoint={`/invoices/${invoice.id}`}
                                        itemLabel={`la facture ${invoice.invoiceNumber}`}
                                        title="Supprimer ce brouillon ?"
                                        description={`Le brouillon ${invoice.invoiceNumber} sera supprimé. Aucune écriture comptable n'existe pour un brouillon : rien d'autre n'est affecté.`}
                                        successMessage="Brouillon supprimé"
                                        disabledReason={
                                          invoice.status === "DRAFT"
                                            ? null
                                            : "Une facture émise est une pièce comptable : sa conservation est obligatoire (10 ans). Annulez-la plutôt, depuis sa fiche."
                                        }
                                        scopes={["invoice"]}
                                      />
                                    </Td>
                                  </Tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              label="factures"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
