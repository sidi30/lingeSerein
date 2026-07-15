"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, FileSignature, Loader2 } from "lucide-react";
import type { ContractData } from "@/lib/contract-pdf";
import { SignaturePad } from "./signature-pad";
import { SUBSCRIPTION_DEFAULTS } from "@lingengo/shared";

function todayFr(): string {
  return new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function defaultNumero(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `CTR-${d.getFullYear()}${p(d.getMonth() + 1)}-001`;
}

const inputCls =
  "w-full rounded-lg border border-lavender-200 bg-white px-3 py-2 text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";

export function ContractGenerator() {
  // Init vide → rempli au montage pour éviter tout mismatch d'hydratation (date runtime ≠ build).
  const [numero, setNumero] = useState("");
  const [date, setDate] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [lieu, setLieu] = useState("Orange");

  useEffect(() => {
    setNumero((n) => n || defaultNumero());
    setDate((d) => d || todayFr());
  }, []);

  const [client, setClient] = useState({
    nom: "",
    etablissement: "",
    identifiant: "",
    adresse: "",
    email: "",
    tel: "",
  });

  const [prixEuros, setPrixEuros] = useState<number>(SUBSCRIPTION_DEFAULTS.PRICE_CENTS / 100);
  const [kitsBain, setKitsBain] = useState<number>(SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY);
  const [kitsLit, setKitsLit] = useState<number>(SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY);
  const [livraisonsIncluses, setLivraisonsIncluses] = useState<number>(1);
  const [engagementMois, setEngagementMois] = useState<number>(
    SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS,
  );
  const [preavisJours, setPreavisJours] = useState<number>(
    SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS,
  );
  const [jourFacturation, setJourFacturation] = useState("1er");
  const [depotEuros, setDepotEuros] = useState(0);
  const [conditionsParticulieres, setConditionsParticulieres] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const setClientField = (k: keyof typeof client, v: string) =>
    setClient((prev) => ({ ...prev, [k]: v }));

  const buildData = useCallback(
    (): ContractData => ({
      numero,
      date,
      lieu,
      client,
      prixMensuelCents: Math.round(prixEuros * 100),
      kitsBain,
      kitsLit,
      livraisonsIncluses,
      dateDebut,
      engagementMois,
      preavisJours,
      jourFacturation,
      depotGarantieCents: Math.round(depotEuros * 100),
      conditionsParticulieres,
      signatureSrc: signature ?? undefined,
    }),
    [
      numero,
      date,
      lieu,
      client,
      prixEuros,
      kitsBain,
      kitsLit,
      livraisonsIncluses,
      dateDebut,
      engagementMois,
      preavisJours,
      jourFacturation,
      depotEuros,
      conditionsParticulieres,
      signature,
    ],
  );

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const { downloadContractPdf } = await import("@/lib/contract-pdf");
      await downloadContractPdf(buildData());
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération du contrat. Réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = client.nom.trim().length > 0 || client.etablissement.trim().length > 0;

  return (
    <div className="rounded-2xl bg-white border border-lavender-200 shadow-sm overflow-hidden mb-8">
      <div className="bg-forest px-5 py-4 flex items-center gap-2">
        <FileSignature size={18} aria-hidden className="text-white" />
        <h2 className="font-serif text-base font-bold text-white">
          Générateur de contrat — Pack Sérénité
        </h2>
      </div>

      <div className="p-5 space-y-6">
        {/* Méta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="ct-num">
              N° de contrat
            </label>
            <input
              id="ct-num"
              className={inputCls}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ct-date">
              Date de signature
            </label>
            <input
              id="ct-date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ct-lieu">
              Lieu de signature
            </label>
            <input
              id="ct-lieu"
              className={inputCls}
              value={lieu}
              onChange={(e) => setLieu(e.target.value)}
            />
          </div>
        </div>

        {/* Client */}
        <div>
          <h3 className="text-sm font-bold text-forest mb-3">Client</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ct-etab">
                Établissement / dénomination
              </label>
              <input
                id="ct-etab"
                className={inputCls}
                placeholder="Gîte de Marie Thomassey"
                value={client.etablissement}
                onChange={(e) => setClientField("etablissement", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-nom">
                Nom du signataire
              </label>
              <input
                id="ct-nom"
                className={inputCls}
                placeholder="Marie Thomassey"
                value={client.nom}
                onChange={(e) => setClientField("nom", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="ct-ident">
                Forme juridique / SIRET (si professionnel — optionnel)
              </label>
              <input
                id="ct-ident"
                className={inputCls}
                placeholder="EI · SIRET 000 000 000 00000"
                value={client.identifiant}
                onChange={(e) => setClientField("identifiant", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="ct-adr">
                Adresse du logement / de facturation
              </label>
              <input
                id="ct-adr"
                className={inputCls}
                placeholder="Cheval Blanc (84460), Vaucluse"
                value={client.adresse}
                onChange={(e) => setClientField("adresse", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-tel">
                Téléphone
              </label>
              <input
                id="ct-tel"
                className={inputCls}
                placeholder="06 ..."
                value={client.tel}
                onChange={(e) => setClientField("tel", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-email">
                Email
              </label>
              <input
                id="ct-email"
                className={inputCls}
                placeholder="contact@email.fr"
                value={client.email}
                onChange={(e) => setClientField("email", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Conditions de l'abonnement */}
        <div>
          <h3 className="text-sm font-bold text-forest mb-3">Conditions de l&apos;abonnement</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls} htmlFor="ct-prix">
                Prix / mois (€)
              </label>
              <input
                id="ct-prix"
                type="number"
                min={0}
                step={0.01}
                className={inputCls}
                value={prixEuros}
                onChange={(e) => setPrixEuros(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-bain">
                Kits bain / mois
              </label>
              <input
                id="ct-bain"
                type="number"
                min={0}
                className={inputCls}
                value={kitsBain}
                onChange={(e) => setKitsBain(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-lit">
                Kits lit / mois
              </label>
              <input
                id="ct-lit"
                type="number"
                min={0}
                className={inputCls}
                value={kitsLit}
                onChange={(e) => setKitsLit(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-liv">
                Livraisons incl./mois
              </label>
              <input
                id="ct-liv"
                type="number"
                min={0}
                className={inputCls}
                value={livraisonsIncluses}
                onChange={(e) => setLivraisonsIncluses(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-debut">
                Prise d&apos;effet
              </label>
              <input
                id="ct-debut"
                className={inputCls}
                placeholder="23 juillet 2026"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-eng">
                Engagement (mois)
              </label>
              <input
                id="ct-eng"
                type="number"
                min={1}
                className={inputCls}
                value={engagementMois}
                onChange={(e) => setEngagementMois(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-preavis">
                Préavis (jours)
              </label>
              <input
                id="ct-preavis"
                type="number"
                min={0}
                className={inputCls}
                value={preavisJours}
                onChange={(e) => setPreavisJours(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-fact">
                Jour de facturation
              </label>
              <input
                id="ct-fact"
                className={inputCls}
                value={jourFacturation}
                onChange={(e) => setJourFacturation(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ct-depot">
                Dépôt de garantie (€)
              </label>
              <input
                id="ct-depot"
                type="number"
                min={0}
                step={0.01}
                className={inputCls}
                value={depotEuros}
                onChange={(e) => setDepotEuros(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Règle : 1 Pack Sérénité par mois (dotation ci-dessus). Les kits au-delà sont facturés au
            tarif normal (kit bain 7,50 € · kit lit 16,50 €). Engagement ferme puis préavis.
          </p>
        </div>

        {/* Conditions particulières */}
        <div>
          <label className={labelCls} htmlFor="ct-cp">
            Conditions particulières (optionnel)
          </label>
          <textarea
            id="ct-cp"
            rows={2}
            className={inputCls}
            placeholder="Ex : créneau de livraison convenu le vendredi, adresse de reprise différente…"
            value={conditionsParticulieres}
            onChange={(e) => setConditionsParticulieres(e.target.value)}
          />
        </div>

        {/* Signature prestataire */}
        <div className="rounded-xl border border-lavender-100 bg-lavender-50/30 p-4">
          <SignaturePad value={signature} onChange={setSignature} />
        </div>

        {/* Download */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-lavender-100 pt-4">
          <p className="text-[11px] text-gray-500 max-w-md">
            Contrat B2B (location &amp; entretien de linge) rédigé pour protéger Linge Serein.
            Généré localement — aucune donnée envoyée. Faites-le relire par un juriste avant usage
            répété.
          </p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canGenerate || generating}
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
                Télécharger le contrat
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
