"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Percent, TrendingUp, Calendar, Truck } from "lucide-react";

/* ─── Catalogue produits ─── */

interface Product {
  id: string;
  name: string;
  shortName: string;
  costCents: number; // ton prix d'achat
  prices: Record<string, number>; // prix de vente par gamme (cents)
}

const products: Product[] = [
  {
    id: "drap",
    name: "Drap de bain",
    shortName: "Draps",
    costCents: 120,
    prices: { confort: 250, hotel: 380, prestige: 550 },
  },
  {
    id: "serviette",
    name: "Serviette",
    shortName: "Serviettes",
    costCents: 80,
    prices: { confort: 180, hotel: 270, prestige: 420 },
  },
  {
    id: "tapis",
    name: "Tapis de bain",
    shortName: "Tapis",
    costCents: 90,
    prices: { confort: 170, hotel: 250, prestige: 430 },
  },
  {
    id: "gant",
    name: "Gant de toilette",
    shortName: "Gants",
    costCents: 30,
    prices: { confort: 0, hotel: 100, prestige: 150 },
  },
];

const gammes = [
  { id: "confort", name: "Confort", label: "500 g/m²" },
  { id: "hotel", name: "Hôtel", label: "550 g/m² peigné" },
  { id: "prestige", name: "Prestige", label: "600 g/m² égyptien" },
];

function fmt(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

function fmtShort(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) +
    " €"
  );
}

/* ─── Slider component ─── */

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  color = "forest",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`font-serif text-lg font-bold text-${color}`}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

/* ─── Page ─── */

