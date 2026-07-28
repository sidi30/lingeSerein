"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ModuleUnavailable } from "@/components/ui/module-unavailable";
import { useState } from "react";
import {
  isLowStock,
  lowStockThreshold,
  useStockBySlug,
  useUpdateStockOwned,
  type StockItemDTO,
} from "@/lib/rotations";

interface OperatorStock {
  id: string;
  operatorId: string;
  productRange: string;
  cleanAvailable: number;
  dirtyPending: number;
  inCirculation: number;
  retired: number;
}

interface ClientStockItem {
  id: string;
  userId: string;
  productRange: string;
  cleanSets: number;
  dirtySets: number;
  totalInCirculation: number;
}

interface ClientStockEntry {
  id: string;
  name: string;
  email: string | null;
  accommodationType: string;
  zoneId: string;
  stockAlertThreshold: number;
  stocks: ClientStockItem[];
}

interface ClientStockResponse {
  data: ClientStockEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const rangeBadgeVariant: Record<string, "default" | "info" | "warning"> = {
  CONFORT: "info",
  HOTEL: "default",
  PRESTIGE: "warning",
};

const adjustTypeOptions = [
  { value: "clean", label: "Propres" },
  { value: "dirty", label: "Sales" },
  { value: "retired", label: "Retirés" },
];

function stockRatioColor(clean: number, total: number): string {
  if (total === 0) return "bg-gray-300";
  const ratio = clean / total;
  if (ratio >= 0.5) return "bg-success-500";
  if (ratio >= 0.25) return "bg-warning-500";
  return "bg-danger-500";
}

function stockRatioTextColor(clean: number, total: number): string {
  if (total === 0) return "text-gray-500";
  const ratio = clean / total;
  if (ratio >= 0.5) return "text-success-600";
  if (ratio >= 0.25) return "text-warning-600";
  return "text-danger-600";
}

type StockTab = "articles" | "legacy";

export default function StockPage() {
  const [tab, setTab] = useState<StockTab>("articles");

  return (
    <>
      <Header title="Stock" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {(
            [
              ["articles", "Par article"],
              ["legacy", "Par gamme (ancien)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`-mb-px min-h-11 border-b-2 px-3 text-sm font-medium transition-colors sm:px-4 ${
                tab === value
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "articles" ? <StockByArticle /> : <LegacyStock />}
      </div>
    </>
  );
}

/* ─── Vue par article du catalogue (9 slugs) ─── */

function StockByArticle() {
  const { items, available, isLoading, error } = useStockBySlug();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!available) {
    return (
      <ModuleUnavailable
        title="Stock par article pas encore disponible"
        description="Le serveur ne propose pas encore GET /stock par référence du catalogue. La vue « Par gamme » reste utilisable en attendant."
      />
    );
  }

  if (error) {
    return <ModuleUnavailable title="Impossible de charger le stock" description={error.message} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucun article suivi"
        description="Renseignez le parc possédé de chaque référence pour suivre les disponibilités."
      />
    );
  }

  const alertes = items.filter(isLowStock).length;

  return (
    <div className="space-y-4">
      {alertes > 0 && (
        <div className="rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-600">
          {alertes} référence{alertes > 1 ? "s" : ""} sous le seuil d&apos;alerte.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ArticleStockCard key={item.productSlug} item={item} />
        ))}
      </div>
    </div>
  );
}

function ArticleStockCard({ item }: { item: StockItemDTO }) {
  const { toast } = useToast();
  const updateOwned = useUpdateStockOwned();
  const [owned, setOwned] = useState(String(item.totalOwned));

  const parsedOwned = parseInt(owned, 10);
  const dirty = Number.isFinite(parsedOwned) && parsedOwned !== item.totalOwned;
  const low = isLowStock(item);
  const seuil = lowStockThreshold(item);
  const inputId = `owned-${item.productSlug}`;

  // `disponible` peut être NÉGATIF côté API — c'est le signal d'un parc
  // sur-engagé (plus de linge dehors qu'on n'en possède), volontairement non
  // borné. On le borne ici uniquement pour la largeur des segments.
  const total = Math.max(
    item.totalOwned,
    Math.max(item.disponible, 0) + item.inCirculation + item.dirtyPending + item.retired,
  );
  const pct = (n: number) => (total > 0 ? (Math.max(n, 0) / total) * 100 : 0);
  const surEngage = item.disponible < 0;

  const save = () => {
    if (!dirty) return;
    updateOwned.mutate(
      { productSlug: item.productSlug, totalOwned: parsedOwned },
      {
        onSuccess: () => toast("Parc mis à jour"),
        onError: (err: unknown) => {
          if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
            toast("La mise à jour du parc n'est pas encore disponible côté serveur.", "error");
            return;
          }
          toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour", "error");
        },
      },
    );
  };

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        low ? "border-warning-500/50" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">{item.name}</h3>
          <p className="truncate text-[11px] text-gray-400">{item.productSlug}</p>
        </div>
        {low && <Badge variant={item.disponible === 0 ? "danger" : "warning"}>Stock bas</Badge>}
      </div>

