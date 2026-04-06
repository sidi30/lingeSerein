"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
import { useState } from "react";

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
  email: string;
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

export default function StockPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: operatorStock, isLoading: opLoading } = useQuery({
    queryKey: ["stock", "operator"],
    queryFn: () => api.get<OperatorStock[]>("/stock/operator"),
  });

  const { data: clientStockData, isLoading: csLoading } = useQuery({
    queryKey: ["stock", "clients"],
    queryFn: () => api.get<ClientStockResponse>("/stock/clients"),
  });

  const clientStock = clientStockData?.data ?? [];

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: "", type: "clean", quantity: 0, reason: "" });

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
    label: `${cs.name} (${cs.email})`,
  }));

  return (
    <>
      <Header title="Stock" />

      <div className="space-y-6 p-6">
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
            <EmptyState title="Aucun stock opérateur" description="Le stock sera visible après les premières livraisons." />
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
                <Th>Niveau</Th>
              </tr>
            </Thead>
            <tbody>
              {clientStock.map((cs) =>
                cs.stocks.length > 0 ? (
                  cs.stocks.map((stock) => {
                    const pct = stock.totalInCirculation > 0
                      ? Math.round((stock.cleanSets / stock.totalInCirculation) * 100)
                      : 0;
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
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 rounded-full bg-gray-200">
                              <div
                                className={`h-2 rounded-full transition-all ${stockRatioColor(stock.cleanSets, stock.totalInCirculation)}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold ${stockRatioTextColor(stock.cleanSets, stock.totalInCirculation)}`}>
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
                    <Td colSpan={5}>
                      <span className="text-xs text-gray-400">Aucun stock</span>
                    </Td>
                  </Tr>
                ),
              )}
            </tbody>
          </Table>
        )}
      </div>

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
          <div className="grid grid-cols-2 gap-4">
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
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: parseInt(e.target.value) || 0 })}
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
    </>
  );
}
