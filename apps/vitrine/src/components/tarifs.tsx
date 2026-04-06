"use client";

import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

/* ─── Données ─── */

const gammes = [
  {
    name: "Pack Confort",
    grammage: "500 g/m²",
    price: "6",
    unit: "/ set",
    items: ["Drap de bain 70×140", "Serviette 50×90", "Tapis de bain 50×70"],
    featured: false,
  },
  {
    name: "Pack Hôtel",
    grammage: "550 g/m²",
    price: "9",
    unit: "/ set",
    items: ["Drap de bain 70×140", "Serviette 50×90", "Tapis de bain 50×70", "Gant de toilette"],
    featured: true,
  },
  {
    name: "Pack Prestige",
    grammage: "600 g/m² coton peigné",
    price: "14",
    unit: "/ set",
    items: ["Drap de bain 100×150", "Serviette peignée", "Tapis épais", "Gant de toilette"],
    featured: false,
  },
];

const degressif = {
  headers: ["1–3 sets", "4–9 sets", "10–19 sets", "20+ sets"],
  rows: [
    { name: "Confort", prices: ["6,00 €", "5,50 €", "5,00 €", "4,50 €"] },
    { name: "Hôtel", prices: ["9,00 €", "8,50 €", "8,00 €", "7,00 €"] },
    { name: "Prestige", prices: ["14,00 €", "13,00 €", "12,00 €", "11,00 €"] },
    { name: "Livraison", prices: ["+5 €", "Offerte", "Offerte", "Offerte"] },
  ],
};

const abonnements = [
  {
    name: "Starter",
    price: "49",
    saving: "9",
    features: ["8 sets Confort", "2 livraisons / mois"],
    featured: false,
  },
  {
    name: "Essentielle",
    price: "89",
    saving: "39",
    features: ["12 sets Hôtel", "4 livraisons / mois", "Alertes automatiques"],
    featured: true,
  },
  {
    name: "Pro",
    price: "169",
    saving: "31",
    features: ["24 sets au choix", "8 livraisons / mois", "Multi-logements"],
    featured: false,
  },
];

const livraison = [
  { value: "5 €", label: "Commande de 1 à 3 sets" },
  { value: "Offerte", label: "Dès 4 sets ou en abonnement" },
  { value: "1–2× / sem.", label: "Créneau fixe choisi par vous" },
  { value: "48h max", label: "Délai de livraison Vaucluse" },
];

/* ─── Composant ─── */