      {/* Le disponible est LE chiffre qui décide si on peut vendre. */}
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold tabular-nums ${
            item.disponible === 0
              ? "text-danger-600"
              : low
                ? "text-warning-600"
                : "text-success-600"
          }`}
        >
          {item.disponible}
        </span>
        <span className="text-xs text-gray-500">disponible{item.disponible > 1 ? "s" : ""}</span>
      </div>
      {surEngage && (
        <p className="mt-1 text-[11px] font-medium text-danger-600">
          Parc sur-engagé : il y a plus de linge dehors que le parc déclaré. Vérifiez le total
          possédé ou les reprises non enregistrées.
        </p>
      )}

      {/* Répartition du parc en une seule barre : le total se lit d'un coup. */}
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="bg-success-500" style={{ width: `${pct(item.disponible)}%` }} />
        <div className="bg-primary-500" style={{ width: `${pct(item.inCirculation)}%` }} />
        <div className="bg-warning-500" style={{ width: `${pct(item.dirtyPending)}%` }} />
        <div className="bg-gray-400" style={{ width: `${pct(item.retired)}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="En circulation" value={item.inCirculation} tone="text-primary-600" />
        <Metric label="Sale en attente" value={item.dirtyPending} tone="text-warning-600" />
        <Metric label="Retirés" value={item.retired} tone="text-gray-500" />
      </dl>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-gray-700">
          Parc total possédé
        </label>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="number"
            min={0}
            value={owned}
            onChange={(e) => setOwned(e.target.value)}
            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {dirty && (
            <Button size="sm" onClick={save} loading={updateOwned.isPending}>
              Enregistrer
            </Button>
          )}
          <span className="ml-auto text-[11px] text-gray-400">seuil d&apos;alerte : {seuil}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/* ─── Vue legacy par gamme (CONFORT / HOTEL / PRESTIGE) ─── */

function LegacyStock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: operatorStock, isLoading: opLoading } = useQuery({
    queryKey: ["stock", "operator"],
    queryFn: () => api.get<OperatorStock[]>("/stock/operator"),
  });

  const { data: clientStockData, isLoading: csLoading } = useQuery({
    queryKey: ["stock", "clients"],
    queryFn: () =>
      // getRaw : sans ca le tableau « Stock par client » restait vide, et le
      // selecteur de la modale d ajustement n avait aucun client a proposer.
      api.getRaw<ClientStockResponse>("/stock/clients"),
  });

  const clientStock = clientStockData?.data ?? [];

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    userId: "",
    type: "clean",
    quantity: 0,
    reason: "",
  });

  const adjustMutation = useMutation({
    mutationFn: () => api.post("/stock/adjustment", adjustForm),
    onSuccess: () => {
      toast("Ajustement enregistré");
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      setAdjustOpen(false);
      setAdjustForm({ userId: "", type: "clean", quantity: 0, reason: "" });
    },
    onError: () => toast("Erreur lors de l'ajustement", "error"),
  });

  const progressBar = (label: string, value: number, total: number, color: string) => {
    const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">{label}</span>
          <span className="text-xs font-medium text-gray-700">{value}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={`h-2 rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const clientOptions = clientStock.map((cs) => ({
    value: cs.id,
    label: cs.email ? `${cs.name} (${cs.email})` : cs.name,
  }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Ancien modèle par gamme, conservé le temps que tout le parc soit repris par référence du
        catalogue.
      </p>

      {/* Stock opérateur */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Stock opérateur par gamme</h2>
        {opLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (operatorStock ?? []).length === 0 ? (
          <EmptyState
            title="Aucun stock opérateur"
            description="Le stock sera visible après les premières livraisons."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(operatorStock ?? []).map((s) => {
              const total = s.cleanAvailable + s.dirtyPending + s.inCirculation + s.retired;
              return (
                <Card
                  key={s.id}
                  title={s.productRange}
                  actions={
                    <Badge variant={rangeBadgeVariant[s.productRange] ?? "neutral"}>
                      {s.productRange}
                    </Badge>
                  }
                >
                  <div className="space-y-3">
                    {progressBar("Propres disponibles", s.cleanAvailable, total, "bg-success-500")}
                    {progressBar("Sales en attente", s.dirtyPending, total, "bg-warning-500")}
                    {progressBar("En circulation", s.inCirculation, total, "bg-primary-500")}
                    {progressBar("Retirés", s.retired, total, "bg-gray-400")}
                    <div className="border-t border-gray-100 pt-2 text-center text-sm font-semibold text-gray-700">
                      Total : {total}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Stock par client */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Stock par client</h2>
        <Button onClick={() => setAdjustOpen(true)}>Ajustement manuel</Button>
      </div>

      {csLoading ? (
        <SkeletonTable rows={6} />
      ) : clientStock.length === 0 ? (
        <EmptyState
          title="Aucun stock client"
          description="Le stock de chaque client sera affiché ici."
        />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Client</Th>
              <Th>Type</Th>
              <Th>Gamme</Th>
              <Th>Propres</Th>
              <Th>Sales</Th>
              <Th>En circulation</Th>
              <Th>Seuil d&apos;alerte</Th>
              <Th>Niveau</Th>
            </tr>
          </Thead>
          <tbody>
            {clientStock.map((cs) =>
              cs.stocks.length > 0 ? (
                cs.stocks.map((stock) => {
                  const pct =
                    stock.totalInCirculation > 0
                      ? Math.round((stock.cleanSets / stock.totalInCirculation) * 100)
                      : 0;
                  // Le seuil était reçu de l'API mais n'apparaissait nulle part :
                  // impossible de savoir à partir de quand un client alerte.
                  const sousSeuil = stock.cleanSets <= cs.stockAlertThreshold;
                  return (
                    <Tr key={stock.id}>
                      <Td className="font-medium">{cs.name}</Td>
                      <Td>
                        <span className="text-xs text-gray-500">{cs.accommodationType}</span>
                      </Td>
                      <Td>
                        <Badge variant={rangeBadgeVariant[stock.productRange] ?? "neutral"}>
                          {stock.productRange}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="font-semibold text-success-600">{stock.cleanSets}</span>
                      </Td>
                      <Td>
                        <span className="font-semibold text-warning-600">{stock.dirtySets}</span>
                      </Td>
                      <Td className="font-semibold">{stock.totalInCirculation}</Td>
                      <Td>
                        <span
                          className={`text-xs font-medium ${sousSeuil ? "text-danger-600" : "text-gray-500"}`}
                        >
                          {cs.stockAlertThreshold}
                          {sousSeuil ? " (atteint)" : ""}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-gray-200">
                            <div
                              className={`h-2 rounded-full transition-all ${stockRatioColor(stock.cleanSets, stock.totalInCirculation)}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold ${stockRatioTextColor(stock.cleanSets, stock.totalInCirculation)}`}
                          >
                            {pct}%
                          </span>
                        </div>
                      </Td>
                    </Tr>
                  );
                })
              ) : (
                <Tr key={cs.id}>
                  <Td className="font-medium">{cs.name}</Td>
                  <Td>
                    <span className="text-xs text-gray-500">{cs.accommodationType}</span>
                  </Td>
                  <Td colSpan={6}>
                    <span className="text-xs text-gray-400">Aucun stock</span>
                  </Td>
                </Tr>
              ),
            )}
          </tbody>
        </Table>
      )}

      {/* Modal ajustement */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ajustement de stock">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            adjustMutation.mutate();
          }}
          className="space-y-4"
        >
          <Select
            label="Client"
            options={clientOptions}
            placeholder="Sélectionner un client"
            value={adjustForm.userId}
            onChange={(e) => setAdjustForm({ ...adjustForm, userId: e.target.value })}
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Type"
              options={adjustTypeOptions}
              value={adjustForm.type}
              onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}
            />
            <Input
              label="Quantité (+/-)"
              type="number"
              value={adjustForm.quantity}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, quantity: parseInt(e.target.value) || 0 })
              }
              required
            />
          </div>
          <Input
            label="Raison"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            placeholder="Raison de l'ajustement..."
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAdjustOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={adjustMutation.isPending}>
              Appliquer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
