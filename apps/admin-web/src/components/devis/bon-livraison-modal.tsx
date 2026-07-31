"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/toast";
import {
  bonLivraisonNumero,
  countArticlesLivres,
  devisToBonLivraison,
  quoteToDevisData,
  URGENCY_TIERS,
} from "@lingengo/shared";
import type { DeliveryZone, UrgencyLevel } from "@lingengo/shared";
import type { QuoteDTO, OperatorDTO } from "@/lib/types";
import { DELIVERY_ZONE_OPTIONS } from "@/lib/delivery-zones";
import { Truck, Info, Minus, Plus } from "lucide-react";

interface BonLivraisonModalProps {
  quote: QuoteDTO;
  open: boolean;
  onClose: () => void;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";

export function BonLivraisonModal({ quote, open, onClose }: BonLivraisonModalProps) {
  const { toast } = useToast();

  // Identité de l'entreprise imprimée en tête du bon — le document est signé par
  // le client, il doit porter l'émetteur. Échec silencieux : le PDF sait se
  // passer de l'opérateur, mieux vaut un bon sans en-tête qu'aucun bon.
  const { data: operator } = useQuery({
    queryKey: ["operator-bl"],
    queryFn: () => api.get<OperatorDTO>("/settings/operator"),
    enabled: open,
    retry: false,
  });

  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [adresseLivraison, setAdresseLivraison] = useState(quote.clientAdresse ?? "");
  const [livreurNom, setLivreurNom] = useState("");
  const [passage, setPassage] = useState(1);
  const [notes, setNotes] = useState("");
  const [zone, setZone] = useState<DeliveryZone | "">("");
  const [urgency, setUrgency] = useState<UrgencyLevel | "">("");
  const [blankFields, setBlankFields] = useState(false);
  const [blankLines, setBlankLines] = useState(4);
  const [downloading, setDownloading] = useState(false);

  // Le devis ne persiste ni la zone ni l'urgence (aucune colonne en base) : les
  // sélecteurs partent donc vides, et « non précisé » n'imprime rien plutôt que
  // d'affirmer une zone qui n'a jamais été saisie.
  const devisData = useMemo(() => quoteToDevisData(quote), [quote]);

  const numeroPreview = bonLivraisonNumero(quote.numero, passage);
  const nbArticles = countArticlesLivres(
    quote.lignes.map((l) => ({ designation: l.designation, qty: l.qty })),
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const data = devisToBonLivraison(devisData, {
        date: date.trim() || undefined,
        heure: heure.trim() || undefined,
        adresseLivraison: adresseLivraison.trim() || undefined,
        zone: zone || undefined,
        urgency: urgency || undefined,
        livreurNom: livreurNom.trim() || undefined,
        notes: notes.trim() || undefined,
        passage,
        blankFields,
        blankLines: blankFields ? blankLines : undefined,
      });

      const { downloadBonLivraisonPdf } = await import("@lingengo/ui/bon-livraison-pdf");
      await downloadBonLivraisonPdf(data, {
        operator: operator
          ? {
              nom: operator.name,
              adresse: operator.address ?? undefined,
              tel: operator.phone ?? undefined,
              email: operator.email,
              siret: operator.siret,
              legalMentions: operator.legalMentions,
            }
          : undefined,
      });
      toast("Bon de livraison généré");
    } catch (err) {
      // Sans ce catch, un échec de génération rejetait la promesse dans le vide :
      // le bouton paraissait simplement mort, sans le moindre message.
      console.error("Génération du bon de livraison échouée", err);
      toast(
        err instanceof Error
          ? `Bon de livraison impossible à générer : ${err.message}`
          : "Bon de livraison impossible à générer",
        "error",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Générer le bon de livraison" className="max-w-3xl">
      <div className="space-y-5">
        {/* Aperçu de ce qui sortira */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Aperçu du bon
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Numéro généré</dt>
              <dd className="font-mono font-semibold text-gray-900">
                {numeroPreview || "— (le devis n'a pas de numéro)"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Devis source</dt>
              <dd className="font-mono text-gray-700">{quote.numero}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Client</dt>
              <dd className="font-medium text-gray-900">{quote.clientNom}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Articles remis</dt>
              <dd className="text-gray-700">
                {quote.lignes.length} ligne{quote.lignes.length > 1 ? "s" : ""} · {nbArticles}{" "}
                article{nbArticles > 1 ? "s" : ""}
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-gray-200 pt-2 text-xs text-gray-500">
            Document de réception : il constate les quantités remises et fait courir la garde du
            linge. Il ne porte aucun prix.
          </p>
        </div>

        {/* Paramètres de la livraison */}
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Info className="h-4 w-4" aria-hidden="true" />
            Détails de la livraison
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="bl-date">
                Date de livraison
              </label>
              <input
                id="bl-date"
                type="text"
                placeholder="28 juillet 2026 (vide = à remplir au stylo)"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="bl-heure">
                Heure
              </label>
              <input
                id="bl-heure"
                type="text"
                placeholder="10h30"
                className={inputCls}
                value={heure}
                onChange={(e) => setHeure(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="bl-adresse">
                Adresse de livraison
              </label>
              <input
                id="bl-adresse"
                type="text"
                placeholder="12 rue de la Paix, 84100 Orange"
                className={inputCls}
                value={adresseLivraison}
                onChange={(e) => setAdresseLivraison(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">
                Pré-remplie avec l&apos;adresse du devis — modifiable si la livraison se fait
                ailleurs.
              </p>
            </div>

            <div>
              <label className={labelCls} htmlFor="bl-livreur">
                Livreur
              </label>
              <input
                id="bl-livreur"
                type="text"
                placeholder="Nom du livreur qui cosigne"
                className={inputCls}
                value={livreurNom}
                onChange={(e) => setLivreurNom(e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="bl-passage">
                N° de passage
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPassage((p) => Math.max(1, p - 1))}
                  disabled={passage <= 1}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                  aria-label="Passage précédent"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  id="bl-passage"
                  type="number"
                  min={1}
                  className={`${inputCls} text-center`}
                  value={passage}
                  onChange={(e) => setPassage(Math.max(1, Number(e.target.value) || 1))}
                />
                <button
                  type="button"
                  onClick={() => setPassage((p) => p + 1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                  aria-label="Passage suivant"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 text-xs text-warning-600">
                Deux bons émis avec le même passage portent le même numéro — pensez à
                l&apos;incrémenter à chaque nouvelle livraison (abonnement : passage 2 pour la
                seconde quinzaine).
              </p>
            </div>

            <div>
              <label className={labelCls} htmlFor="bl-zone">
                Zone desservie
              </label>
              <select
                id="bl-zone"
                className={inputCls}
                value={zone}
                onChange={(e) => setZone(e.target.value as DeliveryZone | "")}
              >
                <option value="">Non précisée</option>
                {/* Les mêmes paliers que le devis, dans le même ordre, mais SANS
                    tarif : un bon de livraison constate des quantités remises,
                    il ne porte aucun prix. */}
                {DELIVERY_ZONE_OPTIONS.map((option) => (
                  <option key={option.zone} value={option.zone}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="bl-urgency">
                Niveau de service
              </label>
              <select
                id="bl-urgency"
                className={inputCls}
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as UrgencyLevel | "")}
              >
                <option value="">Non précisé</option>
                {URGENCY_TIERS.map((t) => (
                  <option key={t.level} value={t.level}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bon à compléter à la main */}
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={blankFields}
              onChange={(e) => setBlankFields(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              Bon à compléter au stylo
              <span className="mt-0.5 block text-xs text-gray-500">
                Les champs non saisis sont imprimés en pointillés et des lignes vierges sont
                ajoutées au tableau pour noter les articles ajoutés sur place.
              </span>
            </span>
          </label>

          {blankFields && (
            <div className="mt-3 max-w-xs">
              <label className={labelCls} htmlFor="bl-blank-lines">
                Lignes vierges à ajouter
              </label>
              <input
                id="bl-blank-lines"
                type="number"
                min={0}
                max={20}
                className={inputCls}
                value={blankLines}
                onChange={(e) => setBlankLines(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          )}

          {/* Observations */}
          <div className="mt-4">
            <label className={labelCls} htmlFor="bl-notes">
              Observations
            </label>
            <textarea
              id="bl-notes"
              rows={3}
              className={inputCls}
              placeholder="Remarques imprimées avant la décharge (état du linge, réserves...)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={downloading} onClick={handleDownload}>
            <Truck className="h-4 w-4" aria-hidden="true" />
            Télécharger le bon
          </Button>
        </div>
      </div>
    </Modal>
  );
}
