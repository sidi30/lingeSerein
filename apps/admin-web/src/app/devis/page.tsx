"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  FileText,
  Minus,
  Plus,
  Percent,
  TrendingUp,
  Euro,
  Truck,
  RotateCcw,
  Printer,
} from "lucide-react";

/* ─── Données tarifaires ─── */

interface Gamme {
  key: string;
  name: string;
  grammage: string;
  items: string[];
  /** Prix unitaire par palier (en €) */
  paliers: [number, number, number, number];
  /** Coût de revient par set (€) — lavage, logistique, amortissement */
  cout: number;
}

const GAMMES: Gamme[] = [
  {
    key: "confort",
    name: "Confort",
    grammage: "500 g/m²",
    items: ["Drap de bain 70×140", "Serviette 50×90", "Tapis de bain 50×70"],
    paliers: [6.0, 5.5, 5.0, 4.5],
    cout: 2.5,
  },
  {
    key: "hotel",
    name: "Hôtel",
    grammage: "550 g/m²",
    items: ["Drap de bain 70×140", "Serviette 50×90", "Tapis de bain 50×70", "Gant de toilette"],
    paliers: [9.0, 8.5, 8.0, 7.0],
    cout: 3.5,
  },
  {
    key: "prestige",
    name: "Prestige",
    grammage: "600 g/m² coton peigné",
    items: ["Drap de bain 100×150", "Serviette peignée", "Tapis épais", "Gant de toilette"],
    paliers: [14.0, 13.0, 12.0, 11.0],
    cout: 5.5,
  },
];

const PALIER_LABELS = ["1–3 sets", "4–9 sets", "10–19 sets", "20+ sets"];

const FREQUENCES = [
  { value: 1, label: "1× / semaine" },
  { value: 2, label: "2× / semaine" },
  { value: 4, label: "4× / mois" },
  { value: 2, label: "2× / mois" },
];

/** Frais de livraison : 5 € si < 4 sets, offerte sinon */
const FRAIS_LIVRAISON = 5;

function getPalierIndex(qty: number): number {
  if (qty <= 3) return 0;
  if (qty <= 9) return 1;
  if (qty <= 19) return 2;
  return 3;
}

