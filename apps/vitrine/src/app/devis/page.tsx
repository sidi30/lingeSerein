"use client";

import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

const VALID_GAMMES = new Set(gammes.map((g) => g.id));

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
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className={`font-serif text-lg font-bold tabular-nums text-${color}`}>
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
        aria-label={label || "Curseur"}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-[10px] text-gray-600 mt-1 tabular-nums">
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

/* ─── Page inner (uses searchParams) ─── */

function DevisPageInner() {
  const searchParams = useSearchParams();
  const initialGamme = (() => {
    const g = searchParams.get("gamme");
    return g && VALID_GAMMES.has(g) ? g : "hotel";
  })();
  const isAdmin = searchParams.get("admin") === "1";

  const [gammeId, setGammeId] = useState(initialGamme);
  const [qtys, setQtys] = useState<Record<string, number>>({
    drap: 8,
    serviette: 8,
    tapis: 8,
    gant: 4,
  });
  const [livraisonsParMois, setLivraisonsParMois] = useState(4);
  const [mois, setMois] = useState(6);
  const [reduction, setReduction] = useState(0);

  useEffect(() => {
    const g = searchParams.get("gamme");
    if (g && VALID_GAMMES.has(g)) setGammeId(g);
  }, [searchParams]);

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

    const reductionMontant = Math.round(totalVenteLivraison * (reduction / 100));
    const venteApresReduc = totalVenteLivraison - reductionMontant + livraisonFrais;

    const margeLivraison = venteApresReduc - totalCoutLivraison;
    const margePct = venteApresReduc > 0 ? (margeLivraison / venteApresReduc) * 100 : 0;

    const venteMois = venteApresReduc * livraisonsParMois;
    const coutMois = totalCoutLivraison * livraisonsParMois;
    const margeMois = venteMois - coutMois;

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
    <div className="min-h-dvh bg-cream">
      <header className="bg-white/85 backdrop-blur-sm border-b border-lavender-100 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/logo_full.png"
              alt="Linge Serein"
              width={512}
              height={512}
              className="h-9 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-forest transition-colors"
          >
            <ArrowLeft size={15} aria-hidden />
            Retour
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 md:py-14">
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-forest">
            Simulateur de devis
          </h1>
          <p className="mt-2 text-gray-700 text-sm">
            Choisissez vos produits, ajustez les quantités, visualisez votre total instantanément.
          </p>
          {isAdmin && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lavender-100 px-3 py-1 text-[11px] font-semibold text-lavender-800">
              Mode commercial — rentabilité visible
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-2xl bg-white border border-lavender-100 p-5">
              <h2 className="font-serif text-base font-bold text-forest mb-4">Gamme</h2>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Choix de gamme">
                {gammes.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={gammeId === g.id}
                    onClick={() => setGammeId(g.id)}
                    className={`min-h-[44px] rounded-xl px-3 py-3 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                      gammeId === g.id
                        ? "bg-forest text-white shadow-md"
                        : "bg-lavender-50 text-gray-800 hover:bg-lavender-100"
                    }`}
                  >
                    <p className="font-semibold text-sm">{g.name}</p>
                    <p
                      className={`text-[10px] mt-0.5 ${gammeId === g.id ? "text-white/80" : "text-gray-700"}`}
                    >
                      {g.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-lavender-100 p-5">
              <h2 className="font-serif text-base font-bold text-forest mb-5">
                Produits par livraison
              </h2>
              <div className="space-y-6">
                {products.map((p) => {
                  const price = p.prices[gammeId] ?? 0;
                  if (price === 0 && gammeId === "confort" && p.id === "gant") {
                    return (
                      <div key={p.id} className="opacity-50">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{p.name}</span>
                          <span className="text-xs text-gray-600">Non inclus en Confort</span>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Truck size={16} aria-hidden className="text-forest" />
                  <h2 className="font-serif text-sm font-bold text-forest">Livraisons / mois</h2>
                </div>
                <Slider
                  label="Livraisons par mois"
                  value={livraisonsParMois}
                  onChange={setLivraisonsParMois}
                  min={1}
                  max={12}
                  suffix="×"
                />
              </div>

              <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={16} aria-hidden className="text-forest" />
                  <h2 className="font-serif text-sm font-bold text-forest">Engagement</h2>
                </div>
                <Slider
                  label="Durée d'engagement"
                  value={mois}
                  onChange={setMois}
                  min={1}
                  max={24}
                  suffix=" mois"
                />
              </div>

              {isAdmin && (
                <div className="rounded-2xl bg-white border border-lavender-100 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Percent size={16} aria-hidden className="text-lavender-700" />
                    <h2 className="font-serif text-sm font-bold text-forest">Réduction</h2>
                  </div>
                  <Slider
                    label="Réduction commerciale"
                    value={reduction}
                    onChange={setReduction}
                    min={0}
                    max={30}
                    suffix="%"
                    color="lavender-700"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-2xl bg-white border border-lavender-100 shadow-lg shadow-lavender-100/20 overflow-hidden">
                <div className="bg-forest px-5 py-4">
                  <h3 className="font-serif text-base font-bold text-white">Récap par livraison</h3>
                  <p className="text-[11px] text-white/80">Gamme {gamme.name}</p>
                </div>
                <div className="p-5">
                  <div className="space-y-2 mb-4">
                    {calc.lignes.length === 0 && (
                      <p className="text-sm text-gray-700 text-center py-4">
                        Ajoutez des produits pour voir votre devis
                      </p>
                    )}
                    {calc.lignes.map((l) => (
                      <div key={l.name} className="flex justify-between text-sm tabular-nums">
                        <span className="text-gray-800">
                          {l.qty}× {l.name}
                        </span>
                        <span className="font-medium text-gray-900">{fmt(l.total)}</span>
                      </div>
                    ))}
                  </div>

                  {calc.lignes.length > 0 && (
                    <>
                      <div className="h-px bg-lavender-100 my-3" />

                      <div className="flex justify-between text-sm tabular-nums">
                        <span className="text-gray-700">Sous-total</span>
                        <span className="text-gray-900">{fmt(calc.totalVenteLivraison)}</span>
                      </div>

                      <div className="flex justify-between text-sm mt-1 tabular-nums">
                        <span className="text-gray-700">Livraison</span>
                        <span
                          className={
                            calc.livraisonFrais === 0
                              ? "font-semibold text-forest"
                              : "text-gray-900"
                          }
                        >
                          {calc.livraisonFrais === 0 ? "Offerte" : fmt(calc.livraisonFrais)}
                        </span>
                      </div>

                      {isAdmin && reduction > 0 && (
                        <div className="flex justify-between text-sm mt-1 tabular-nums">
                          <span className="text-lavender-700">Réduction {reduction}%</span>
                          <span className="font-semibold text-lavender-700">
                            -{fmt(calc.reductionMontant)}
                          </span>
                        </div>
                      )}

                      <div className="h-px bg-lavender-100 my-3" />

                      <div className="flex justify-between items-end">
                        <span className="text-sm text-gray-700">Total / livraison</span>
                        <span className="font-serif text-2xl font-bold text-forest tabular-nums">
                          {fmt(calc.venteApresReduc)}
                        </span>
                      </div>

                      <div className="flex justify-between items-end mt-1">
                        <span className="text-xs text-gray-700">Estimé / mois</span>
                        <span className="font-serif text-base font-semibold text-forest tabular-nums">
                          {fmt(calc.venteMois)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {isAdmin && calc.lignes.length > 0 && (
                <div className="rounded-2xl bg-forest/5 border border-forest/10 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} aria-hidden className="text-forest" />
                    <h3 className="font-serif text-sm font-bold text-forest">
                      Rentabilité (interne)
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-gray-700 mb-1">
                        Marge / livraison
                      </p>
                      <p
                        className={`font-serif text-lg font-bold tabular-nums ${calc.margeLivraison >= 0 ? "text-forest" : "text-red-700"}`}
                      >
                        {fmt(calc.margeLivraison)}
                      </p>
                      <p className="text-[10px] text-gray-700 tabular-nums">
                        {calc.margePct.toFixed(1)}% de marge
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-gray-700 mb-1">
                        Marge / mois
                      </p>
                      <p
                        className={`font-serif text-lg font-bold tabular-nums ${calc.margeMois >= 0 ? "text-forest" : "text-red-700"}`}
                      >
                        {fmt(calc.margeMois)}
                      </p>
                      <p className="text-[10px] text-gray-700">
                        {livraisonsParMois} livraison{livraisonsParMois > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-white p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-gray-700 mb-1">
                      Total sur {mois} mois
                    </p>
                    <div className="flex items-center justify-center gap-4 tabular-nums">
                      <div>
                        <p className="text-xs text-gray-700">CA client</p>
                        <p className="font-serif text-base font-bold text-gray-900">
                          {fmt(calc.venteTotal)}
                        </p>
                      </div>
                      <div className="h-8 w-px bg-lavender-200" />
                      <div>
                        <p className="text-xs text-gray-700">Coût</p>
                        <p className="font-serif text-base font-bold text-gray-700">
                          {fmt(calc.coutTotal)}
                        </p>
                      </div>
                      <div className="h-8 w-px bg-lavender-200" />
                      <div>
                        <p className="text-xs text-forest">Marge</p>
                        <p
                          className={`font-serif text-base font-bold ${calc.margeTotal >= 0 ? "text-forest" : "text-red-700"}`}
                        >
                          {fmt(calc.margeTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <a
                  href="/#contact"
                  className="group flex items-center justify-center gap-2 rounded-full bg-forest w-full py-3.5 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  Recevoir mon devis officiel
                  <ArrowRight
                    size={15}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-1"
                  />
                </a>
                <a
                  href="tel:+33753569548"
                  className="flex items-center justify-center rounded-full border border-lavender-300 w-full py-3 text-sm text-forest hover:bg-lavender-50 transition-colors"
                >
                  07 53 56 95 48
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

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
        .slider:focus-visible::-webkit-slider-thumb {
          outline: 3px solid #5e5488;
          outline-offset: 2px;
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

export default function DevisPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-cream flex items-center justify-center">
          <p className="text-gray-700">Chargement du simulateur...</p>
        </div>
      }
    >
      <DevisPageInner />
    </Suspense>
  );
}
