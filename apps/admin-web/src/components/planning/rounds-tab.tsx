"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailText } from "@/components/ui/email-text";
import { DAY_LABELS, addDays, dayKey, dayKeyFromISO } from "@/lib/calendar";
import type { PaginatedResponse } from "@/lib/types";

/**
 * Tournée telle que la renvoie `GET /deliveries/rounds` (liste).
 *
 * Deux pièges corrigés ici, qui faisaient planter l'écran dès qu'une tournée
 * existait : `driver` est un OBJET (l'afficher directement levait « Objects are
 * not valid as a React child »), et la liste ne contient PAS les arrêts mais
 * seulement leur compte dans `_count.stops`.
 */
interface RoundListItem {
  id: string;
  date: string;
  status: RoundStatus;
  driver: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  _count?: { stops: number };
}

/** Statuts Prisma — renvoyés en MAJUSCULES. */
type RoundStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type StopStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "FAILED";

/** Arrêt tel que le renvoie `GET /deliveries/rounds/:id` (triés par stopOrder). */
interface RoundStop {
  id: string;
  stopOrder: number;
  status: StopStatus;
  setsToDeliver: number;
  specialInstructions: string | null;
  client: { id: string; name: string; address: string | null; phone: string | null } | null;
}

interface RoundDetail extends RoundListItem {
  notes: string | null;
  stops: RoundStop[];
}

interface RoundsResponse {
  data: RoundListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ClientOption {
  id: string;
  name: string;
  companyName?: string | null;
  email: string | null;
  zoneId?: string | null;
}

const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  PLANNED: "Planifiée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

const ROUND_STATUS_VARIANT: Record<RoundStatus, "success" | "info" | "neutral" | "danger"> = {
  PLANNED: "neutral",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  PENDING: "À faire",
  COMPLETED: "Fait",
  SKIPPED: "Sauté",
  FAILED: "Échec",
};

const STOP_STATUS_VARIANT: Record<StopStatus, "success" | "neutral" | "warning" | "danger"> = {
  PENDING: "neutral",
  COMPLETED: "success",
  SKIPPED: "warning",
  FAILED: "danger",
};

function statusBadge(status: string) {
  const key = status as RoundStatus;
  return (
    <Badge variant={ROUND_STATUS_VARIANT[key] ?? "neutral"}>
      {ROUND_STATUS_LABELS[key] ?? status}
    </Badge>
  );
}

function weekDates(offset: number): Date[] {
  const today = new Date();
  const weekday = today.getDay();
  const monday = addDays(today, (weekday === 0 ? -6 : 1 - weekday) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function RoundsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: "",
    driverId: "",
    clientIds: [] as string[],
    setsByClient: {} as Record<string, number>,
  });

  const days = useMemo(() => weekDates(weekOffset), [weekOffset]);

  const { data: roundsData, isLoading } = useQuery({
    queryKey: ["deliveries", "rounds", weekOffset],
    queryFn: () =>
      // getRaw : même piège que commandes/stock — la grille était toujours vide.
      api.getRaw<RoundsResponse>("/deliveries/rounds", {
        from: dayKey(days[0] ?? new Date()),
        to: dayKey(days[6] ?? new Date()),
        limit: 100,
      }),
  });

  // Mémoïsé : `?? []` crée un tableau neuf à chaque rendu, ce qui invaliderait
  // en boucle les useMemo qui en dépendent.
  const rounds = useMemo(() => roundsData?.data ?? [], [roundsData]);

