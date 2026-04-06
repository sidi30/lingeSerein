"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Check, Truck, Sparkles } from "lucide-react";

/* ─── Données tarifs ─── */

const gammes = [
  {
    id: "confort",
    name: "Confort",
    grammage: "500 g/m²",
    desc: "Coton doux, idéal pour les locations saisonnières",
    items: ["Drap de bain 70×140", "Serviette 50×90", "Tapis de bain 50×70"],
    prices: [600, 550, 500, 450], // cents par palier
  },
  {
    id: "hotel",
    name: "Hôtel",
    grammage: "550 g/m² coton peigné",
    desc: "Qualité hôtelière, toucher soyeux",
    items: ["Drap de bain 70×140", "Serviette 50×90", "Tapis de bain 50×70", "Gant de toilette"],
    prices: [900, 850, 800, 700],
  },
  {
    id: "prestige",
    name: "Prestige",
    grammage: "600 g/m² coton égyptien",
    desc: "Le meilleur pour vos établissements haut de gamme",
    items: ["Drap de bain 100×150", "Serviette peignée", "Tapis épais", "Gant de toilette"],
    prices: [1400, 1300, 1200, 1100],
  },
];

const frequences = [
  { id: "ponctuel", label: "Ponctuel", desc: "Commande unique", factor: 1 },
  { id: "2x", label: "2× / mois", desc: "Bi-mensuel", factor: 0.95 },
  { id: "4x", label: "4× / mois", desc: "Hebdomadaire", factor: 0.9 },
  { id: "8x", label: "8× / mois", desc: "2 fois par semaine", factor: 0.85 },
];

