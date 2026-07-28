"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { SUBSCRIPTION_DEFAULTS } from "@lingengo/shared";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleUnavailable } from "@/components/ui/module-unavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { RotationCalendar, type CalendarMode } from "@/components/planning/rotation-calendar";
import { RotationDetail } from "@/components/planning/rotation-detail";
import { RoundsTab } from "@/components/planning/rounds-tab";
import { addDays, dayKey, monthGrid, nextSevenDays } from "@/lib/calendar";
import {
  ROTATION_STATUSES,
  ROTATION_STATUS_LABELS,
  rotationEvents,
  useRotations,
  type RotationDTO,
  type RotationStatus,
} from "@/lib/rotations";

type Tab = "calendrier" | "tournees";

export default function PlanningPage() {
  const [tab, setTab] = useState<Tab>("calendrier");
  const [mode, setMode] = useState<CalendarMode>("mois");
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [status, setStatus] = useState<RotationStatus | "">("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RotationDTO | null>(null);

  /**
   * Fenêtre demandée à l'API.
   *
   * Deux subtilités :
   * - la grille mensuelle déborde sur les semaines voisines, on part donc de sa
   *   première case et non du 1er du mois ;
   * - côté API, `from`/`to` filtrent sur la date de REPRISE prévue. Une
   *   livraison visible en fin de grille dont la reprise tombe le mois suivant
   *   serait donc absente. On étend la borne haute de la durée de détention
   *   maximale (14 j, Pack Sérénité) : toute rotation livrée dans la grille est
   *   alors forcément ramenée. La borne basse n'a pas ce problème, une reprise
   *   est toujours postérieure à sa livraison.
   */
  const range = useMemo(() => {
    const days =
      mode === "semaine" ? nextSevenDays() : monthGrid(month.getFullYear(), month.getMonth());
    const start = days[0] ?? month;
    const end = days[days.length - 1] ?? addDays(month, 41);
    return {
      from: dayKey(start),
      to: dayKey(addDays(end, SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS)),
    };
  }, [mode, month]);

  const { rotations, available, isLoading, error } = useRotations({
    from: range.from,
    to: range.to,
    status: status || undefined,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rotations;
    return rotations.filter(
      (r) =>
        r.clientNom.toLowerCase().includes(needle) ||
        (r.clientAdresse ?? "").toLowerCase().includes(needle),
    );
  }, [rotations, search]);

  const events = useMemo(() => rotationEvents(filtered), [filtered]);

  const enRetard = useMemo(
    () => filtered.filter((r) => r.status === "EN_RETARD" || r.joursDeRetard > 0).length,
    [filtered],
  );

  return (
    <>
      <Header title="Planning" />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Onglets */}
        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {(
            [
              ["calendrier", "Calendrier des rotations"],
              ["tournees", "Tournées"],
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

        {tab === "tournees" ? (
          <RoundsTab />
        ) : (
          <div className="space-y-4">
            {/* Filtres */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="rotation-search"
                  className="mb-1 block text-xs font-medium text-gray-700"
                >
                  Rechercher un client
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    id="rotation-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom ou adresse…"
                    className="min-h-11 w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-base sm:min-h-0 sm:text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="sm:w-56">
                <label
                  htmlFor="rotation-status"
                  className="mb-1 block text-xs font-medium text-gray-700"
                >
                  Statut
                </label>
                <select
                  id="rotation-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RotationStatus | "")}
                  className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:min-h-0 sm:text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Tous les statuts</option>
                  {ROTATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ROTATION_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {enRetard > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="danger">
                  {enRetard} reprise{enRetard > 1 ? "s" : ""} en retard
                </Badge>
                <span className="text-xs text-gray-500">sur la période affichée</span>
              </div>
            )}

            {!available && (
              <ModuleUnavailable
                title="Module rotations pas encore disponible"
                description="Le serveur ne propose pas encore /rotations. Le calendrier s'affichera dès que l'API sera déployée ; l'onglet Tournées reste utilisable."
              />
            )}

            {error && available && (
              <ModuleUnavailable
                title="Impossible de charger les rotations"
                description={error.message}
              />
            )}

            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <>
                <RotationCalendar
                  events={events}
                  mode={mode}
                  onModeChange={setMode}
                  month={month}
                  onMonthChange={setMonth}
                  onSelectEvent={(event) => setSelected(event.rotation)}
                />

                {available && filtered.length === 0 && (
                  <EmptyState
                    icon={<CalendarDays className="h-12 w-12" />}
                    title="Aucune rotation sur cette période"
                    description={
                      search
                        ? "Aucun client ne correspond à cette recherche."
                        : "Les livraisons et reprises apparaîtront ici dès qu'une commande sera livrée."
                    }
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <RotationDetail rotation={selected} onClose={() => setSelected(null)} />
    </>
  );
}