export default function DevisPage() {
  // Gamme
  const [gammeId, setGammeId] = useState("hotel");

  // Quantités par produit
  const [qtys, setQtys] = useState<Record<string, number>>({
    drap: 8,
    serviette: 8,
    tapis: 8,
    gant: 4,
  });

  // Fréquence (livraisons / mois)
  const [livraisonsParMois, setLivraisonsParMois] = useState(4);

  // Durée engagement
  const [mois, setMois] = useState(6);

  // Réduction client (%)
  const [reduction, setReduction] = useState(0);

  const updateQty = useCallback((id: string, val: number) => {
    setQtys((prev) => ({ ...prev, [id]: val }));
  }, []);

  const gamme = gammes.find((g) => g.id === gammeId)!;

  const calc = useMemo(() => {
    let totalVenteLivraison = 0;
    let totalCoutLivraison = 0;
    const lignes: { name: string; qty: number; prixUnit: number; cout: number; total: number }[] =
      [];

    for (const p of products) {
      const qty = qtys[p.id] ?? 0;
      if (qty === 0) continue;
      const prixUnit = p.prices[gammeId] ?? 0;
      if (prixUnit === 0) continue;
      const total = prixUnit * qty;
      const cout = p.costCents * qty;
      totalVenteLivraison += total;
      totalCoutLivraison += cout;
      lignes.push({ name: p.shortName, qty, prixUnit, cout, total });
    }

    const livraisonFrais =
      totalVenteLivraison > 0 && Object.values(qtys).reduce((a, b) => a + b, 0) < 4 ? 500 : 0;

    // Réduction
    const reductionMontant = Math.round(totalVenteLivraison * (reduction / 100));
    const venteApresReduc = totalVenteLivraison - reductionMontant + livraisonFrais;

    // Marge par livraison
    const margeLivraison = venteApresReduc - totalCoutLivraison;
    const margePct = venteApresReduc > 0 ? (margeLivraison / venteApresReduc) * 100 : 0;

    // Par mois
    const venteMois = venteApresReduc * livraisonsParMois;
    const coutMois = totalCoutLivraison * livraisonsParMois;
    const margeMois = venteMois - coutMois;

    // Total engagement
    const venteTotal = venteMois * mois;
    const coutTotal = coutMois * mois;
    const margeTotal = venteTotal - coutTotal;

    return {
      lignes,
      totalVenteLivraison,
      totalCoutLivraison,
      livraisonFrais,
      reductionMontant,
      venteApresReduc,
      margeLivraison,
      margePct,
      venteMois,
      margeMois,
      venteTotal,
      coutTotal,
      margeTotal,
    };
  }, [qtys, gammeId, reduction, livraisonsParMois, mois]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-lavender-100 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/logo_full.svg"
              alt="Linge Serein"
              width={140}
              height={60}
              className="h-9 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest transition-colors"
          >
            <ArrowLeft size={15} />
            Retour
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 md:py-14">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-forest">
            Simulateur de devis
          </h1>
          <p className="mt-2 text-gray-500 text-sm">
            Choisissez vos produits, ajustez les quantités, visualisez marge et total
            instantanément.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ── LEFT: Configuration ── */}
          <div className="lg:col-span-7 space-y-6">
            {/* Gamme */}
            <div className="rounded-2xl bg-white border border-lavender-100 p-5">
              <h2 className="font-serif text-base font-bold text-forest mb-4">Gamme</h2>
              <div className="grid grid-cols-3 gap-2">
                {gammes.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGammeId(g.id)}
                    className={`rounded-xl px-3 py-3 text-center transition-all duration-200 ${
                      gammeId === g.id
                        ? "bg-forest text-white shadow-md"
                        : "bg-lavender-50 text-gray-600 hover:bg-lavender-100"
                    }`}
                  >
                    <p className="font-semibold text-sm">{g.name}</p>
                    <p
                      className={`text-[10px] mt-0.5 ${gammeId === g.id ? "text-white/60" : "text-gray-400"}`}
                    >
                      {g.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Produits — sliders */}
            <div className="rounded-2xl bg-white border border-lavender-100 p-5">
              <h2 className="font-serif text-base font-bold text-forest mb-5">
                Produits par livraison
              </h2>
              <div className="space-y-6">
                {products.map((p) => {
                  const price = p.prices[gammeId] ?? 0;
                  if (price === 0 && gammeId === "confort" && p.id === "gant") {
                    return (
                      <div key={p.id} className="opacity-40">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">{p.name}</span>
                          <span className="text-xs text-gray-400">Non inclus en Confort</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={p.id}>
                      <Slider
                        label={`${p.name} — ${fmtShort(price)} / pièce`}
                        value={qtys[p.id] ?? 0}
                        onChange={(v) => updateQty(p.id, v)}
                        min={0}
                        max={50}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fréquence + Durée + Réduction */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Truck size={16} className="text-forest" />
                  <h2 className="font-serif text-sm font-bold text-forest">Livraisons / mois</h2>
                </div>
                <Slider
                  label=""
                  value={livraisonsParMois}
                  onChange={setLivraisonsParMois}
                  min={1}
                  max={12}
                  suffix="×"
                />
              </div>

              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={16} className="text-forest" />
                  <h2 className="font-serif text-sm font-bold text-forest">Engagement</h2>
                </div>
                <Slider label="" value={mois} onChange={setMois} min={1} max={24} suffix=" mois" />
              </div>

              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Percent size={16} className="text-lavender-600" />
                  <h2 className="font-serif text-sm font-bold text-forest">Réduction client</h2>
                </div>
                <Slider
                  label=""
                  value={reduction}
                  onChange={setReduction}
                  min={0}
                  max={30}
                  suffix="%"
                  color="lavender-600"
                />
              </div>
            </div>
          </div>

          {/* ── RIGHT: Résumé ── */}
          <div className="lg:col-span-5">
            <div className="sticky top-20 space-y-4">
              {/* Récap par livraison */}
              <div className="rounded-2xl bg-white border border-lavender-100 shadow-lg shadow-lavender-100/20 overflow-hidden">
                <div className="bg-forest px-5 py-4">
                  <h3 className="font-serif text-base font-bold text-white">Récap par livraison</h3>
                  <p className="text-[11px] text-white/50">Gamme {gamme.name}</p>
                </div>
                <div className="p-5">
                  {/* Lignes produits */}
                  <div className="space-y-2 mb-4">
                    {calc.lignes.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">Ajoutez des produits</p>
                    )}
                    {calc.lignes.map((l) => (
                      <div key={l.name} className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {l.qty}× {l.name}
                        </span>
                        <span className="font-medium text-gray-800">{fmt(l.total)}</span>
                      </div>
                    ))}
                  </div>

                  {calc.lignes.length > 0 && (
                    <>
                      <div className="h-px bg-lavender-100 my-3" />

                      {/* Sous-total */}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Sous-total</span>
                        <span className="text-gray-700">{fmt(calc.totalVenteLivraison)}</span>
                      </div>

                      {/* Livraison */}
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">Livraison</span>
                        <span
                          className={
                            calc.livraisonFrais === 0
                              ? "font-semibold text-forest"
                              : "text-gray-700"
                          }
                        >
                          {calc.livraisonFrais === 0 ? "Offerte" : fmt(calc.livraisonFrais)}
                        </span>
                      </div>

                      {/* Réduction */}
                      {reduction > 0 && (
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-lavender-600">Réduction {reduction}%</span>
                          <span className="font-semibold text-lavender-600">
                            -{fmt(calc.reductionMontant)}
                          </span>
                        </div>
                      )}

                      <div className="h-px bg-lavender-100 my-3" />

                      {/* Total livraison */}
                      <div className="flex justify-between items-end">
                        <span className="text-sm text-gray-500">Total / livraison</span>
                        <span className="font-serif text-2xl font-bold text-forest">
                          {fmt(calc.venteApresReduc)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Marge */}
              {calc.lignes.length > 0 && (
                <div className="rounded-2xl bg-forest/5 border border-forest/10 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-forest" />
                    <h3 className="font-serif text-sm font-bold text-forest">Rentabilité</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                        Marge / livraison
                      </p>
                      <p
                        className={`font-serif text-lg font-bold ${calc.margeLivraison >= 0 ? "text-forest" : "text-red-600"}`}
                      >
                        {fmt(calc.margeLivraison)}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {calc.margePct.toFixed(1)}% de marge
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                        Marge / mois
                      </p>
                      <p
                        className={`font-serif text-lg font-bold ${calc.margeMois >= 0 ? "text-forest" : "text-red-600"}`}
                      >
                        {fmt(calc.margeMois)}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {livraisonsParMois} livraison{livraisonsParMois > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-white p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                      Total sur {mois} mois
                    </p>
                    <div className="flex items-center justify-center gap-4">
                      <div>
                        <p className="text-xs text-gray-400">CA client</p>
                        <p className="font-serif text-base font-bold text-gray-700">
                          {fmt(calc.venteTotal)}
                        </p>
                      </div>
                      <div className="h-8 w-px bg-lavender-200" />
                      <div>
                        <p className="text-xs text-gray-400">Coût</p>
                        <p className="font-serif text-base font-bold text-gray-500">
                          {fmt(calc.coutTotal)}
                        </p>
                      </div>
                      <div className="h-8 w-px bg-lavender-200" />
                      <div>
                        <p className="text-xs text-forest">Marge</p>
                        <p
                          className={`font-serif text-base font-bold ${calc.margeTotal >= 0 ? "text-forest" : "text-red-600"}`}
                        >
                          {fmt(calc.margeTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="space-y-2">
                <a
                  href="https://lingeserein.fr/#contact"
                  className="group flex items-center justify-center gap-2 rounded-full bg-forest w-full py-3.5 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-all hover:bg-forest-light hover:-translate-y-0.5"
                >
                  Envoyer ce devis au client
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </a>
                <a
                  href="tel:+33490000000"
                  className="flex items-center justify-center rounded-full border border-lavender-200 w-full py-3 text-sm text-forest hover:bg-lavender-50 transition-colors"
                >
                  04 90 00 00 00
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Custom slider styles */}
      <style jsx global>{`
        .slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            #1b5e20 0%,
            #1b5e20 var(--pct, 50%),
            #ede8f5 var(--pct, 50%),
            #ede8f5 100%
          );
          outline: none;
          cursor: pointer;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 3px solid #1b5e20;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
          cursor: grab;
          transition: transform 0.15s ease;
        }
        .slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.05);
        }
        .slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 3px solid #1b5e20;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
          cursor: grab;
        }
        .slider::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: #ede8f5;
        }
        .slider::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: #1b5e20;
        }
      `}</style>
    </div>
  );
}