function formatEuro(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Composant principal ─── */

export default function DevisPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Quantités par gamme
  const [quantities, setQuantities] = useState<Record<string, number>>({
    confort: 0,
    hotel: 0,
    prestige: 0,
  });

  // Fréquence de livraison par mois
  const [frequence, setFrequence] = useState(4);

  // Ristourne en % (appliquée sur le total HT)
  const [ristourne, setRistourne] = useState(0);

  // Nom du client (optionnel, pour l'affichage)
  const [clientName, setClientName] = useState("");

  const updateQty = useCallback((key: string, delta: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  }, []);

  const setQty = useCallback((key: string, value: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }, []);

  const reset = useCallback(() => {
    setQuantities({ confort: 0, hotel: 0, prestige: 0 });
    setRistourne(0);
    setClientName("");
    setFrequence(4);
  }, []);

  /* ─── Calculs ─── */

  const calculs = useMemo(() => {
    const totalSets = Object.values(quantities).reduce((a, b) => a + b, 0);
    const palierIdx = getPalierIndex(totalSets);

    let totalHTBrut = 0;
    let totalCout = 0;
    const lignes: {
      gamme: Gamme;
      qty: number;
      prixUnit: number;
      totalLigne: number;
      coutLigne: number;
    }[] = [];

    for (const gamme of GAMMES) {
      const qty = quantities[gamme.key];
      if (qty === 0) continue;
      const prixUnit = gamme.paliers[palierIdx];
      const totalLigne = prixUnit * qty;
      const coutLigne = gamme.cout * qty;
      totalHTBrut += totalLigne;
      totalCout += coutLigne;
      lignes.push({ gamme, qty, prixUnit, totalLigne, coutLigne });
    }

    // Livraison par livraison
    const livraisonParPassage = totalSets >= 4 ? 0 : totalSets > 0 ? FRAIS_LIVRAISON : 0;
    const livraisonMensuelle = livraisonParPassage * frequence;

    // CA mensuel brut (avant ristourne)
    const caMensuelBrut = totalHTBrut * frequence + livraisonMensuelle;

    // Ristourne
    const montantRistourne = (totalHTBrut * frequence * ristourne) / 100;

    // CA mensuel net
    const caMensuelNet = caMensuelBrut - montantRistourne;

    // Coût mensuel total
    const coutMensuel = totalCout * frequence;

    // Marge
    const margeMensuelle = caMensuelNet - coutMensuel;
    const margePct = caMensuelNet > 0 ? (margeMensuelle / caMensuelNet) * 100 : 0;

    // CA annuel
    const caAnnuel = caMensuelNet * 12;
    const margeAnnuelle = margeMensuelle * 12;

    return {
      totalSets,
      palierIdx,
      lignes,
      livraisonParPassage,
      livraisonMensuelle,
      caMensuelBrut,
      montantRistourne,
      caMensuelNet,
      coutMensuel,
      margeMensuelle,
      margePct,
      caAnnuel,
      margeAnnuelle,
    };
  }, [quantities, frequence, ristourne]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!user) return null;

  const margeColor =
    calculs.margePct >= 40
      ? "text-emerald-600"
      : calculs.margePct >= 25
        ? "text-amber-600"
        : calculs.margePct > 0
          ? "text-red-500"
          : "text-gray-400";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Simulateur de devis</h1>
              <p className="text-xs text-gray-500">Linge Serein</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RotateCcw size={16} />
              Réinitialiser
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
            >
              <Printer size={16} />
              Imprimer
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* ─── Nom client ─── */}
        <div className="mb-8">
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Nom du client ou de l'établissement (optionnel)"
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-lg font-medium text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* ─── Colonne gauche : sélection produits ─── */}
          <div className="lg:col-span-3 space-y-6">
            {/* Gammes */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-base font-semibold text-gray-900">Produits</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Palier actuel :{" "}
                  <span className="font-semibold text-primary-600">
                    {calculs.totalSets > 0 ? PALIER_LABELS[calculs.palierIdx] : "—"}
                  </span>
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {GAMMES.map((gamme) => {
                  const qty = quantities[gamme.key];
                  const prixUnit =
                    calculs.totalSets > 0 ? gamme.paliers[calculs.palierIdx] : gamme.paliers[0];

                  return (
                    <div key={gamme.key} className="flex items-center gap-6 px-6 py-5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-gray-900">{gamme.name}</span>
                          <span className="text-xs text-gray-400">{gamme.grammage}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{gamme.items.join(" · ")}</p>
                        <p className="text-sm font-semibold text-primary-600 mt-1">
                          {formatEuro(prixUnit)} € / set
                        </p>
                      </div>

                      {/* Quantité */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(gamme.key, -1)}
                          disabled={qty === 0}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={(e) => setQty(gamme.key, parseInt(e.target.value) || 0)}
                          className="h-9 w-16 rounded-lg border border-gray-300 text-center text-sm font-semibold text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => updateQty(gamme.key, 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-100"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* Total ligne */}
                      <div className="w-24 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {qty > 0 ? `${formatEuro(prixUnit * qty)} €` : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fréquence + Livraison */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Truck size={18} className="text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Fréquence de livraison</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCES.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setFrequence(f.value)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        frequence === f.value &&
                        FREQUENCES.findIndex(
                          (x) => x.value === frequence && x.label === f.label,
                        ) === i
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Livraison :{" "}
                  {calculs.livraisonParPassage === 0
                    ? "Offerte (4+ sets)"
                    : `${FRAIS_LIVRAISON} € / passage`}
                </p>
              </div>

              {/* Ristourne */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Percent size={18} className="text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Ristourne client</h3>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={ristourne}
                    onChange={(e) => setRistourne(Number(e.target.value))}
                    className="flex-1 accent-primary-600"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={ristourne}
                      onChange={(e) =>
                        setRistourne(Math.min(50, Math.max(0, Number(e.target.value) || 0)))
                      }
                      className="h-9 w-16 rounded-lg border border-gray-300 text-center text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-sm font-medium text-gray-500">%</span>
                  </div>
                </div>
                {calculs.montantRistourne > 0 && (
                  <p className="mt-3 text-xs text-gray-500">
                    Remise mensuelle :{" "}
                    <span className="font-semibold text-red-500">
                      −{formatEuro(calculs.montantRistourne)} €
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Colonne droite : résumé financier ─── */}
          <div className="lg:col-span-2 space-y-6">
            {/* KPIs principaux */}
            <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-primary-800 mb-5">Récapitulatif mensuel</h2>

              {/* Détail lignes */}
              {calculs.lignes.length > 0 && (
                <div className="mb-5 space-y-2">
                  {calculs.lignes.map((l) => (
                    <div key={l.gamme.key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {l.qty}× {l.gamme.name}
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatEuro(l.totalLigne * frequence)} €
                      </span>
                    </div>
                  ))}
                  {calculs.livraisonMensuelle > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Livraison ({frequence}×)</span>
                      <span className="font-medium text-gray-900">
                        {formatEuro(calculs.livraisonMensuelle)} €
                      </span>
                    </div>
                  )}
                  {calculs.montantRistourne > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Ristourne (−{ristourne}%)</span>
                      <span className="font-medium text-red-500">
                        −{formatEuro(calculs.montantRistourne)} €
                      </span>
                    </div>
                  )}
                  <div className="border-t border-primary-200 pt-2" />
                </div>
              )}

              {/* CA mensuel */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Euro size={18} className="text-primary-600" />
                  <span className="text-sm font-medium text-gray-700">CA mensuel net</span>
                </div>
                <span className="text-3xl font-bold text-gray-900">
                  {calculs.totalSets > 0 ? `${formatEuro(calculs.caMensuelNet)} €` : "—"}
                </span>
              </div>

              {/* Marge */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary-600" />
                  <span className="text-sm font-medium text-gray-700">Marge mensuelle</span>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${margeColor}`}>
                    {calculs.totalSets > 0 ? `${formatEuro(calculs.margeMensuelle)} €` : "—"}
                  </span>
                  {calculs.totalSets > 0 && (
                    <span className={`ml-2 text-sm font-semibold ${margeColor}`}>
                      ({formatEuro(calculs.margePct)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Barre de marge visuelle */}
              {calculs.totalSets > 0 && (
                <div className="mb-6">
                  <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        calculs.margePct >= 40
                          ? "bg-emerald-500"
                          : calculs.margePct >= 25
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, calculs.margePct))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                    <span>0%</span>
                    <span>25%</span>
                    <span>40%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Séparateur */}
              <div className="border-t border-primary-200 pt-5" />

              {/* CA annuel */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">CA annuel estimé</span>
                <span className="text-xl font-bold text-gray-900">
                  {calculs.totalSets > 0 ? `${formatEuro(calculs.caAnnuel)} €` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Marge annuelle</span>
                <span className={`text-xl font-bold ${margeColor}`}>
                  {calculs.totalSets > 0 ? `${formatEuro(calculs.margeAnnuelle)} €` : "—"}
                </span>
              </div>
            </div>

            {/* Tableau tarifs dégressifs (référence rapide) */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Grille tarifaire</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-4 py-2.5 text-left font-medium">Gamme</th>
                    {PALIER_LABELS.map((label, i) => (
                      <th
                        key={label}
                        className={`px-3 py-2.5 text-center font-medium ${
                          calculs.totalSets > 0 && i === calculs.palierIdx
                            ? "bg-primary-100 text-primary-700"
                            : ""
                        }`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GAMMES.map((gamme) => (
                    <tr key={gamme.key} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{gamme.name}</td>
                      {gamme.paliers.map((p, i) => (
                        <td
                          key={i}
                          className={`px-3 py-2.5 text-center ${
                            calculs.totalSets > 0 && i === calculs.palierIdx
                              ? "bg-primary-50 font-semibold text-primary-700"
                              : "text-gray-600"
                          }`}
                        >
                          {formatEuro(p)} €
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200">
                    <td className="px-4 py-2.5 font-medium text-gray-900">Livraison</td>
                    <td className="px-3 py-2.5 text-center text-gray-600">+5 €</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-primary-600">
                      Offerte
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold text-primary-600">
                      Offerte
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold text-primary-600">
                      Offerte
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Info coûts (visible uniquement pour l'admin, masqué à l'impression) */}
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 print:hidden">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Détail coûts (confidentiel)
              </h3>
              {calculs.lignes.length > 0 ? (
                <div className="space-y-1.5">
                  {calculs.lignes.map((l) => (
                    <div key={l.gamme.key} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        {l.qty}× {l.gamme.name} — coût {formatEuro(l.gamme.cout)} €/set
                      </span>
                      <span className="font-medium text-gray-700">
                        {formatEuro(l.coutLigne * frequence)} € /mois
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-gray-300 pt-1.5 text-xs">
                    <span className="font-medium text-gray-700">Coût total</span>
                    <span className="font-semibold text-gray-900">
                      {formatEuro(calculs.coutMensuel)} € /mois
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Ajoutez des produits pour voir le détail des coûts.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Print styles ─── */}
      <style jsx global>{`
        @media print {
          header {
            position: static !important;
            border: none !important;
            background: white !important;
          }
          header button {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
