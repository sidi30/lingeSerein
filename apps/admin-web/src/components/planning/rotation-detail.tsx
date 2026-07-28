"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, MapPin, PackageCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DeleteAction } from "@/components/ui/delete-action";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { dayKey, dayKeyFromISO } from "@/lib/calendar";
import {
  FORMULE_LABELS,
  lateDaysOf,
  remainingQty,
  ROTATION_STATUS_BADGE,
  ROTATION_STATUS_LABELS,
  useSaveReprise,
  type RotationDTO,
} from "@/lib/rotations";

interface RotationDetailProps {
  rotation: RotationDTO | null;
  onClose: () => void;
}

export function RotationDetail({ rotation, onClose }: RotationDetailProps) {
  const { toast } = useToast();
  const saveReprise = useSaveReprise();
  const [repriseOpen, setRepriseOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [dateReprise, setDateReprise] = useState(dayKey(new Date()));

  const lateDays = rotation ? lateDaysOf(rotation) : 0;

  // À l'ouverture d'une rotation, on pré-remplit avec ce qu'il reste à
  // récupérer : le cas courant est « tout est revenu », l'admin valide sans
  // rien saisir et ne corrige que les manquants.
  useEffect(() => {
    if (!rotation) return;
    setRepriseOpen(false);
    setDateReprise(
      rotation.dateRepriseReelle ? dayKeyFromISO(rotation.dateRepriseReelle) : dayKey(new Date()),
    );
    setQuantities(Object.fromEntries(rotation.lignes.map((l) => [l.id, remainingQty(l)] as const)));
  }, [rotation]);

  const totalLivree = useMemo(
    () => (rotation?.lignes ?? []).reduce((sum, l) => sum + l.qtyLivree, 0),
    [rotation],
  );
  const totalDejaReprise = useMemo(
    () => (rotation?.lignes ?? []).reduce((sum, l) => sum + l.qtyReprise, 0),
    [rotation],
  );

  if (!rotation) return null;

  const submitReprise = () => {
    saveReprise.mutate(
      {
        id: rotation.id,
        // On envoie le CUMUL repris (déjà repris + saisie du jour) : le contrat
        // `qtyReprise` décrit l'état de la ligne, pas un delta.
        lignes: rotation.lignes.map((l) => ({
          id: l.id,
          qtyReprise: Math.min(l.qtyReprise + (quantities[l.id] ?? 0), l.qtyLivree),
        })),
        dateRepriseReelle: dateReprise,
      },
      {
        onSuccess: () => {
          toast("Reprise enregistrée");
          onClose();
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
            toast("Le module rotations n'est pas encore disponible sur le serveur.", "error");
            return;
          }
          toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", "error");
        },
      },
    );
  };

  const saisieTotale = Object.values(quantities).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <Modal open onClose={onClose} title={rotation.clientNom} className="max-w-2xl">
      <div className="space-y-5">
        {/* En-tête : statut, formule, retard */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ROTATION_STATUS_BADGE[rotation.status]}>
            {ROTATION_STATUS_LABELS[rotation.status]}
          </Badge>
          <Badge variant="neutral">{FORMULE_LABELS[rotation.formule]}</Badge>
          {rotation.passage !== null && (
            <Badge variant="neutral">Passage n°{rotation.passage}</Badge>
          )}
          {lateDays > 0 && (
            <span className="rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-semibold text-danger-600">
              {lateDays} jour{lateDays > 1 ? "s" : ""} de retard
            </span>
          )}
        </div>

        {rotation.clientAdresse && (
          <p className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            {rotation.clientAdresse}
          </p>
        )}

        {/* Dates */}
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-3">
          <DateBlock
            icon={<Truck className="h-4 w-4" aria-hidden="true" />}
            label="Livré le"
            value={rotation.dateLivraison}
          />
          <DateBlock
            icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            label="Reprise prévue"
            value={rotation.dateReprisePrevue}
            highlight={lateDays > 0}
          />
          <DateBlock
            icon={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
            label="Reprise réelle"
            value={rotation.dateRepriseReelle}
          />
        </dl>

        {/* Articles */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            Articles livrés ({totalLivree} pièce{totalLivree > 1 ? "s" : ""}, {totalDejaReprise}{" "}
            repris)
          </h3>
          {rotation.lignes.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun article enregistré sur cette rotation.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {rotation.lignes.map((ligne) => {
                const reste = remainingQty(ligne);
                return (
                  <li key={ligne.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-800">
                        {ligne.designation}
                      </span>
                      <span className="block text-[11px] text-gray-400">{ligne.productSlug}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums">
                      <span className="block font-semibold text-gray-900">
                        {ligne.qtyReprise} / {ligne.qtyLivree}
                      </span>
                      <span className={reste > 0 ? "text-warning-600" : "text-success-600"}>
                        {reste > 0 ? `${reste} à reprendre` : "complet"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Saisie de la reprise */}
        {!repriseOpen ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Supprimer une rotation dont le linge est encore dehors ferait
                disparaître la seule trace de ce qu'il faut aller récupérer :
                l'API ne l'autorise qu'une fois reprise ou annulée. */}
            <span className="mr-auto">
              <DeleteAction
                endpoint={`/rotations/${rotation.id}`}
                itemLabel={`la rotation de ${rotation.clientNom}`}
                label="Supprimer"
                title="Supprimer cette rotation ?"
                description={`La rotation de ${rotation.clientNom} et ses lignes seront supprimées. Les mouvements de stock déjà enregistrés ne sont pas annulés.`}
                successMessage="Rotation supprimée"
                disabledReason={
                  rotation.status === "REPRISE" || rotation.status === "ANNULEE"
                    ? null
                    : "Le linge de cette rotation est encore chez le client : elle ne peut être supprimée qu'une fois reprise ou annulée."
                }
                scopes={["rotation"]}
                onDeleted={onClose}
              />
            </span>
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
            {rotation.status !== "ANNULEE" && rotation.lignes.length > 0 && (
              <Button onClick={() => setRepriseOpen(true)}>Enregistrer la reprise</Button>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitReprise();
            }}
            className="space-y-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3"
          >
            <p className="text-sm font-semibold text-primary-900">Quantités récupérées</p>
            <ul className="space-y-2">
              {rotation.lignes.map((ligne) => {
                const reste = remainingQty(ligne);
                const inputId = `reprise-${ligne.id}`;
                return (
                  <li key={ligne.id} className="flex items-center gap-3">
                    <label
                      htmlFor={inputId}
                      className="min-w-0 flex-1 truncate text-sm text-gray-700"
                    >
                      {ligne.designation}
                      <span className="ml-1 text-xs text-gray-400">(reste {reste})</span>
                    </label>
                    <input
                      id={inputId}
                      type="number"
                      min={0}
                      max={reste}
                      value={quantities[ligne.id] ?? 0}
                      onChange={(e) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [ligne.id]: Math.max(
                            0,
                            Math.min(reste, parseInt(e.target.value, 10) || 0),
                          ),
                        }))
                      }
                      className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </li>
                );
              })}
            </ul>

            <div>
              <label
                htmlFor="date-reprise-reelle"
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                Date de reprise réelle
              </label>
              <input
                id="date-reprise-reelle"
                type="date"
                value={dateReprise}
                onChange={(e) => setDateReprise(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-56"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setRepriseOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={saveReprise.isPending} disabled={saisieTotale === 0}>
                Valider la reprise ({saisieTotale} pièce{saisieTotale > 1 ? "s" : ""})
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function DateBlock({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold ${highlight ? "text-danger-600" : "text-gray-900"}`}
      >
        {value ? new Date(value).toLocaleDateString("fr-FR") : "—"}
      </dd>
    </div>
  );
}
