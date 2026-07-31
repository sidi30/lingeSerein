"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DAY_LABELS,
  dateFromKey,
  dayKey,
  monthGrid,
  monthLabel,
  nextSevenDays,
  shortDayLabel,
  todayKey,
} from "@/lib/calendar";
import { clientColor, clientInitials, clientKey } from "@/lib/client-colors";
import {
  detentionLanes,
  repriseUrgence,
  urgenceLabel,
  type DetentionBand,
  type RepriseUrgence,
} from "@/lib/planning-bands";
import {
  groupEventsByDay,
  type RotationDTO,
  type RotationEvent,
  ROTATION_STATUS_LABELS,
} from "@/lib/rotations";

export type CalendarMode = "mois" | "semaine";

/** Rails affichés dans une case du mois. Au-delà, un compteur « +N ». */
const MAX_RAILS_VISIBLES = 4;

/**
 * Ton visuel d'un événement.
 *
 * La couleur de la PUCE dit l'URGENCE, jamais l'identité : rouge quand
 * l'échéance est passée, orange le jour même, ambre pour les deux jours qui
 * suivent, lavande dans la semaine, gris au-delà, vert quand c'est rentré.
 * L'identité du client, elle, vit sur la bande de détention — deux canaux
 * séparés, sinon un mois chargé ne se lit plus.
 *
 * La livraison reste neutre : c'est un repère de contexte, pas une action.
 */
interface EventTone {
  chip: string;
  dot: string;
  label: string;
}

const URGENCE_TONES: Record<RepriseUrgence, Omit<EventTone, "label">> = {
  retard: {
    chip: "border-danger-500/50 bg-danger-50 text-danger-600",
    dot: "bg-danger-500",
  },
  aujourdhui: {
    chip: "border-warning-600/60 bg-warning-50 text-warning-600",
    dot: "bg-warning-600",
  },
  imminent: {
    chip: "border-warning-500/40 bg-warning-50/70 text-warning-600",
    dot: "bg-warning-500",
  },
  proche: {
    chip: "border-accent-500/40 bg-accent-50 text-accent-600",
    dot: "bg-accent-500",
  },
  planifie: {
    chip: "border-gray-200 bg-white text-gray-500",
    dot: "bg-gray-300",
  },
  faite: {
    chip: "border-success-500/30 bg-success-50 text-success-600",
    dot: "bg-success-500",
  },
};

export function eventTone(event: RotationEvent, today: string): EventTone {
  if (event.kind === "livraison") {
    return {
      chip: "border-gray-200 bg-gray-50 text-gray-600",
      dot: "bg-gray-400",
      label: event.done ? "Livraison faite" : "Livraison",
    };
  }
  const info = repriseUrgence(
    { dayKey: event.dayKey, done: event.done, lateDays: event.lateDays },
    today,
  );
  return { ...URGENCE_TONES[info.urgence], label: urgenceLabel(info) };
}

interface RotationCalendarProps {
  events: RotationEvent[];
  /** Rotations affichées — servent à tracer la période de détention. */
  rotations: RotationDTO[];
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  /** Mois affiché (1er du mois, heure locale). */
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelectEvent: (event: RotationEvent) => void;
}