export function Tarifs() {
  return (
    <section id="tarifs" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="absolute inset-0 pattern-bg opacity-[0.04]" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Header */}
        <Reveal className="text-center mb-20">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-600 mb-4">
            Nos tarifs
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Choisissez la formule
            <br />
            adaptée à votre hébergement
          </h2>
          <p className="mt-6 text-gray-500 max-w-2xl mx-auto text-lg leading-relaxed">
            Des tarifs transparents, sans engagement. Plus vous commandez, plus le prix baisse.
          </p>
        </Reveal>

        {/* ─── Gammes ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Nos gammes de linge
          </h3>
          <p className="text-gray-400 text-center text-sm mb-10">
            Chaque set comprend tout le linge de bain pour une chambre
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {gammes.map((g, i) => (
            <Reveal key={g.name} delay={i * 150}>
              <div
                className={`relative h-full rounded-3xl p-8 transition-all duration-500 hover:-translate-y-2 ${
                  g.featured
                    ? "bg-forest text-white shadow-xl shadow-forest/20 ring-2 ring-forest"
                    : "bg-white border border-lavender-100/60 shadow-sm hover:shadow-lg"
                }`}
              >
                {g.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-lavender-500 px-4 py-1 text-xs font-semibold text-white uppercase tracking-wider">
                    Recommandé
                  </div>
                )}

                <div className="mb-6">
                  <h4
                    className={`font-serif text-xl font-bold mb-1 ${g.featured ? "text-white" : "text-forest"}`}
                  >
                    {g.name}
                  </h4>
                  <p className={`text-xs ${g.featured ? "text-white/60" : "text-gray-400"}`}>
                    {g.grammage}
                  </p>
                </div>

                <div className="mb-8">
                  <span
                    className={`font-serif text-5xl font-bold ${g.featured ? "text-white" : "text-forest"}`}
                  >
                    {g.price} €
                  </span>
                  <span
                    className={`text-sm ml-1 ${g.featured ? "text-white/60" : "text-gray-400"}`}
                  >
                    {g.unit}
                  </span>
                </div>

                <ul className="flex flex-col gap-3">
                  {g.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <span
                        className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${g.featured ? "bg-lavender-300" : "bg-lavender-400"}`}
                      />
                      <span className={g.featured ? "text-white/80" : "text-gray-600"}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ─── Tarifs dégressifs ─── */}
        <Reveal className="mb-24">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Tarifs dégressifs
          </h3>
          <p className="text-gray-400 text-center text-sm mb-10">
            Plus vous commandez, plus le prix unitaire baisse
          </p>

          <div className="overflow-x-auto rounded-2xl border border-lavender-100/60 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-forest text-white">
                  <th className="text-left font-semibold px-6 py-4 rounded-tl-2xl">Gamme</th>
                  {degressif.headers.map((h, i) => (
                    <th
                      key={h}
                      className={`text-center font-semibold px-6 py-4 ${i === degressif.headers.length - 1 ? "rounded-tr-2xl" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {degressif.rows.map((row, i) => (
                  <tr
                    key={row.name}
                    className={`${i % 2 === 0 ? "bg-white" : "bg-lavender-50/50"} ${i === degressif.rows.length - 1 ? "border-t-2 border-lavender-200" : ""}`}
                  >
                    <td className="px-6 py-4 font-medium text-forest">{row.name}</td>
                    {row.prices.map((p, j) => (
                      <td
                        key={j}
                        className={`text-center px-6 py-4 ${
                          p === "Offerte" ? "text-forest font-semibold" : "text-gray-600"
                        }`}
                      >
                        {p}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* ─── Abonnements ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Abonnements mensuels
          </h3>
          <p className="text-gray-400 text-center text-sm mb-10">
            Sans engagement, modifiable à tout moment
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {abonnements.map((a, i) => (
            <Reveal key={a.name} delay={i * 150}>
              <div
                className={`relative h-full rounded-3xl p-8 transition-all duration-500 hover:-translate-y-2 ${
                  a.featured
                    ? "bg-forest text-white shadow-xl shadow-forest/20 ring-2 ring-forest"
                    : "bg-white border border-lavender-100/60 shadow-sm hover:shadow-lg"
                }`}
              >
                {a.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-lavender-500 px-4 py-1 text-xs font-semibold text-white uppercase tracking-wider">
                    Populaire
                  </div>
                )}

                <div className="mb-6">
                  <h4
                    className={`font-serif text-xl font-bold ${a.featured ? "text-white" : "text-forest"}`}
                  >
                    {a.name}
                  </h4>
                </div>

                <div className="mb-2">
                  <span
                    className={`font-serif text-5xl font-bold ${a.featured ? "text-white" : "text-forest"}`}
                  >
                    {a.price} €
                  </span>
                  <span
                    className={`text-sm ml-1 ${a.featured ? "text-white/60" : "text-gray-400"}`}
                  >
                    / mois
                  </span>
                </div>

                <p
                  className={`text-xs mb-8 ${a.featured ? "text-lavender-200" : "text-lavender-500"}`}
                >
                  Économie de {a.saving} € vs. tarif unitaire
                </p>

                <ul className="flex flex-col gap-3">
                  {a.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <span
                        className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${a.featured ? "bg-lavender-300" : "bg-lavender-400"}`}
                      />
                      <span className={a.featured ? "text-white/80" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ─── Livraison ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-10">Livraison</h3>
        </Reveal>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
          {livraison.map((l, i) => (
            <Reveal key={l.label} delay={i * 100}>
              <div className="text-center rounded-2xl bg-white border border-lavender-100/60 p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="font-serif text-2xl font-bold text-forest mb-2">{l.value}</div>
                <p className="text-gray-500 text-xs leading-relaxed">{l.label}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ─── CTA ─── */}
        <Reveal className="text-center">
          <a
            href="#contact"
            className="group inline-flex items-center gap-3 rounded-full bg-forest px-10 py-5 text-lg font-medium text-white shadow-xl shadow-forest/20 transition-all duration-500 hover:bg-forest-light hover:shadow-2xl hover:-translate-y-1"
          >
            Démarrer gratuitement
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </a>
          <p className="mt-4 text-gray-400 text-sm">
            Sans engagement — Devis personnalisé sous 24h
          </p>
        </Reveal>
      </div>
    </section>
  );
}
