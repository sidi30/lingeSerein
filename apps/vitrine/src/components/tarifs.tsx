"use client";

import { ArrowRight, Check, Truck } from "lucide-react";
import { Reveal } from "./reveal";
import { CATALOG_DEFAULTS, SUBSCRIPTION_DEFAULTS, DELIVERY_DEFAULTS } from "@lingengo/shared";

// NOTE (Option A, ADR-V2-005) : ces valeurs reflètent les constantes de seed
// (@lingengo/shared). Si les prix sont modifiés via l'admin en production, la
// vitrine restera sur ces valeurs de départ — désynchro assumée en V1.

function centsToEuroStr(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

const engagementLabel = `Engagement ${SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois · résiliable ensuite avec ${SUBSCRIPTION_DEFAULTS.NOTICE_PERIOD_DAYS} j de préavis`;

const abonnementFeatures = [
  `${SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain inclus par mois`,
  `${SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit inclus par mois`,
  "Livraisons & reprises incluses",
  "Entretien blanchisserie compris",
  "Kits supplémentaires au tarif normal",
  engagementLabel,
];

// Économies calculées depuis les constantes partagées
const kitBainMensuels = SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY * CATALOG_DEFAULTS.KIT_BAIN_CENTS;
const kitLitMensuels = SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY * CATALOG_DEFAULTS.KIT_LIT_CENTS;
// 4 livraisons estimées à 12 € = 4800 c (valeur illustrative, pas issue d'une constante)
const livraisonsEstimees = 4 * (DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS / 10); // ~48 € illustratif
const totalSansAbo = kitBainMensuels + kitLitMensuels + livraisonsEstimees;
const economie = totalSansAbo - SUBSCRIPTION_DEFAULTS.PRICE_CENTS;
const economiePct = Math.round((economie / totalSansAbo) * 100);

const abonnementSavings = [
  {
    label: `${SUBSCRIPTION_DEFAULTS.KIT_BAIN_QTY} kits bain à la rotation`,
    amount: centsToEuroStr(kitBainMensuels),
    bold: false,
    highlight: false,
  },
  {
    label: `${SUBSCRIPTION_DEFAULTS.KIT_LIT_QTY} kits lit à la rotation`,
    amount: centsToEuroStr(kitLitMensuels),
    bold: false,
    highlight: false,
  },
  {
    label: "Livraisons estimées (×4)",
    amount: centsToEuroStr(livraisonsEstimees),
    bold: false,
    highlight: false,
  },
  {
    label: "Total sans abonnement",
    amount: centsToEuroStr(totalSansAbo),
    bold: true,
    highlight: false,
  },
  {
    label: "Avec l'abonnement",
    amount: centsToEuroStr(SUBSCRIPTION_DEFAULTS.PRICE_CENTS),
    bold: false,
    highlight: true,
  },
];

const unitPrices = [
  {
    price: centsToEuroStr(CATALOG_DEFAULTS.SERVIETTE_CENTS),
    name: "Serviette 50×90",
    sub: "serviette de toilette",
  },
  {
    price: centsToEuroStr(CATALOG_DEFAULTS.DRAP_BAIN_CENTS),
    name: "Drap de bain 70×150",
    sub: "grand drap de bain",
  },
  {
    price: centsToEuroStr(CATALOG_DEFAULTS.TAPIS_BAIN_CENTS),
    name: "Tapis de bain 50×70",
    sub: "sortie de douche",
  },
  {
    price: centsToEuroStr(CATALOG_DEFAULTS.PETITE_SERVIETTE_CENTS),
    name: "Petite serviette 30×50",
    sub: "gant / petite serviette",
  },
  {
    price: centsToEuroStr(CATALOG_DEFAULTS.DRAP_HOUSSE_CENTS),
    name: "Drap housse",
    sub: "90×200 ou 160×200 cm",
  },
  {
    price: centsToEuroStr(CATALOG_DEFAULTS.HOUSSE_COUETTE_CENTS),
    name: "Housse de couette",
    sub: "160×200 ou 240×220 cm",
  },
];

const zones = [
  {
    price: "Offerte",
    city: "Orange",
    sub: `dès ${DELIVERY_DEFAULTS.FREE_MIN_KITS_ORANGE} kits commandés`,
  },
  { price: "12 €", city: "Zone proche", sub: "Carpentras, Vaison, Bollène…" },
  { price: "15 €", city: "Zone élargie", sub: "Avignon, Apt, Pertuis…" },
  {
    price: "Offerte",
    city: "Tout le Vaucluse",
    sub: `dès ${centsToEuroStr(DELIVERY_DEFAULTS.FREE_THRESHOLD_CENTS)} de commande`,
  },
];

export function Tarifs() {
  return (
    <section id="tarifs" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="absolute inset-0 pattern-bg opacity-[0.04]" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Header */}
        <Reveal className="text-center mb-16">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Tarifs
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Transparent, sans surprise
          </h2>
        </Reveal>

        {/* ─── Pack Sérénité ─── */}
        <Reveal className="mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="rounded-3xl bg-forest text-white p-8 shadow-xl shadow-forest/20">
              <span className="text-xs uppercase tracking-widest text-lavender-300 font-medium">
                Abonnement mensuel
              </span>
              <h3 className="font-serif text-2xl font-bold mt-1 mb-1">Pack Sérénité</h3>
              <p className="text-xs text-white/60 mb-6">
                Idéal Airbnb · gîtes · chambres d&apos;hôtes
              </p>

              <div className="mb-6">
                <span className="font-serif text-5xl font-bold tabular-nums">
                  {centsToEuroStr(SUBSCRIPTION_DEFAULTS.PRICE_CENTS).replace(",00", "")}
                </span>
                <span className="text-sm text-white/70 ml-2">/ mois · livraison incluse</span>
              </div>

              <ul className="flex flex-col gap-3 mb-8">
                {abonnementFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <Check size={14} aria-hidden className="shrink-0 mt-0.5 text-lavender-300" />
                    <span className="text-white/85">{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 w-full rounded-full bg-white text-forest py-3 text-sm font-medium hover:bg-lavender-50 transition-colors"
              >
                Souscrire
                <ArrowRight size={14} aria-hidden />
              </a>
            </div>

            <div className="rounded-3xl bg-white border border-lavender-100/60 shadow-sm p-8 flex flex-col justify-between">
              <div>
                <h4 className="font-serif text-lg font-bold text-forest mb-6">
                  Ce que vous économisez
                </h4>
                <div className="flex flex-col gap-4">
                  {abonnementSavings.map((row) => (
                    <div
                      key={row.label}
                      className={`flex justify-between items-center text-sm ${
                        row.highlight
                          ? "text-forest font-bold text-base"
                          : row.bold
                            ? "font-semibold text-gray-900 border-t border-lavender-100 pt-4"
                            : "text-gray-700"
                      }`}
                    >
                      <span>{row.label}</span>
                      <span className="tabular-nums">{row.amount}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-lavender-700 font-medium mt-3">
                  Économie : ~{centsToEuroStr(economie)} / mois soit −{economiePct} %
                </p>
              </div>
              <p className="mt-6 text-xs text-gray-500 leading-relaxed border-t border-lavender-100 pt-4">
                Kits supplémentaires au tarif normal. Pas de frais cachés, pas de pénalité.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ─── À l'unité ─── */}
        <Reveal className="mb-4">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-1">
            À l&apos;unité
          </h3>
          <p className="text-gray-500 text-center text-sm mb-8">Prix hors livraison</p>
        </Reveal>

        <Reveal className="mb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {unitPrices.map((item) => (
              <div
                key={item.name}
                className="rounded-2xl bg-white border border-lavender-100/60 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="font-serif text-2xl font-bold text-forest tabular-nums mb-1">
                  {item.price}
                </div>
                <div className="text-sm font-medium text-gray-800 leading-tight">{item.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ─── Livraison ─── */}
        <Reveal className="mb-4">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-8">
            <Truck size={20} aria-hidden className="inline mr-2 opacity-60" />
            Livraison
          </h3>
        </Reveal>

        <Reveal className="mb-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {zones.map((z) => (
              <div
                key={z.city}
                className="text-center rounded-2xl bg-white border border-lavender-100/60 p-5 shadow-sm"
              >
                <div className="font-serif text-xl font-bold text-forest mb-1 tabular-nums">
                  {z.price}
                </div>
                <div className="text-xs font-semibold text-gray-700">{z.city}</div>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{z.sub}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ─── CTA ─── */}
        <Reveal className="text-center">
          <a
            href="#contact"
            className="group inline-flex items-center gap-3 rounded-full bg-forest px-10 py-5 text-lg font-medium text-white shadow-xl shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:shadow-2xl hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Passer commande
            <ArrowRight
              size={20}
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            />
          </a>
          <p className="mt-4 text-gray-600 text-sm">
            Engagement {SUBSCRIPTION_DEFAULTS.MIN_ENGAGEMENT_MONTHS} mois — Réponse sous 24 h
            ouvrées
          </p>
        </Reveal>
      </div>
    </section>
  );
}