  // `pageSize` n'existe pas dans le zod de l'API : il était silencieusement
  // ignoré et la liste retombait sur le défaut (20 clients). Le paramètre
  // s'appelle `limit`, plafonné à 100 côté schéma.
  const { data: clientsData } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => api.getRaw<PaginatedResponse<ClientOption>>("/clients", { page: 1, limit: 100 }),
  });
  const clients = useMemo(() => clientsData?.data ?? [], [clientsData]);

  // Le formulaire demandait un nom de chauffeur en texte libre, alors que l'API
  // exige l'identifiant d'un utilisateur LIVREUR : la création échouait donc
  // toujours en 400. On propose les livreurs réels.
  const { data: driversData } = useQuery({
    queryKey: ["users", "livreurs"],
    queryFn: () =>
      api.getRaw<PaginatedResponse<{ id: string; name: string }>>("/users", {
        role: "LIVREUR",
        limit: 100,
      }),
  });
  const drivers = driversData?.data ?? [];

  // Le détail (arrêts, adresses) n'est PAS dans la liste : seul
  // `GET /rounds/:id` renvoie les stops, déjà triés par ordre de passage.
  const { data: roundDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["deliveries", "round", selectedRoundId],
    queryFn: () => api.get<RoundDetail>(`/deliveries/rounds/${selectedRoundId}`),
    enabled: Boolean(selectedRoundId),
  });

  /**
   * Zone de la tournée : déduite des clients sélectionnés quand ils partagent
   * tous la même. Le champ n'était jamais envoyé, si bien qu'aucune tournée
   * n'était rattachée à sa zone. En cas de zones mélangées on n'invente rien.
   */
  const derivedZoneId = useMemo(() => {
    const zones = new Set(
      form.clientIds
        .map((id) => clients.find((c) => c.id === id)?.zoneId)
        .filter((z): z is string => Boolean(z)),
    );
    return zones.size === 1 ? [...zones][0] : undefined;
  }, [form.clientIds, clients]);

  const createMutation = useMutation({
    mutationFn: () =>
      // Le schéma attend `driverId` et un tableau `stops` structuré, pas une
      // liste d'identifiants clients. L'ordre d'arrêt suit l'ordre de sélection.
      api.post("/deliveries/rounds", {
        date: form.date,
        driverId: form.driverId,
        zoneId: derivedZoneId,
        stops: form.clientIds.map((clientId, i) => ({
          clientId,
          stopOrder: i + 1,
          setsToDeliver: form.setsByClient[clientId] ?? 0,
        })),
      }),
    onSuccess: () => {
      toast("Tournée créée");
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      setCreateOpen(false);
      setForm({ date: "", driverId: "", clientIds: [], setsByClient: {} });
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : "Erreur lors de la création", "error"),
  });

  const roundsByDay = useMemo(() => {
    const map: Record<string, RoundListItem[]> = {};
    for (const round of rounds) {
      const key = dayKeyFromISO(round.date);
      (map[key] ??= []).push(round);
    }
    return map;
  }, [rounds]);

  const toggleClient = (clientId: string) => {
    setForm((prev) => ({
      ...prev,
      clientIds: prev.clientIds.includes(clientId)
        ? prev.clientIds.filter((id) => id !== clientId)
        : [...prev.clientIds, clientId],
    }));
  };

  const today = dayKey(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setWeekOffset(weekOffset - 1)}
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700">
            Semaine du {(days[0] ?? new Date()).toLocaleDateString("fr-FR")} au{" "}
            {(days[6] ?? new Date()).toLocaleDateString("fr-FR")}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setWeekOffset(weekOffset + 1)}
            aria-label="Semaine suivante"
          >
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

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : rounds.length === 0 ? (
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
          {days.map((date, idx) => {
            const key = dayKey(date);
            const dayRounds = roundsByDay[key] ?? [];
            const isToday = key === today;
            return (
              <div
                key={key}
                className={`min-h-[140px] rounded-xl border p-3 ${
                  isToday ? "border-primary-300 bg-primary-50/30" : "border-gray-200 bg-white"
                }`}
              >
                <p
                  className={`mb-2 text-xs font-semibold ${isToday ? "text-primary-600" : "text-gray-500"}`}
                >
                  {DAY_LABELS[idx]} {date.getDate()}/{date.getMonth() + 1}
                </p>
                <div className="space-y-1.5">
                  {dayRounds.length === 0 && (
                    <p className="text-xs text-gray-300">Aucune tournée</p>
                  )}
                  {dayRounds.map((round) => {
                    const stopsCount = round._count?.stops ?? 0;
                    return (
                      <button
                        key={round.id}
                        onClick={() => setSelectedRoundId(round.id)}
                        className="w-full rounded-lg bg-gray-50 p-2 text-left text-xs hover:bg-gray-100"
                      >
                        <span className="block font-medium text-gray-800">
                          {round.driver?.name ?? "Livreur non assigné"}
                        </span>
                        <span className="block text-gray-500">
                          {stopsCount} arrêt{stopsCount > 1 ? "s" : ""}
                          {round.zone ? ` · ${round.zone.name}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-gray-700"
              htmlFor="planning-driver"
            >
              Livreur
            </label>
            <select
              id="planning-driver"
              value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
              required
              className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:min-h-0 sm:text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Choisir un livreur…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {drivers.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Aucun livreur enregistré. Créez-en un dans Utilisateurs.
              </p>
            )}
          </div>
          <div>
            {/* Intitulé d'un GROUPE de cases à cocher : pas un <label> (il ne
                pointe vers aucun champ unique) mais le nom du groupe. */}
            <span
              id="planning-clients-label"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Clients ({form.clientIds.length} sélectionné{form.clientIds.length > 1 ? "s" : ""})
            </span>
            <div
              role="group"
              aria-labelledby="planning-clients-label"
              className="max-h-48 overflow-y-auto rounded-md border border-gray-300 p-2"
            >
              {clients.length === 0 ? (
                <p className="p-2 text-xs text-gray-400">Aucun client disponible</p>
              ) : (
                clients.map((c) => (
                  <label
                    key={c.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.clientIds.includes(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="h-5 w-5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="min-w-0 truncate text-sm text-gray-700">
                      {c.companyName ?? c.name}
                    </span>
                    <EmailText email={c.email} className="text-xs text-gray-400" />
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Kits à déposer par arrêt — le champ était codé en dur à 0, chaque
              tournée partait donc avec « rien à livrer ». */}
          {form.clientIds.length > 0 && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Kits à déposer par arrêt
              </span>
              <ul className="space-y-2">
                {form.clientIds.map((clientId) => {
                  const client = clients.find((c) => c.id === clientId);
                  const inputId = `sets-${clientId}`;
                  return (
                    <li key={clientId} className="flex items-center gap-3">
                      <label
                        htmlFor={inputId}
                        className="min-w-0 flex-1 truncate text-sm text-gray-700"
                      >
                        {client?.companyName ?? client?.name ?? clientId}
                      </label>
                      <input
                        id={inputId}
                        type="number"
                        min={0}
                        value={form.setsByClient[clientId] ?? 0}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            setsByClient: {
                              ...prev.setsByClient,
                              [clientId]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            },
                          }))
                        }
                        className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-xs text-gray-500">
                {derivedZoneId
                  ? "Zone déduite des clients sélectionnés."
                  : "Zones différentes (ou non renseignées) : la tournée sera créée sans zone."}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={form.clientIds.length === 0 || !form.driverId}
            >
              Créer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal détail tournée */}
      <Modal
        open={Boolean(selectedRoundId)}
        onClose={() => setSelectedRoundId(null)}
        title={`Tournée — ${roundDetail?.driver?.name ?? ""}`}
        className="max-w-xl"
      >
        {detailLoading || !roundDetail ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-gray-500">Date : </span>
                <span className="font-medium">
                  {new Date(roundDetail.date).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Statut : </span>
                {statusBadge(roundDetail.status)}
              </div>
              {roundDetail.zone && (
                <div>
                  <span className="text-gray-500">Zone : </span>
                  <span className="font-medium">{roundDetail.zone.name}</span>
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                Arrêts ({roundDetail.stops.length})
              </h4>
              <div className="space-y-2">
                {roundDetail.stops.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun arrêt</p>
                ) : (
                  roundDetail.stops.map((stop) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                        {stop.stopOrder}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {stop.client?.name ?? "Client supprimé"}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {stop.client?.address ?? "Adresse non renseignée"}
                        </p>
                        <p className="text-xs text-gray-400">{stop.setsToDeliver} kit(s)</p>
                      </div>
                      <Badge variant={STOP_STATUS_VARIANT[stop.status] ?? "neutral"}>
                        {STOP_STATUS_LABELS[stop.status] ?? stop.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
