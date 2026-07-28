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
import { groupEventsByDay, type RotationEvent, ROTATION_STATUS_LABELS } from "@/lib/rotations";

export type CalendarMode = "mois" | "semaine";

/**
 * Ton visuel d'un événement. La reprise est ce que le propriétaire surveille :
 * elle porte la couleur d'état (à venir / aujourd'hui / en retard / faite).
 * La livraison reste neutre, c'est un repère de contexte.
 */
interface EventTone {
  chip: string;
  dot: string;
  label: string;
}

export function eventTone(event: RotationEvent, today: string): EventTone {
  if (event.kind === "livraison") {
    return {
      chip: "border-gray-200 bg-gray-50 text-gray-600",
      dot: "bg-gray-400",
      label: "Livraison",
    };
  }
  if (event.done) {
    return {
      chip: "border-success-500/30 bg-success-50 text-success-600",
      dot: "bg-success-500",
      label: "Reprise faite",
    };
  }
  if (event.late) {
    return {
      chip: "border-danger-500/40 bg-danger-50 text-danger-600",
      dot: "bg-danger-500",
      label: `En retard de ${event.lateDays} j`,
    };
  }
  if (event.dayKey === today) {
    return {
      chip: "border-primary-500/40 bg-primary-50 text-primary-700",
      dot: "bg-primary-500",
      label: "Reprise aujourd'hui",
    };
  }
  return {
    chip: "border-warning-500/30 bg-warning-50 text-warning-600",
    dot: "bg-warning-500",
    label: "Reprise à venir",
  };
}

interface RotationCalendarProps {
  events: RotationEvent[];
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  /** Mois affiché (1er du mois, heure locale). */
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelectEvent: (event: RotationEvent) => void;
}

export function RotationCalendar({
  events,
  mode,
  onModeChange,
  month,
  onMonthChange,
  onSelectEvent,
}: RotationCalendarProps) {
  const today = todayKey();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => groupEventsByDay(events), [events]);
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
          today={today}
          currentMonth={month.getMonth()}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      ) : (
        <SevenDayView days={days} byDay={byDay} today={today} onSelectEvent={onSelectEvent} />
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
            <p className="text-sm text-gray-400">Aucun mouvement ce jour-là.</p>
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

interface ViewProps {
  days: Date[];
  byDay: Map<string, RotationEvent[]>;
  today: string;
  onSelectEvent: (event: RotationEvent) => void;
}

function MonthView({
  days,
  byDay,
  today,
  currentMonth,
  selectedDay,
  onSelectDay,
}: Omit<ViewProps, "onSelectEvent"> & {
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
          const isToday = key === today;
          const outside = date.getMonth() !== currentMonth;
          const isSelected = key === selectedDay;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : key)}
              aria-label={`${shortDayLabel(date)} — ${dayEvents.length} mouvement${dayEvents.length > 1 ? "s" : ""}`}
              aria-pressed={isSelected}
              className={`min-h-[68px] border-b border-r border-gray-100 p-1 text-left align-top transition-colors sm:min-h-[110px] sm:p-1.5 ${
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

              {/* Mobile : pastilles de couleur, la case est trop étroite pour du texte. */}
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
                {dayEvents.slice(0, 3).map((event) => {
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
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[10px] text-gray-400">
                    +{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? "s" : ""}
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

function SevenDayView({ days, byDay, today, onSelectEvent }: ViewProps) {
  return (
    <div className="space-y-3">
      {days.map((date) => {
        const key = dayKey(date);
        const dayEvents = byDay.get(key) ?? [];
        const isToday = key === today;
        return (
          <div
            key={key}
            className={`rounded-xl border p-3 ${
              isToday ? "border-primary-300 bg-primary-50/30" : "border-gray-200 bg-white"
            }`}
          >
            <p
              className={`mb-2 text-xs font-semibold capitalize ${isToday ? "text-primary-700" : "text-gray-500"}`}
            >
              {isToday ? "Aujourd'hui — " : ""}
              {shortDayLabel(date)}
            </p>
            {dayEvents.length === 0 ? (
              <p className="text-xs text-gray-300">Rien de prévu</p>
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
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-opacity hover:opacity-80 ${tone.chip}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.rotation.clientNom}</span>
        <span className="block truncate text-[11px] opacity-80">
          {tone.label} · {ROTATION_STATUS_LABELS[event.rotation.status]}
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

function Legend() {
  const items = [
    { dot: "bg-gray-400", label: "Livraison (linge qui part)" },
    { dot: "bg-warning-500", label: "Reprise à venir" },
    { dot: "bg-primary-500", label: "Reprise aujourd'hui" },
    { dot: "bg-danger-500", label: "Reprise en retard" },
    { dot: "bg-success-500", label: "Reprise faite" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
