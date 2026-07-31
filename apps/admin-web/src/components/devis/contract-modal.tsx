"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/toast";
import { formatPrice, eurosToCents } from "@/lib/format";
import {
  CATALOG_DEFAULTS,
  computeQuoteFinancials,
  detectContractType,
  quoteToContractData,
  SUBSCRIPTION_DEFAULTS,
} from "@lingengo/shared";
import type { QuoteForContract, ContractTerms } from "@lingengo/shared";
import { formatDeliveryFee, quoteDeliveryLabel } from "@/lib/order-quote";
import type { QuoteDTO, SubscriptionConfigDTO } from "@/lib/types";
import { FileSignature, Info, PackageCheck } from "lucide-react";

interface ContractModalProps {
  quote: QuoteDTO;
  open: boolean;
  onClose: () => void;
}

/** Libellé fr-FR long d'une date (ex. « 19 juillet 2026 »). */
function longDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Détecte une ligne « Pack Sérénité » (mirroir de la logique shared, pour l'affichage). */
const PACK_DESIGNATION_RE = /pack\s*s[ée]r[ée]nit[ée]/i;

export function ContractModal({ quote, open, onClose }: ContractModalProps) {
  const { toast } = useToast();

  // Config abonnement — fallback sur les defaults partagés si l'endpoint échoue.
  const { data: config } = useQuery({
    queryKey: ["subscription-config-admin"],
    queryFn: () => api.get<SubscriptionConfigDTO>("/subscriptions/config/admin"),
    enabled: open,
    retry: false,
  });

  const priceCents = config?.priceCents ?? SUBSCRIPTION_DEFAULTS.PRICE_CENTS;
  const kitBainQty = config?.kitBainQty ?? SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY;
  const kitLitQty = config?.kitLitQty ?? SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY;
  const minEngagementMonths =
    config?.minEngagementMonths ?? SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS;
  const noticePeriodDays = config?.noticePeriodDays ?? SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS;

  const packPriceCents = priceCents;

  // La dotation mensuelle est livrée en deux passages (un par quinzaine) : le contrat
  // doit annoncer le rythme réel, pas seulement le total du mois.
  const passagesParMois = SUBSCRIPTION_DEFAULTS.DELIVERIES_PER_MONTH;
  const kitBainParPassage = Math.round(kitBainQty / passagesParMois);
  const kitLitParPassage = Math.round(kitLitQty / passagesParMois);
  const dotationRythme =
    `livrés en ${passagesParMois} passages (${kitBainParPassage} bain + ${kitLitParPassage} lit ` +
    `par quinzaine), reprise du linge sous ${SUBSCRIPTION_DEFAULTS.MAX_LINEN_KEEP_DAYS} jours`;

  // QuoteForContract dérivé du devis.
  const quoteForContract: QuoteForContract = useMemo(
    () => ({
      numero: quote.numero,
      clientNom: quote.clientNom,
      clientEmail: quote.clientEmail,
      clientTel: quote.clientTel,
      clientAdresse: quote.clientAdresse,
      lignes: quote.lignes.map((l) => ({
        designation: l.designation,
        qty: l.qty,
        unitCents: l.unitCents,
      })),
      tvaApplicable: quote.tvaApplicable,
      // Remise et livraison DOIVENT suivre : sans elles, le contrat affichait un
      // total sans le détail correspondant (frais de livraison invisibles).
      remisePct: quote.remisePct,
      livraisonCents: quote.livraisonCents,
      // Libellé du serveur d'abord : le contrat doit dire ce que dit le devis
      // envoyé au client. Déduit du seul montant, un devis « sur devis » (0 € en
      // base, course non chiffrée) partirait en contrat « Livraison offerte ».
      livraisonLabel: quoteDeliveryLabel(quote),
      totalNetCents: quote.totals.totalTTC,
    }),
    [quote],
  );

  // Garde-fou affiché : recalcul indépendant du total à partir du devis.
  const fin = useMemo(() => computeQuoteFinancials(quoteForContract), [quoteForContract]);
  const totalsMatch = fin.totalCents === quote.totals.totalTTC;

  const { type, nbMensualites } = useMemo(
    () => detectContractType(quoteForContract, packPriceCents),
    [quoteForContract, packPriceCents],
  );
  const isAbo = type === "ABONNEMENT";

  // Prix mensuel dérivé pour l'affichage : ligne pack détectée, sinon prix config.
  const displayPrixMensuelCents = useMemo(() => {
    const packLine = quote.lignes.find(
      (l) => PACK_DESIGNATION_RE.test(l.designation) || l.unitCents === packPriceCents,
    );
    return packLine?.unitCents ?? packPriceCents;
  }, [quote.lignes, packPriceCents]);

  // ── Champs éditables ("points importants") ──
  const defaultNumero = quote.numero.startsWith("LSQ")
    ? quote.numero.replace(/^LSQ/, "LSC")
    : `CTR-${quote.numero}`;

  const [numero, setNumero] = useState(defaultNumero);
  const [dateSignature, setDateSignature] = useState(() => longDateFr(new Date()));
  const [lieu, setLieu] = useState("Orange");
  const [dateDebut, setDateDebut] = useState("");
  const [engagementMois, setEngagementMois] = useState<number>(minEngagementMonths);
  const [preavisJours, setPreavisJours] = useState<number>(noticePeriodDays);
  const [jourFacturation, setJourFacturation] = useState("1er");
  const [depotGarantieEuros, setDepotGarantieEuros] = useState<number>(0);
  const [conditionsParticulieres, setConditionsParticulieres] = useState(quote.notes ?? "");
  const [blankFields, setBlankFields] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    // En mode « à compléter », la prise d'effet peut rester vierge (remplie au stylo).
    if (!dateDebut.trim() && !blankFields) return;
    setDownloading(true);
    try {
      const terms: ContractTerms = {
        prixMensuelCents: packPriceCents,
        kitsBain: kitBainQty,
        kitsLit: kitLitQty,
        livraisonsIncluses: passagesParMois,
        engagementMois,
        preavisJours,
        jourFacturation,
        lieu,
        dateDebut,
        depotGarantieCents: eurosToCents(depotGarantieEuros || 0),
        conditionsParticulieres,
        numero,
        date: dateSignature,
      };
      const data = quoteToContractData(quoteForContract, terms, packPriceCents, { blankFields });
      const { downloadContractPdf } = await import("@lingengo/ui/contract-pdf");
      await downloadContractPdf(data);
      toast("Contrat généré");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la génération du contrat";
      toast(msg, "error");
    } finally {
      setDownloading(false);
    }
  };

  const badgeLabel = isAbo ? "Abonnement Pack Sérénité" : "Prestation ponctuelle";
  const badgeVariant: "info" | "neutral" = isAbo ? "info" : "neutral";

  return (
    <Modal open={open} onClose={onClose} title="Générer le contrat" className="max-w-3xl">
      <div className="space-y-5">
        {/* Type détecté */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Type de contrat détecté :</span>
          <Badge variant={badgeVariant}>{badgeLabel}</Badge>
          <span className="ml-auto font-mono text-xs text-gray-400">
            source&nbsp;: {quote.numero}
          </span>
        </div>

        {/* Garde-fou : le contrat ne peut pas afficher d'autres chiffres que le devis */}
        {!totalsMatch && (
          <div className="rounded-xl border border-danger-500 bg-danger-50 p-4 text-sm text-danger-600">
            <p className="font-semibold">Incohérence de calcul — génération bloquée</p>
            <p className="mt-1">
              Le détail du devis (lignes {formatPrice(fin.sousTotalCents)} − remise{" "}
              {formatPrice(fin.remiseCents)} + livraison {formatPrice(fin.livraisonCents)} + TVA{" "}
              {formatPrice(fin.tvaCents)} = {formatPrice(fin.totalCents)}) ne correspond pas au
              total enregistré ({formatPrice(quote.totals.totalTTC)}). Corrigez le devis avant de
              produire le contrat.
            </p>
          </div>
        )}

        {/* Résumé dérivé — le devis définit le contrat */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Résumé dérivé du devis
          </p>

          {isAbo ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Prix mensuel</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {formatPrice(displayPrixMensuelCents)} / mois
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Dotation mensuelle</dt>
                <dd className="text-right font-medium text-gray-900">
                  {kitBainQty} kits bain + {kitLitQty} kits lit / mois
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    {dotationRythme}
                  </span>
                </dd>
              </div>
              {nbMensualites > 1 && (
                <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">
                  Le devis couvre {nbMensualites} mensualités.
                </p>
              )}
              <p className="border-t border-gray-200 pt-2 text-xs text-gray-500">
                1 Pack Sérénité / mois · kits au-delà au tarif normal (kit bain{" "}
                {formatPrice(CATALOG_DEFAULTS.KIT_BAIN_CENTS)} · kit lit{" "}
                {formatPrice(CATALOG_DEFAULTS.KIT_LIT_CENTS)}).
              </p>
            </dl>
          ) : (
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="pb-1 font-medium">Désignation</th>
                    <th className="pb-1 text-right font-medium">Qté</th>
                    <th className="pb-1 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lignes.map((l) => (
                    <tr key={l.id} className="border-t border-gray-200">
                      <td className="py-1.5 text-gray-900">{l.designation}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-700">{l.qty}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums text-gray-900">
                        {formatPrice(l.qty * l.unitCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td className="pt-2 text-gray-500" colSpan={2}>
                      Sous-total
                    </td>
                    <td className="pt-2 text-right tabular-nums text-gray-900">
                      {formatPrice(fin.sousTotalCents)}
                    </td>
                  </tr>
                  {fin.remiseCents > 0 && (
                    <tr>
                      <td className="text-gray-500" colSpan={2}>
                        Remise {quote.remisePct / 100} %
                      </td>
                      <td className="text-right tabular-nums text-danger-600">
                        -{formatPrice(fin.remiseCents)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="text-gray-500" colSpan={2}>
                      {quoteDeliveryLabel(quote)}
                    </td>
                    <td className="text-right tabular-nums text-gray-900">
                      {formatDeliveryFee(fin.livraisonCents, Boolean(quote.livraisonSurDevis))}
                    </td>
                  </tr>
                  {quote.tvaApplicable && (
                    <tr>
                      <td className="text-gray-500" colSpan={2}>
                        TVA 20 %
                      </td>
                      <td className="text-right tabular-nums text-gray-900">
                        {formatPrice(fin.tvaCents)}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-gray-300">
                    <td className="pt-2 font-semibold text-gray-900" colSpan={2}>
                      {quote.tvaApplicable ? "Total TTC" : "Total net"}
                    </td>
                    <td className="pt-2 text-right text-base font-bold tabular-nums text-primary-700">
                      {formatPrice(quote.totals.totalTTC)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-xs text-gray-500">
                Sans engagement · paiement à la commande. Ces montants sont repris à
                l&apos;identique sur le contrat.
              </p>
            </div>
          )}
        </div>

        {/* Dotation & contrainte de stock (abonnement uniquement) */}
        {isAbo && (
          <div className="flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-4">
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-500" aria-hidden="true" />
            <div className="text-sm text-primary-800">
              <p className="font-semibold">Dotation &amp; contrainte de stock</p>
              <p className="mt-1 text-primary-700">
                Dotation mensuelle engagée : {kitBainQty} bain + {kitLitQty} lit, {dotationRythme}.
                Règle : 1 Pack Sérénité / mois — les kits au-delà de la dotation sont facturés au
                tarif normal. Contrainte pilotée par la dotation (pas d&apos;inventaire physique).
              </p>
            </div>
          </div>
        )}

        {/* Points importants — les seuls champs saisis par l'admin */}
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Info className="h-4 w-4" aria-hidden="true" />
            Points importants
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Numéro */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="ctr-numero">
                N° de contrat
              </label>
              <input
                id="ctr-numero"
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>

            {/* Date de signature */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="ctr-date">
                Date de signature
              </label>
              <input
                id="ctr-date"
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={dateSignature}
                onChange={(e) => setDateSignature(e.target.value)}
              />
            </div>

            {/* Lieu */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="ctr-lieu">
                Lieu
              </label>
              <input
                id="ctr-lieu"
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={lieu}
                onChange={(e) => setLieu(e.target.value)}
              />
            </div>

            {/* Date de début (requise) */}
            <div>
              <label
                className="mb-1 block text-xs font-medium text-gray-700"
                htmlFor="ctr-date-debut"
              >
                Date de prise d&apos;effet <span className="text-danger-600">*</span>
              </label>
              <input
                id="ctr-date-debut"
                type="text"
                placeholder="23 juillet 2026"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>

            {/* Champs abonnement uniquement */}
            {isAbo && (
              <>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-gray-700"
                    htmlFor="ctr-engagement"
                  >
                    Engagement (mois)
                  </label>
                  <input
                    id="ctr-engagement"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    value={engagementMois}
                    onChange={(e) => setEngagementMois(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-gray-700"
                    htmlFor="ctr-preavis"
                  >
                    Préavis (jours)
                  </label>
                  <input
                    id="ctr-preavis"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    value={preavisJours}
                    onChange={(e) => setPreavisJours(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-gray-700"
                    htmlFor="ctr-facturation"
                  >
                    Jour de facturation
                  </label>
                  <input
                    id="ctr-facturation"
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    value={jourFacturation}
                    onChange={(e) => setJourFacturation(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Dépôt de garantie */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="ctr-depot">
                Dépôt de garantie (€)
              </label>
              <input
                id="ctr-depot"
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={depotGarantieEuros}
                onChange={(e) => setDepotGarantieEuros(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Contrat à compléter à la main */}
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={blankFields}
              onChange={(e) => setBlankFields(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              Contrat à compléter au stylo
              <span className="mt-0.5 block text-xs text-gray-500">
                Les champs non saisis sont imprimés en pointillés ({"------"}) et quatre lignes
                vierges sont ajoutées au tableau des prestations.
              </span>
            </span>
          </label>

          {/* Conditions particulières */}
          <div className="mt-4">
            <label
              className="mb-1 block text-xs font-medium text-gray-700"
              htmlFor="ctr-conditions"
            >
              Conditions particulières
            </label>
            <textarea
              id="ctr-conditions"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={conditionsParticulieres}
              onChange={(e) => setConditionsParticulieres(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={downloading}
            disabled={(!dateDebut.trim() && !blankFields) || !totalsMatch}
            onClick={handleDownload}
          >
            <FileSignature className="h-4 w-4" aria-hidden="true" />
            Télécharger le contrat
          </Button>
        </div>
      </div>
    </Modal>
  );
}