export function RotationCalendar({
  events,
  rotations,
  mode,
  onModeChange,
  month,
  onMonthChange,
  onSelectEvent,
}: RotationCalendarProps) {
  const today = todayKey();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => groupEventsByDay(events), [events]);
  const lanes = useMemo(() => detentionLanes(rotations), [rotations]);
  const days = useMemo(
    () => (mode === "mois" ? monthGrid(month.getFullYear(), month.getMonth()) : nextSevenDays()),
    [mode, month],
  );

  const shiftMonth = (delta: number) =>
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  const dayEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Barre de navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {mode === "mois" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => shiftMonth(-1)}
                aria-label="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-gray-800">
                {monthLabel(month.getFullYear(), month.getMonth())}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => shiftMonth(1)}
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onMonthChange(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                }
              >
                Ce mois-ci
              </Button>
            </>
          ) : (
            <span className="text-sm font-semibold text-gray-800">Les 7 prochains jours</span>
          )}
        </div>

        <div className="inline-flex rounded-lg border border-gray-300 p-0.5" role="group">
          {(["mois", "semaine"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                onModeChange(m);
                setSelectedDay(null);
              }}
              className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors ${
                mode === m ? "bg-primary-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {m === "mois" ? "Mois" : "7 jours"}
            </button>
          ))}
        </div>
      </div>

      {mode === "mois" ? (
        <MonthView
          days={days}
          byDay={byDay}
          bandsByDay={lanes.byDay}
          laneCount={lanes.laneCount}
          today={today}
          currentMonth={month.getMonth()}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      ) : (
        <SevenDayView
          days={days}
          byDay={byDay}
          bandsByDay={lanes.byDay}
          today={today}
          onSelectEvent={onSelectEvent}
        />
      )}

      {/* Détail du jour cliqué — indispensable sur mobile où la case est trop
          étroite pour lister les rotations. */}
      {mode === "mois" && selectedDay && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {shortDayLabel(dateFromKey(selectedDay))}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
              Fermer
            </Button>
          </div>
          {dayEvents.length === 0 ? (
            <DayResidents bands={lanes.byDay.get(selectedDay) ?? []} />
          ) : (
            <ul className="space-y-2">
              {dayEvents.map((event) => (
                <li key={event.key}>
                  <EventRow event={event} today={today} onSelect={onSelectEvent} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Legend />
    </div>
  );
}

/**
 * Ce qui est chez un client ce jour-là, sans mouvement prévu.
 *
 * Un jour « vide » ne l'est pas vraiment : du linge y dort peut-être chez trois
 * clients. Le dire évite de conclure « rien à faire » alors que la détention
 * court — c'est elle qui porte le seuil des 7 ou 14 jours.
 */
function DayResidents({ bands }: { bands: DetentionBand[] }) {
  if (bands.length === 0) {
    return <p className="text-sm text-gray-400">Aucun mouvement, aucun linge en circulation.</p>;
  }
  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">
        Aucun mouvement ce jour-là. Linge encore chez le client :
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {bands.map((band) => {
          const color = clientColor(band.clientKey);
          return (
            <li
              key={band.rotationId}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs"
              style={{ backgroundColor: color.soft, borderColor: color.border, color: color.text }}
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ backgroundColor: color.solid }}
                aria-hidden="true"
              >
                {clientInitials(band.clientNom)}
              </span>
              {band.clientNom}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ViewProps {
  days: Date[];
  byDay: Map<string, RotationEvent[]>;
  bandsByDay: Map<string, DetentionBand[]>;
  today: string;
  onSelectEvent: (event: RotationEvent) => void;
}

/**
 * Bande de détention d'un jour.
 *
 * Les extrémités sont arrondies, le milieu est carré et déborde de la cellule
 * (`-mx-1.5`) : les cases étant collées, les segments se rejoignent et la bande
 * se lit comme une seule barre continue à travers la semaine. Le nom du client
 * n'est écrit que le premier jour, sinon il se répéterait sept fois.
 */
function BandSegment({
  band,
  compact,
  showLabel,
}: {
  band: DetentionBand;
  compact?: boolean;
  /** Nom écrit ici : au départ de la bande, et au retour à la ligne de la grille. */
  showLabel?: boolean;
}) {
  const color = clientColor(band.clientKey);
  const arrondi = `${band.start ? "rounded-l-full" : ""} ${band.end ? "rounded-r-full" : ""}`;

  return (
    <span
      className={`-mx-1.5 flex items-center gap-1 overflow-hidden ${arrondi} ${
        compact ? "h-1.5" : "h-3.5 px-0.5"
      } ${band.done ? "opacity-45" : ""}`}
      style={{
        backgroundColor: color.soft,
        // Le départ porte un liseré épais à la couleur pleine du client : c'est
        // le repère qui dit « ça commence ICI » sans lire une seule ligne.
        borderLeft: band.start ? `3px solid ${color.solid}` : "none",
        borderRight: band.end
          ? `3px solid ${band.late ? "var(--color-danger-500)" : color.solid}`
          : "none",
      }}
      title={`${band.clientNom} — linge chez le client`}
    >
      {!compact && showLabel && (
        <>
          <span
            className="ml-0.5 inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold leading-none text-white"
            style={{ backgroundColor: color.solid }}
            aria-hidden="true"
          >
            {clientInitials(band.clientNom).slice(0, 1)}
          </span>
          <span className="truncate text-[9px] font-medium" style={{ color: color.text }}>
            {band.clientNom}
          </span>
        </>
      )}
    </span>
  );
}

/** Rails d'un jour, y compris les rails vides : sans eux, les bandes se décalent. */
function DayBands({
  bands,
  laneCount,
  compact,
  debutDeLigne,
}: {
  bands: DetentionBand[];
  laneCount: number;
  compact?: boolean;
  /** Première colonne de la grille : la bande y reprend son nom. */
  debutDeLigne?: boolean;
}) {
  const rails = Math.min(laneCount, MAX_RAILS_VISIBLES);
  if (rails === 0) return null;
  const parLane = new Map(bands.map((b) => [b.lane, b]));
  const caches = bands.filter((b) => b.lane >= MAX_RAILS_VISIBLES).length;

  return (
    <span className={`mt-1 flex flex-col ${compact ? "gap-0.5" : "gap-[2px]"}`}>
      {Array.from({ length: rails }, (_, lane) => {
        const band = parLane.get(lane);
        return band ? (
          <BandSegment
            key={lane}
            band={band}
            compact={compact}
            showLabel={band.start || debutDeLigne}
          />
        ) : (
          <span key={lane} className={compact ? "h-1.5" : "h-3.5"} />
        );
      })}
      {caches > 0 && (
        <span className="text-[9px] leading-none text-gray-400">+{caches} en cours</span>
      )}
    </span>
  );
}

function MonthView({
  days,
  byDay,
  bandsByDay,
  laneCount,
  today,
  currentMonth,
  selectedDay,
  onSelectDay,
}: Omit<ViewProps, "onSelectEvent"> & {
  laneCount: number;
  currentMonth: number;
  selectedDay: string | null;
  onSelectDay: (key: string | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const key = dayKey(date);
          const dayEvents = byDay.get(key) ?? [];
          const bands = bandsByDay.get(key) ?? [];
          const isToday = key === today;
          const outside = date.getMonth() !== currentMonth;
          const isSelected = key === selectedDay;
          const aReprendre = dayEvents.filter((e) => e.kind === "reprise" && !e.done).length;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : key)}
              aria-label={`${shortDayLabel(date)} — ${dayEvents.length} mouvement${
                dayEvents.length > 1 ? "s" : ""
              }${aReprendre > 0 ? `, ${aReprendre} reprise${aReprendre > 1 ? "s" : ""} à faire` : ""}${
                bands.length > 0
                  ? `, ${bands.length} contrat${bands.length > 1 ? "s" : ""} en cours`
                  : ""
              }`}
              aria-pressed={isSelected}
              className={`min-h-[68px] overflow-hidden border-b border-r border-gray-100 p-1 text-left align-top transition-colors sm:min-h-[124px] sm:p-1.5 ${
                outside ? "bg-gray-50/60" : "bg-white"
              } ${isSelected ? "ring-2 ring-inset ring-primary-500" : "hover:bg-gray-50"}`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold sm:text-xs ${
                  isToday
                    ? "bg-primary-600 text-white"
                    : outside
                      ? "text-gray-300"
                      : "text-gray-700"
                }`}
              >
                {date.getDate()}
              </span>

              {/* Période de détention — l'identité du client, en fond. */}
              <span className="hidden sm:block">
                <DayBands bands={bands} laneCount={laneCount} debutDeLigne={date.getDay() === 1} />
              </span>
              <span className="sm:hidden">
                <DayBands bands={bands} laneCount={laneCount} compact />
              </span>

              {/* Mobile : pastilles d'urgence, la case est trop étroite pour du texte. */}
              <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {dayEvents.slice(0, 4).map((event) => (
                  <span
                    key={event.key}
                    className={`h-1.5 w-1.5 rounded-full ${eventTone(event, today).dot}`}
                  />
                ))}
              </span>

              {/* Desktop : puces lisibles. Volontairement NON cliquables :
                  imbriquer un bouton dans le bouton de la case casse le clavier
                  et la sémantique. On sélectionne le jour, le panneau en dessous
                  ouvre la rotation. */}
              <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                {dayEvents.slice(0, 2).map((event) => {
                  const tone = eventTone(event, today);
                  return (
                    <span
                      key={event.key}
                      className={`truncate rounded border px-1 py-0.5 text-[10px] font-medium ${tone.chip}`}
                    >
                      {event.kind === "reprise" ? "↩ " : "→ "}
                      {event.rotation.clientNom}
                      {event.late ? ` (+${event.lateDays}j)` : ""}
                    </span>
                  );
                })}
                {dayEvents.length > 2 && (
                  <span className="px-1 text-[10px] text-gray-400">
                    +{dayEvents.length - 2} autre{dayEvents.length - 2 > 1 ? "s" : ""}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SevenDayView({ days, byDay, bandsByDay, today, onSelectEvent }: ViewProps) {
  return (
    <div className="space-y-3">
      {days.map((date) => {
        const key = dayKey(date);
        const dayEvents = byDay.get(key) ?? [];
        const bands = bandsByDay.get(key) ?? [];
        const isToday = key === today;
        return (
          <div
            key={key}
            className={`rounded-xl border p-3 ${
              isToday ? "border-primary-300 bg-primary-50/30" : "border-gray-200 bg-white"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p
                className={`text-xs font-semibold capitalize ${isToday ? "text-primary-700" : "text-gray-500"}`}
              >
                {isToday ? "Aujourd'hui — " : ""}
                {shortDayLabel(date)}
              </p>
              {bands.length > 0 && (
                <p className="text-[11px] text-gray-400">
                  {bands.length} contrat{bands.length > 1 ? "s" : ""} en cours
                </p>
              )}
            </div>
            {dayEvents.length === 0 ? (
              bands.length === 0 ? (
                <p className="text-xs text-gray-300">Rien de prévu</p>
              ) : (
                <DayResidents bands={bands} />
              )
            ) : (
              <ul className="space-y-2">
                {dayEvents.map((event) => (
                  <li key={event.key}>
                    <EventRow event={event} today={today} onSelect={onSelectEvent} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventRow({
  event,
  today,
  onSelect,
}: {
  event: RotationEvent;
  today: string;
  onSelect: (event: RotationEvent) => void;
}) {
  const tone = eventTone(event, today);
  const Icon = event.kind === "reprise" ? PackageCheck : Truck;
  const color = clientColor(clientKey(event.rotation.userId, event.rotation.clientNom));
  const { dateLivraison, dateReprisePrevue } = event.rotation;

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-opacity hover:opacity-80 ${tone.chip}`}
    >
      {/* Pastille d'identité : la couleur du client, doublée de son monogramme
          pour rester lisible en noir et blanc comme pour un daltonien. */}
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: color.solid }}
        aria-hidden="true"
      >
        {clientInitials(event.rotation.clientNom)}
      </span>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.rotation.clientNom}</span>
        <span className="block truncate text-[11px] opacity-80">
          {tone.label} · {ROTATION_STATUS_LABELS[event.rotation.status]}
        </span>
        {/* La fenêtre du contrat, sur la ligne même : c'est elle qui dit depuis
            combien de temps le linge est dehors, donc s'il faut avancer la reprise. */}
        <span className="block truncate text-[11px] opacity-70">
          Livré le {frDate(dateLivraison)}
          {dateReprisePrevue ? ` · à reprendre le ${frDate(dateReprisePrevue)}` : ""}
        </span>
      </span>
      {event.late && (
        <span className="shrink-0 rounded-full bg-danger-500 px-2 py-0.5 text-[10px] font-bold text-white">
          +{event.lateDays} j
        </span>
      )}
    </button>
  );
}

/** `2026-08-05` → `05/08`. Le millésime n'apporte rien dans une vue calendrier. */
function frDate(iso: string | null): string {
  if (!iso) return "—";
  const [, mois, jour] = iso.slice(0, 10).split("-");
  return jour && mois ? `${jour}/${mois}` : iso;
}

function Legend() {
  const urgences: { dot: string; label: string }[] = [
    { dot: "bg-danger-500", label: "En retard" },
    { dot: "bg-warning-600", label: "À reprendre aujourd'hui" },
    { dot: "bg-warning-500", label: "Sous 48 h" },
    { dot: "bg-accent-500", label: "Dans la semaine" },
    { dot: "bg-gray-300", label: "Plus tard" },
    { dot: "bg-success-500", label: "Reprise faite" },
  ];

  return (
    <div className="space-y-1.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[11px] text-gray-500">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-semibold text-gray-600">Reprise :</span>
        {urgences.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-semibold text-gray-600">Bandes :</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-6 rounded-full bg-accent-100" aria-hidden="true" />
          période où le linge est chez le client — une couleur par client, de la livraison (→) à la
          reprise (↩)
        </span>
      </div>
    </div>
  );
}
