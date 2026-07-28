"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, dayKey, dayKeyFromISO } from "@/lib/calendar";
import {
  isLowStock,
  lateDaysOf,
  lowStockThreshold,
  useRotations,
  useStockBySlug,
  type RotationDTO,
} from "@/lib/rotations";

/**
 * Widget « Rappels & rotations » du tableau de bord.
 *
 * Répond à la question que le propriétaire se pose en ouvrant l'admin : qu'est-ce
 * qui doit revenir aujourd'hui, qu'est-ce qui aurait dû revenir, et de quoi vais-je
 * manquer. Tout est cliquable vers l'écran qui permet d'agir.
 */
export function RotationsReminders() {
  const today = dayKey(new Date());
  const tomorrow = dayKey(addDays(new Date(), 1));

  // Fenêtre courte : ce qui doit revenir maintenant. Une requête large
  // risquerait d'être tronquée par la pagination par défaut de l'API.
  const upcoming = useRotations({ from: today, to: tomorrow });
  // Les retards ne tiennent pas dans une fenêtre : on les demande par le filtre
  // dédié, qui se lit sur les DATES et non sur la colonne `status` — le cron ne
  // passe qu'une fois par jour, une rotation échue ce matin est déjà en retard.
  // Ce filtre s'utilise seul : ajouter from/to écraserait sa contrainte de date.
  const late = useRotations({ enRetard: true });
  const stock = useStockBySlug();

  const reprisesProches = useMemo(() => {
    return upcoming.rotations
      .filter((r) => {
        if (r.status === "REPRISE" || r.status === "ANNULEE" || r.dateRepriseReelle) return false;
        if (!r.dateReprisePrevue) return false;
        const key = dayKeyFromISO(r.dateReprisePrevue);
        return key === today || key === tomorrow;
      })
      .sort((a, b) => (a.dateReprisePrevue ?? "").localeCompare(b.dateReprisePrevue ?? ""));
  }, [upcoming.rotations, today, tomorrow]);

  // Les plus anciennes d'abord : c'est le linge qui dort le plus longtemps chez
  // un client, donc celui qui manque le plus au parc.
  const enRetard = useMemo(
    () =>
      [...late.rotations]
        .filter((r) => r.status !== "REPRISE" && r.status !== "ANNULEE")
        .sort((a, b) => lateDaysOf(b) - lateDaysOf(a))
        .slice(0, 5),
    [late.rotations],
  );

  const stockBas = useMemo(
    () =>
      stock.items
        .filter(isLowStock)
        .sort((a, b) => a.disponible - b.disponible)
        .slice(0, 5),
    [stock.items],
  );

  const moduleAbsent = !upcoming.available && !stock.available;
  const isLoading = upcoming.isLoading || late.isLoading || stock.isLoading;
  const rienASignaler =
    reprisesProches.length === 0 && enRetard.length === 0 && stockBas.length === 0;

  return (
    <Card
      title="Rappels & rotations"
      actions={
        <Link href="/planning">
          <Button variant="ghost" size="sm">
            Voir le calendrier
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : moduleAbsent ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Le suivi des rotations n&apos;est pas encore actif sur le serveur.
        </p>
      ) : rienASignaler ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-gray-200" />
          <p className="mt-2 text-sm text-gray-400">
            Aucune reprise à surveiller, aucun stock sous seuil.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {enRetard.length > 0 && (
            <Section
              title="Reprises en retard"
              count={enRetard.length}
              tone="danger"
              icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            >
              {enRetard.map((rotation) => (
                <ReminderRow
                  key={rotation.id}
                  href="/planning"
                  border="border-l-danger-500"
                  title={rotation.clientNom}
                  subtitle={subtitleFor(rotation)}
                  right={<Badge variant="danger">+{lateDaysOf(rotation)} j</Badge>}
                />
              ))}
            </Section>
          )}

          {reprisesProches.length > 0 && (
            <Section
              title="Reprises aujourd'hui et demain"
              count={reprisesProches.length}
              tone="warning"
              icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            >
              {reprisesProches.map((rotation) => {
                const isToday = dayKeyFromISO(rotation.dateReprisePrevue ?? "") === today;
                return (
                  <ReminderRow
                    key={rotation.id}
                    href="/planning"
                    border={isToday ? "border-l-primary-500" : "border-l-warning-500"}
                    title={rotation.clientNom}
                    subtitle={subtitleFor(rotation)}
                    right={
                      <Badge variant={isToday ? "info" : "warning"}>
                        {isToday ? "Aujourd'hui" : "Demain"}
                      </Badge>
                    }
                  />
                );
              })}
            </Section>
          )}

          {stockBas.length > 0 && (
            <Section
              title="Stock sous seuil"
              count={stockBas.length}
              tone="warning"
              icon={<Package className="h-4 w-4" aria-hidden="true" />}
            >
              {stockBas.map((item) => (
                <ReminderRow
                  key={item.productSlug}
                  href="/stock"
                  border="border-l-warning-500"
                  title={item.name}
                  subtitle={`${item.inCirculation} en circulation · seuil ${lowStockThreshold(item)}`}
                  right={
                    <Badge variant={item.disponible === 0 ? "danger" : "warning"}>
                      {item.disponible} dispo
                    </Badge>
                  }
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

function subtitleFor(rotation: RotationDTO): string {
  const parts: string[] = [];
  if (rotation.dateReprisePrevue) {
    parts.push(
      `Reprise prévue le ${new Date(rotation.dateReprisePrevue).toLocaleDateString("fr-FR")}`,
    );
  }
  const pieces = rotation.lignes.reduce((sum, l) => sum + l.qtyLivree, 0);
  if (pieces > 0) parts.push(`${pieces} pièce${pieces > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function Section({
  title,
  count,
  tone,
  icon,
  children,
}: {
  title: string;
  count: number;
  tone: "danger" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4
        className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
          tone === "danger" ? "text-danger-600" : "text-warning-600"
        }`}
      >
        {icon}
        {title}
        <span className="text-gray-400">({count})</span>
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReminderRow({
  href,
  border,
  title,
  subtitle,
  right,
}: {
  href: string;
  border: string;
  title: string;
  subtitle: string;
  right: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border-l-[3px] bg-gray-50 p-3 transition-colors hover:bg-gray-100 ${border}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-800">{title}</span>
        {subtitle && <span className="block truncate text-xs text-gray-500">{subtitle}</span>}
      </span>
      {right}
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
    </Link>
  );
}
