"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Trash2, Download, FileText, Loader2, History, X } from "lucide-react";
import type { DevisData, DevisLine } from "@lingengo/shared";
import { SignaturePad } from "./signature-pad";
import {
  loadHistory,
  saveToHistory,
  removeFromHistory,
  type DevisHistoryEntry,
} from "@/lib/devis-history";
import {
  CATALOG_PRODUCTS,
  computeDeliveryFee,
  countKits,
  DELIVERY_RULE_TEXT,
  DELIVERY_ZONE_LABELS,
  SERVICE_DELAY_TEXT,
  URGENCY_TIERS,
  urgencyTier,
} from "@lingengo/shared";
import type { DeliveryZone, UrgencyLevel } from "@lingengo/shared";

const DEFAULT_REGLEMENT =
  "Règlement à 30 jours par virement bancaire. Facturation mensuelle à la rotation.";

// NOTE (Option A, ADR-V2-005) : catalogue dérivé de @lingengo/shared (source de vérité de seed).
// Si les prix sont modifiés via l'admin en production, ce catalogue restera sur les valeurs
// de départ — désynchro assumée en V1.

/* ─── Catalogue dérivé de CATALOG_PRODUCTS (@lingengo/shared) ─── */

const CATALOG: { name: string; cents: number }[] = CATALOG_PRODUCTS.map((p) => ({
  name: p.description ? `${p.name} (${p.description})` : p.name,
  cents: p.priceCents,
}));