function getPricePerSet(gamme: (typeof gammes)[0], qty: number): number {
  if (qty >= 20) return gamme.prices[3]!;
  if (qty >= 10) return gamme.prices[2]!;
  if (qty >= 4) return gamme.prices[1]!;
  return gamme.prices[0]!;
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

/* ─── Page ─── */

export default function DevisPage() {
  const [selectedGamme, setSelectedGamme] = useState("hotel");
  const [qty, setQty] = useState(8);
  const [selectedFreq, setSelectedFreq] = useState("ponctuel");

  const gamme = gammes.find((g) => g.id === selectedGamme)!;
  const freq = frequences.find((f) => f.id === selectedFreq)!;

  const estimate = useMemo(() => {
    const pricePerSet = getPricePerSet(gamme, qty);
    const subtotal = pricePerSet * qty;
    const livraison = qty >= 4 ? 0 : 500; // 5€ si < 4 sets
    const freqDiscount = freq.factor < 1 ? Math.round(subtotal * (1 - freq.factor)) : 0;
    const total = subtotal - freqDiscount + livraison;
    return { pricePerSet, subtotal, livraison, freqDiscount, total };
  }, [gamme, qty, freq]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-lavender-100 sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/logo_full.svg"
              alt="Linge Serein"
              width={160}
              height={70}
              className="h-10 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-forest transition-colors"
          >
            <ArrowLeft size={16} />
            Retour au site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        {/* Title */}
        <div className="text-center mb-16">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-600 mb-4">
            Simulateur
          </span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Estimez votre devis
          </h1>
          <p className="mt-4 text-gray-500 max-w-xl mx-auto text-lg">
            Configurez votre besoin en 3 étapes et obtenez une estimation instantanée.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left — Configuration */}
          <div className="lg:col-span-2 space-y-10">
            {/* Step 1 — Gamme */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
                  1
                </span>
                <h2 className="font-serif text-xl font-bold text-forest">Choisissez votre gamme</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {gammes.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGamme(g.id)}
                    className={`relative text-left rounded-2xl p-6 transition-all duration-300 ${
                      selectedGamme === g.id
                        ? "bg-forest text-white shadow-lg shadow-forest/20 ring-2 ring-forest"
                        : "bg-white border border-lavender-100 hover:border-lavender-300 hover:shadow-md"
                    }`}
                  >
                    {selectedGamme === g.id && (
                      <Check size={18} className="absolute top-4 right-4 text-lavender-300" />
                    )}
                    <h3
                      className={`font-serif text-lg font-bold mb-1 ${selectedGamme === g.id ? "text-white" : "text-forest"}`}
                    >
                      {g.name}
                    </h3>
                    <p
                      className={`text-xs mb-3 ${selectedGamme === g.id ? "text-white/60" : "text-gray-400"}`}
                    >
                      {g.grammage}
                    </p>
                    <p
                      className={`text-sm leading-relaxed ${selectedGamme === g.id ? "text-white/80" : "text-gray-500"}`}
                    >
                      {g.desc}
                    </p>
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <span
                        className={`font-serif text-2xl font-bold ${selectedGamme === g.id ? "text-white" : "text-forest"}`}
                      >
                        dès {(g.prices[3]! / 100).toFixed(0)} €
                      </span>
                      <span
                        className={`text-xs ml-1 ${selectedGamme === g.id ? "text-white/50" : "text-gray-400"}`}
                      >
                        / set
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {/* Contenu du set */}
              <div className="mt-4 flex flex-wrap gap-2">
                {gamme.items.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full bg-lavender-50 px-3 py-1 text-xs text-lavender-700"
                  >
                    <span className="w-1 h-1 rounded-full bg-lavender-400" />
                    {item}
                  </span>
                ))}
              </div>
            </section>

            {/* Step 2 — Quantité */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
                  2
                </span>
                <h2 className="font-serif text-xl font-bold text-forest">Nombre de sets</h2>
              </div>
              <div className="flex items-center gap-6 rounded-2xl bg-white border border-lavender-100 p-6">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-lavender-50 text-forest hover:bg-lavender-100 transition-colors"
                >
                  <Minus size={20} />
                </button>
                <div className="flex-1 text-center">
                  <span className="font-serif text-5xl font-bold text-forest">{qty}</span>
                  <p className="text-sm text-gray-400 mt-1">
                    set{qty > 1 ? "s" : ""} par livraison
                  </p>
                </div>
                <button
                  onClick={() => setQty(Math.min(100, qty + 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-lavender-50 text-forest hover:bg-lavender-100 transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
              {/* Raccourcis */}
              <div className="flex gap-2 mt-3">
                {[4, 8, 12, 20, 30].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQty(n)}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                      qty === n
                        ? "bg-forest text-white"
                        : "bg-white border border-lavender-100 text-gray-500 hover:border-lavender-300"
                    }`}
                  >
                    {n} sets
                  </button>
                ))}
              </div>
            </section>

            {/* Step 3 — Fréquence */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
                  3
                </span>
                <h2 className="font-serif text-xl font-bold text-forest">Fréquence de livraison</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {frequences.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFreq(f.id)}
                    className={`relative rounded-2xl p-5 text-left transition-all duration-300 ${
                      selectedFreq === f.id
                        ? "bg-forest text-white shadow-lg shadow-forest/20"
                        : "bg-white border border-lavender-100 hover:border-lavender-300 hover:shadow-md"
                    }`}
                  >
                    <p
                      className={`font-semibold text-sm mb-0.5 ${selectedFreq === f.id ? "text-white" : "text-forest"}`}
                    >
                      {f.label}
                    </p>
                    <p
                      className={`text-xs ${selectedFreq === f.id ? "text-white/60" : "text-gray-400"}`}
                    >
                      {f.desc}
                    </p>
                    {f.factor < 1 && (
                      <span
                        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          selectedFreq === f.id
                            ? "bg-white/20 text-white"
                            : "bg-lavender-50 text-lavender-600"
                        }`}
                      >
                        -{Math.round((1 - f.factor) * 100)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right — Résumé devis */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-3xl bg-white border border-lavender-100 shadow-xl shadow-lavender-100/30 overflow-hidden">
              {/* Header */}
              <div className="bg-forest px-6 py-5">
                <h3 className="font-serif text-lg font-bold text-white">Votre estimation</h3>
                <p className="text-xs text-white/60 mt-0.5">
                  Prix indicatif, devis final sur demande
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Ligne gamme */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Gamme</span>
                  <span className="font-semibold text-forest">{gamme.name}</span>
                </div>

                {/* Ligne prix unitaire */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Prix / set</span>
                  <span className="font-semibold text-forest">
                    {formatEur(estimate.pricePerSet)}
                  </span>
                </div>

                {/* Ligne quantité */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Quantité</span>
                  <span className="font-semibold text-forest">
                    {qty} set{qty > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="h-px bg-lavender-100" />

                {/* Sous-total */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sous-total</span>
                  <span className="text-gray-700">{formatEur(estimate.subtotal)}</span>
                </div>

                {/* Livraison */}
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Truck size={14} />
                    Livraison
                  </div>
                  <span
                    className={
                      estimate.livraison === 0 ? "font-semibold text-forest" : "text-gray-700"
                    }
                  >
                    {estimate.livraison === 0 ? "Offerte" : formatEur(estimate.livraison)}
                  </span>
                </div>

                {/* Réduction fréquence */}
                {estimate.freqDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-lavender-600">
                      <Sparkles size={14} />
                      Réduction {freq.label}
                    </div>
                    <span className="font-semibold text-lavender-600">
                      -{formatEur(estimate.freqDiscount)}
                    </span>
                  </div>
                )}

                <div className="h-px bg-lavender-100" />

                {/* Total */}
                <div className="flex justify-between items-end">
                  <span className="text-sm text-gray-500">Total estimé</span>
                  <div className="text-right">
                    <span className="font-serif text-3xl font-bold text-forest">
                      {formatEur(estimate.total)}
                    </span>
                    {selectedFreq !== "ponctuel" && (
                      <p className="text-[11px] text-gray-400">par livraison</p>
                    )}
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="px-6 pb-6 space-y-3">
                <a
                  href="https://lingeserein.fr/#contact"
                  className="group flex items-center justify-center gap-2 rounded-full bg-forest w-full py-4 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:-translate-y-0.5"
                >
                  Demander ce devis
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </a>
                <a
                  href="tel:+33490000000"
                  className="flex items-center justify-center rounded-full border border-lavender-200 w-full py-3 text-sm font-medium text-forest hover:bg-lavender-50 transition-colors"
                >
                  Nous appeler : 04 90 00 00 00
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom info */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: "Livraison offerte", desc: "Dès 4 sets commandés, la livraison est incluse" },
            {
              title: "Sans engagement",
              desc: "Pas de durée minimum, vous êtes libre à tout moment",
            },
            { title: "Devis final sous 24h", desc: "Recevez votre devis personnalisé par email" },
          ].map((item) => (
            <div
              key={item.title}
              className="text-center rounded-2xl bg-white border border-lavender-100 p-6"
            >
              <h4 className="font-serif font-bold text-forest mb-1">{item.title}</h4>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer mini */}
      <footer className="border-t border-lavender-100 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Linge Serein — Orange, Vaucluse
          </p>
          <Link href="/" className="text-xs text-lavender-600 hover:text-forest transition-colors">
            Retour au site principal
          </Link>
        </div>
      </footer>
    </div>
  );
}
