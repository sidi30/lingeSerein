"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

interface RoundStop {
  id: string;
  clientName: string;
  address: string;
  order: number;
  status: string;
}

interface Round {
  id: string;
  date: string;
  driver: string;
  status: string;
  stops: RoundStop[];
}

interface RoundsResponse {
  data: Round[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface ClientOption {
  id: string;
  name: string;
  email: string;
}

interface ClientsResponse {
  data: ClientOption[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

function statusBadge(s: string) {
  switch (s) {
    case "completed":
      return <Badge variant="success">Terminée</Badge>;
    case "in_progress":
      return <Badge variant="info">En cours</Badge>;
    default:
      return <Badge variant="neutral">Planifiée</Badge>;
  }
}

export default function PlanningPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [form, setForm] = useState({ date: "", driver: "", clientIds: [] as string[] });

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const { data: roundsData, isLoading } = useQuery({
    queryKey: ["deliveries", "rounds", weekOffset],
    queryFn: () =>
      api.get<RoundsResponse>("/deliveries/rounds", {
        startDate: dateKey(weekDates[0] ?? new Date()),
        endDate: dateKey(weekDates[6] ?? new Date()),
      }),
  });

  const rounds = roundsData?.data ?? [];

  // Fetch clients for multi-select
  const { data: clientsData } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => api.get<ClientsResponse>("/clients", { pageSize: 200 }),
  });

  const clients = clientsData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/deliveries/rounds", {
        date: form.date,
        driver: form.driver,
        clientIds: form.clientIds,
      }),
    onSuccess: () => {
      toast("Tournée créée");
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      setCreateOpen(false);
      setForm({ date: "", driver: "", clientIds: [] });
    },
    onError: () => toast("Erreur lors de la création", "error"),
  });

  const roundsByDate = useMemo(() => {
    const map: Record<string, Round[]> = {};
    rounds.forEach((r) => {
      const key = (r.date.split("T")[0]) ?? "";
      if (!map[key]) map[key] = [];
      (map[key] as Round[]).push(r);
    });
    return map;
  }, [rounds]);

  const hasAnyRounds = rounds.length > 0;

  const toggleClient = (clientId: string) => {
    setForm((prev) => ({
      ...prev,
      clientIds: prev.clientIds.includes(clientId)
        ? prev.clientIds.filter((id) => id !== clientId)
        : [...prev.clientIds, clientId],
    }));
  };

  return (
    <>
      <Header title="Planning" />

      <div className="space-y-6 p-6">
        {/* Navigation semaine */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setWeekOffset(weekOffset - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-gray-700">
              Semaine du {(weekDates[0] ?? new Date()).toLocaleDateString("fr-FR")} au{" "}
              {(weekDates[6] ?? new Date()).toLocaleDateString("fr-FR")}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                Aujourd&apos;hui
              </Button>
            )}
          </div>
          <Button onClick={() => setCreateOpen(true)}>+ Nouvelle tournée</Button>
        </div>

        {/* Calendrier hebdomadaire */}
        {isLoading ? (
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : !hasAnyRounds ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
            <CalendarDays className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-sm font-semibold text-gray-900">Aucune tournée cette semaine</h3>
            <p className="mt-1 text-sm text-gray-500">
              Planifiez votre première tournée de livraison pour cette semaine.
            </p>
            <div className="mt-4">
              <Button onClick={() => setCreateOpen(true)}>Créer une tournée</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {weekDates.map((date, idx) => {
              const key = dateKey(date);
              const dayRounds = roundsByDate[key] ?? [];
              const isToday = dateKey(new Date()) === key;
              return (
                <div
                  key={key}
                  className={`min-h-[140px] rounded-xl border p-3 ${
                    isToday ? "border-primary-300 bg-primary-50/30" : "border-gray-200 bg-white"
                  }`}
                >
                  <p className={`mb-2 text-xs font-semibold ${isToday ? "text-primary-600" : "text-gray-500"}`}>
                    {dayNames[idx]} {date.getDate()}/{date.getMonth() + 1}
                  </p>
                  <div className="space-y-1.5">
                    {dayRounds.length === 0 && (
                      <p className="text-xs text-gray-300">Aucune tournée</p>
                    )}
                    {dayRounds.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRound(r)}
                        className="w-full rounded-lg bg-gray-50 p-2 text-left text-xs hover:bg-gray-100"
                      >
                        <p className="font-medium text-gray-800">{r.driver}</p>
                        <p className="text-gray-500">{r.stops.length} arrêt{r.stops.length > 1 ? "s" : ""}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal création de tournée */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle tournée">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <Input
            label="Chauffeur"
            value={form.driver}
            onChange={(e) => setForm({ ...form, driver: e.target.value })}
            placeholder="Nom du chauffeur"
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Clients ({form.clientIds.length} sélectionné{form.clientIds.length > 1 ? "s" : ""})
            </label>
            <div className="max-h-48 overflow-y-auto rounded-md border border-gray-300 p-2">
              {clients.length === 0 ? (
                <p className="p-2 text-xs text-gray-400">Aucun client disponible</p>
              ) : (
                clients.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.clientIds.includes(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{c.name}</span>
                    <span className="text-xs text-gray-400">{c.email}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={createMutation.isPending} disabled={form.clientIds.length === 0}>
              Créer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal détail tournée */}
      <Modal
        open={!!selectedRound}
        onClose={() => setSelectedRound(null)}
        title={`Tournée — ${selectedRound?.driver ?? ""}`}
        className="max-w-xl"
      >
        {selectedRound && (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-gray-500">Date : </span>
                <span className="font-medium">
                  {new Date(selectedRound.date).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Statut : </span>
                {statusBadge(selectedRound.status)}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                Arrêts ({selectedRound.stops.length})
              </h4>
              <div className="space-y-2">
                {selectedRound.stops.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun arrêt</p>
                ) : (
                  selectedRound.stops.map((stop) => (
                    <div key={stop.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                        {stop.order}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{stop.clientName}</p>
                        <p className="text-xs text-gray-500">{stop.address}</p>
                      </div>
                      <Badge variant={stop.status === "completed" ? "success" : "neutral"}>
                        {stop.status === "completed" ? "Fait" : "À faire"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