function todayFr(): string {
  return new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function defaultNumero(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `DEV-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-01`;
}

function fmt(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

const inputCls =
  "w-full rounded-lg border border-lavender-200 bg-white px-3 py-2 text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";

export function DevisGenerator() {
  // Init vide pour éviter un mismatch d'hydratation (date calculée au build ≠ au
  // runtime) qui casserait l'interactivité. On remplit côté client après montage.
  const [numero, setNumero] = useState("");
  const [date, setDate] = useState("");
  const [validite, setValidite] = useState(30);

  useEffect(() => {
    setNumero((n) => n || defaultNumero());
    setDate((d) => d || todayFr());
  }, []);
  const [client, setClient] = useState({
    nom: "",
    etablissement: "",
    adresse: "",
    email: "",
    tel: "",
  });
  const [lines, setLines] = useState<DevisLine[]>([{ designation: "", qty: 1, unitCents: 0 }]);
  const [remisePct, setRemisePct] = useState(0);
  const [livraisonEuros, setLivraisonEuros] = useState(0);
  const [urgency, setUrgency] = useState<UrgencyLevel>("STANDARD");
  const [zoneLivraison, setZoneLivraison] = useState<DeliveryZone>("ORANGE");
  const [blankFields, setBlankFields] = useState(false);
  const [blankLines, setBlankLines] = useState(5);
  const [tva, setTva] = useState(false);
  const [notes, setNotes] = useState("");
  const [reglement, setReglement] = useState(DEFAULT_REGLEMENT);
  const [signature, setSignature] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<DevisHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const setClientField = (k: keyof typeof client, v: string) =>
    setClient((prev) => ({ ...prev, [k]: v }));

  const addLine = useCallback(
    () => setLines((p) => [...p, { designation: "", qty: 1, unitCents: 0 }]),
    [],
  );

  const addCatalog = useCallback((name: string, cents: number) => {
    setLines((p) => {
      const filtered = p.filter((l) => l.designation.trim() || l.unitCents > 0);
      return [...filtered, { designation: name, qty: 1, unitCents: cents }];
    });
  }, []);

  const updateLine = useCallback((i: number, patch: Partial<DevisLine>) => {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((i: number) => {
    setLines((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));
  }, []);

  const totals = useMemo(() => {
    const sousTotal = lines.reduce((s, l) => s + Math.round((l.qty || 0) * (l.unitCents || 0)), 0);
    const remise = Math.round((sousTotal * remisePct) / 100);
    const livraisonCents = Math.round(livraisonEuros * 100);
    const totalHT = sousTotal - remise + livraisonCents;
    const tvaCents = tva ? Math.round(totalHT * 0.2) : 0;
    const totalTTC = totalHT + tvaCents;
    return { sousTotal, remise, livraisonCents, totalHT, tvaCents, totalTTC };
  }, [lines, remisePct, livraisonEuros, tva]);

  // Barème livraison : la jauge d'urgence (forfait fixe) prime sur le barème de zone ;
  // hors zone et Flash < 3 h n'ont aucun tarif public → montant saisi à la main.
  const deliveryFee = useMemo(() => {
    const sousTotal = lines.reduce((s, l) => s + Math.round((l.qty || 0) * (l.unitCents || 0)), 0);
    const remise = Math.round((sousTotal * remisePct) / 100);
    return computeDeliveryFee({
      urgency,
      zone: zoneLivraison,
      montantApresRemiseCents: sousTotal - remise,
      nbKits: countKits(lines),
    });
  }, [lines, remisePct, urgency, zoneLivraison]);

  // Le montant du barème est reporté automatiquement dans le champ « Livraison » : oublier
  // de l'appliquer produirait un devis qui contredit ses propres conditions. Sur devis, le
  // champ repart à zéro — c'est à l'admin de chiffrer.
  const { surDevis: feeSurDevis, cents: feeCents } = deliveryFee;
  useEffect(() => {
    setLivraisonEuros(feeSurDevis ? 0 : feeCents / 100);
  }, [feeSurDevis, feeCents]);

  const livraisonCents = Math.round(livraisonEuros * 100);

  // Libellé imprimé sur le devis (et repris tel quel sur le contrat). Un montant chiffré à la
  // main ne doit pas s'imprimer sous une mention « sur devis » qui le contredirait.
  const livraisonLabel = useMemo(() => {
    if (!deliveryFee.surDevis) {
      return livraisonCents === deliveryFee.cents ? deliveryFee.label : undefined;
    }
    if (livraisonCents <= 0) return deliveryFee.label;
    const tier = urgencyTier(urgency);
    return zoneLivraison === "HORS_ZONE"
      ? "Livraison hors zone — montant convenu"
      : `Livraison ${tier.label} (${tier.delaiText})`;
  }, [deliveryFee, livraisonCents, urgency, zoneLivraison]);

  const buildData = useCallback(
    (): DevisData => ({
      numero,
      date,
      validiteJours: validite,
      client,
      lines: lines.filter((l) => l.designation.trim() || l.unitCents > 0),
      // Le formulaire saisit des pourcents ; DevisData les attend en centièmes
      // de pourcent (1000 = 10 %), comme l'API et l'admin.
      remisePct: Math.round(remisePct * 100),
      livraisonCents,
      livraisonLabel,
      urgency,
      zoneLivraison,
      notes,
      tvaApplicable: tva,
      reglement,
      signatureSrc: signature ?? undefined,
      blankFields,
      blankLines,
    }),
    [
      numero,
      date,
      validite,
      client,
      lines,
      remisePct,
      livraisonCents,
      livraisonLabel,
      urgency,
      zoneLivraison,
      notes,
      tva,
      reglement,
      signature,
      blankFields,
      blankLines,
    ],
  );

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const data = buildData();
      const { downloadDevisPdf } = await import("@lingengo/ui/devis-pdf");
      // Le logo est embarqué en data-URI dans @lingengo/ui : aucun fetch réseau.
      await downloadDevisPdf(data);
      // Historique (local, même navigateur admin)
      setHistory(
        saveToHistory({
          numero: data.numero,
          date: data.date,
          label: data.client.etablissement || data.client.nom || "Client",
          totalCents: totals.totalTTC,
          savedAt: Date.now(),
          data,
        }),
      );
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération du PDF. Réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  const regenerate = async (entry: DevisHistoryEntry) => {
    const { downloadDevisPdf } = await import("@lingengo/ui/devis-pdf");
    await downloadDevisPdf(entry.data);
  };

  const loadIntoForm = (entry: DevisHistoryEntry) => {
    const d = entry.data;
    setNumero(d.numero);
    setDate(d.date);
    setValidite(d.validiteJours);
    setClient({
      nom: d.client.nom ?? "",
      etablissement: d.client.etablissement ?? "",
      adresse: d.client.adresse ?? "",
      email: d.client.email ?? "",
      tel: d.client.tel ?? "",
    });
    setLines(d.lines.length ? d.lines : [{ designation: "", qty: 1, unitCents: 0 }]);
    // Retour au pourcent affiché dans le formulaire (DevisData est en centièmes).
    setRemisePct(d.remisePct / 100);
    setUrgency(d.urgency ?? "STANDARD");
    if (d.zoneLivraison) setZoneLivraison(d.zoneLivraison);
    setLivraisonEuros(d.livraisonCents / 100);
    setTva(d.tvaApplicable);
    setNotes(d.notes ?? "");
    setReglement(d.reglement ?? DEFAULT_REGLEMENT);
    setShowHistory(false);
  };

  // En mode « à compléter », un devis entièrement vierge est justement l'objectif.
  const hasContent = blankFields || lines.some((l) => l.designation.trim() && l.unitCents > 0);

  return (
    <div className="rounded-2xl bg-white border border-lavender-200 shadow-sm overflow-hidden mb-8">
      <div className="bg-forest px-5 py-4 flex items-center gap-2">
        <FileText size={18} aria-hidden className="text-white" />
        <h2 className="font-serif text-base font-bold text-white">Générateur de devis (PDF)</h2>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
        >
          <History size={14} aria-hidden />
          Historique{history.length > 0 ? ` (${history.length})` : ""}
        </button>
      </div>

      {showHistory && (
        <div className="border-b border-lavender-100 bg-lavender-50/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-forest">Devis générés (ce navigateur)</h3>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Fermer l'historique"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun devis enregistré pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.numero + h.savedAt}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white border border-lavender-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-forest truncate">
                      {h.numero} · {h.label}
                    </div>
                    <div className="text-xs text-gray-500">
                      {h.date} · {fmt(h.totalCents)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => loadIntoForm(h)}
                      className="rounded-lg border border-lavender-200 px-2.5 py-1.5 text-xs font-medium text-forest hover:bg-lavender-50"
                    >
                      Charger
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerate(h)}
                      className="inline-flex items-center gap-1 rounded-lg bg-forest px-2.5 py-1.5 text-xs font-medium text-white hover:bg-forest-light"
                    >
                      <Download size={12} aria-hidden /> PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistory(removeFromHistory(h.numero))}
                      className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Supprimer du historique"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="p-5 space-y-6">
        {/* Méta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="dv-num">
              N° de devis
            </label>
            <input
              id="dv-num"
              className={inputCls}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="dv-date">
              Date
            </label>
            <input
              id="dv-date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="dv-val">
              Validité (jours)
            </label>
            <input
              id="dv-val"
              type="number"
              min={1}
              className={inputCls}
              value={validite}
              onChange={(e) => setValidite(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Client */}
        <div>
          <h3 className="text-sm font-bold text-forest mb-3">Client</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="dv-etab">
                Établissement
              </label>
              <input
                id="dv-etab"
                className={inputCls}
                placeholder="Hôtel Le Mas Provençal"
                value={client.etablissement}
                onChange={(e) => setClientField("etablissement", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="dv-nom">
                Nom du contact
              </label>
              <input
                id="dv-nom"
                className={inputCls}
                placeholder="Marie-Claire D."
                value={client.nom}
                onChange={(e) => setClientField("nom", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="dv-adr">
                Adresse
              </label>
              <input
                id="dv-adr"
                className={inputCls}
                placeholder="12 rue de la République, 84100 Orange"
                value={client.adresse}
                onChange={(e) => setClientField("adresse", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="dv-tel">
                Téléphone
              </label>
              <input
                id="dv-tel"
                className={inputCls}
                placeholder="06 ..."
                value={client.tel}
                onChange={(e) => setClientField("tel", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="dv-email">
                Email
              </label>
              <input
                id="dv-email"
                className={inputCls}
                placeholder="contact@email.fr"
                value={client.email}
                onChange={(e) => setClientField("email", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Catalogue quick-add */}
        <div>
          <h3 className="text-sm font-bold text-forest mb-2">Ajout rapide</h3>
          <div className="flex flex-wrap gap-2">
            {CATALOG.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => addCatalog(c.name, c.cents)}
                className="inline-flex items-center gap-1 rounded-full border border-lavender-200 bg-lavender-50 px-3 py-1.5 text-xs font-medium text-forest hover:bg-lavender-100 transition-colors"
              >
                <Plus size={12} aria-hidden />
                {c.name.split(" (")[0]} · {fmt(c.cents)}
              </button>
            ))}
          </div>
        </div>

        {/* Lignes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-forest">Lignes du devis</h3>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 rounded-lg border border-forest/30 px-2.5 py-1.5 text-xs font-medium text-forest hover:bg-forest/5 transition-colors"
            >
              <Plus size={13} aria-hidden />
              Ligne libre
            </button>
          </div>

          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              <span>Désignation</span>
              <span className="text-right">Qté</span>
              <span className="text-right">P.U. HT</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            {lines.map((l, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_56px_88px_36px] sm:grid-cols-[1fr_70px_100px_100px_36px] gap-2 items-center"
              >
                <input
                  className={inputCls}
                  placeholder="Désignation"
                  value={l.designation}
                  onChange={(e) => updateLine(i, { designation: e.target.value })}
                />
                <input
                  className={`${inputCls} text-right`}
                  type="number"
                  min={0}
                  step={1}
                  value={l.qty}
                  onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                  aria-label="Quantité"
                />
                <input
                  className={`${inputCls} text-right`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={l.unitCents / 100}
                  onChange={(e) =>
                    updateLine(i, { unitCents: Math.round((Number(e.target.value) || 0) * 100) })
                  }
                  aria-label="Prix unitaire HT en euros"
                />
                <span className="hidden sm:block text-right text-sm font-medium text-gray-900 tabular-nums">
                  {fmt(Math.round((l.qty || 0) * (l.unitCents || 0)))}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="flex items-center justify-center h-9 w-9 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Supprimer la ligne"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Réglages totaux */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="dv-remise">
              Remise (%)
            </label>
            <input
              id="dv-remise"
              type="number"
              min={0}
              max={100}
              className={inputCls}
              value={remisePct}
              onChange={(e) => setRemisePct(Number(e.target.value))}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[0, 5, 10, 15].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setRemisePct(p)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    remisePct === p
                      ? "border-forest bg-forest text-white"
                      : "border-lavender-200 text-forest hover:bg-lavender-50"
                  }`}
                >
                  {p === 0 ? "Aucune" : `-${p}%`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="dv-livr">
              Livraison (€)
            </label>
            <input
              id="dv-livr"
              type="number"
              min={0}
              step={0.01}
              className={inputCls}
              value={livraisonEuros}
              onChange={(e) => setLivraisonEuros(Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {deliveryFee.surDevis
                ? "Sur devis — montant à saisir à la main."
                : `Barème appliqué : ${deliveryFee.cents === 0 ? "offerte" : fmt(deliveryFee.cents)}.`}{" "}
              {deliveryFee.label}
            </p>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-800 pb-2">
              <input
                type="checkbox"
                checked={tva}
                onChange={(e) => setTva(e.target.checked)}
                className="h-4 w-4 rounded border-lavender-300 text-forest focus-visible:ring-forest"
              />
              Appliquer la TVA (20%)
            </label>
          </div>
        </div>

        {/* Livraison : jauge d'urgence + zone */}
        <div className="rounded-xl border border-lavender-100 bg-lavender-50/30 p-4">
          <h3 className="text-sm font-bold text-forest mb-1">Livraison</h3>
          <p className="text-[11px] text-gray-500 mb-3">
            Le niveau d&apos;urgence détermine les frais : les forfaits remplacent le barème de zone
            et ne sont pas soumis aux gratuités.
          </p>

          <span className={labelCls} id="dv-urgence-label">
            Niveau d&apos;urgence
          </span>
          <div
            role="radiogroup"
            aria-labelledby="dv-urgence-label"
            className="grid grid-cols-2 lg:grid-cols-4 gap-2"
          >
            {URGENCY_TIERS.map((tier) => {
              const active = urgency === tier.level;
              const fee =
                tier.feeCents === null
                  ? "Sur devis"
                  : tier.feeCents === 0
                    ? "Barème de zone"
                    : `+ ${fmt(tier.feeCents)}`;
              return (
                <button
                  key={tier.level}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setUrgency(tier.level)}
                  className={`min-h-[64px] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 ${
                    active
                      ? "border-forest bg-forest text-white shadow-md"
                      : "border-lavender-200 bg-white text-forest hover:bg-lavender-50"
                  }`}
                >
                  <span className="block text-xs font-semibold">{tier.label}</span>
                  <span
                    className={`mt-0.5 block text-[10px] leading-snug ${active ? "text-white/75" : "text-gray-500"}`}
                  >
                    {tier.delaiText}
                  </span>
                  <span
                    className={`mt-1 block text-[11px] font-medium ${active ? "text-lavender-200" : "text-lavender-700"}`}
                  >
                    {fee}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <label className={labelCls} htmlFor="dv-zone">
              Zone
            </label>
            <select
              id="dv-zone"
              className={inputCls}
              value={zoneLivraison}
              onChange={(e) => setZoneLivraison(e.target.value as DeliveryZone)}
            >
              {(Object.keys(DELIVERY_ZONE_LABELS) as DeliveryZone[]).map((z) => (
                <option key={z} value={z}>
                  {DELIVERY_ZONE_LABELS[z]}
                </option>
              ))}
            </select>
          </div>

          <div
            className={`mt-3 rounded-lg px-3 py-2 text-[11px] font-medium ${
              deliveryFee.surDevis
                ? "bg-lavender-100 text-lavender-800"
                : "bg-white text-forest border border-lavender-100"
            }`}
          >
            {deliveryFee.surDevis ? (
              <>
                Sur devis — {deliveryFee.label}. Saisissez le montant convenu dans le champ «
                Livraison (€) » ci-dessus (laissé à 0, le devis imprimera « sur devis »).
              </>
            ) : (
              <>
                {deliveryFee.label} · {deliveryFee.cents === 0 ? "offerte" : fmt(deliveryFee.cents)}
              </>
            )}
          </div>

          <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">{DELIVERY_RULE_TEXT}</p>
          <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
            {SERVICE_DELAY_TEXT.PONCTUEL} {SERVICE_DELAY_TEXT.ABONNEMENT}{" "}
            {SERVICE_DELAY_TEXT.MISE_EN_PLACE}
          </p>
        </div>

        {/* Devis à compléter au stylo */}
        <div className="rounded-xl border border-lavender-100 bg-white p-4">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={blankFields}
              onChange={(e) => setBlankFields(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-lavender-300 text-forest focus-visible:ring-forest"
            />
            <span className="text-sm text-gray-800">
              Devis à compléter à la main
              <span className="mt-0.5 block text-[11px] text-gray-500">
                Les champs laissés vides sont imprimés en pointillés et des lignes vierges sont
                ajoutées au tableau.
              </span>
            </span>
          </label>
          {blankFields && (
            <div className="mt-3 max-w-[200px]">
              <label className={labelCls} htmlFor="dv-blank-lines">
                Lignes vierges
              </label>
              <input
                id="dv-blank-lines"
                type="number"
                min={0}
                max={20}
                className={inputCls}
                value={blankLines}
                onChange={(e) => setBlankLines(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls} htmlFor="dv-notes">
            Notes / conditions particulières
          </label>
          <textarea
            id="dv-notes"
            rows={2}
            className={inputCls}
            placeholder="Ex : tarif dégressif dès 4 kits, fréquence de rotation convenue…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Conditions de règlement (défaut auto) */}
        <div>
          <label className={labelCls} htmlFor="dv-regl">
            Conditions de règlement
          </label>
          <textarea
            id="dv-regl"
            rows={2}
            className={inputCls}
            value={reglement}
            onChange={(e) => setReglement(e.target.value)}
          />
        </div>

        {/* Signature */}
        <div className="rounded-xl border border-lavender-100 bg-lavender-50/30 p-4">
          <SignaturePad value={signature} onChange={setSignature} />
        </div>

        {/* Récap + download */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-lavender-100 pt-4">
          <div className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between gap-8 text-gray-700">
              <span>Sous-total</span>
              <span>{fmt(totals.sousTotal)}</span>
            </div>
            {remisePct > 0 && (
              <div className="flex justify-between gap-8 text-lavender-700">
                <span>Remise {remisePct}%</span>
                <span>-{fmt(totals.remise)}</span>
              </div>
            )}
            <div className="flex justify-between gap-8 text-gray-700">
              <span>Livraison</span>
              <span>{totals.livraisonCents === 0 ? "Offerte" : fmt(totals.livraisonCents)}</span>
            </div>
            {tva && (
              <div className="flex justify-between gap-8 text-gray-700">
                <span>TVA 20%</span>
                <span>{fmt(totals.tvaCents)}</span>
              </div>
            )}
            <div className="flex justify-between gap-8 font-bold text-forest text-base">
              <span>{tva ? "Total TTC" : "Total net"}</span>
              <span>{fmt(totals.totalTTC)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!hasContent || generating}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-forest px-6 py-3 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-light disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2"
          >
            {generating ? (
              <>
                <Loader2 size={16} aria-hidden className="animate-spin" />
                Génération…
              </>
            ) : (
              <>
                <Download size={16} aria-hidden />
                Télécharger le PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
