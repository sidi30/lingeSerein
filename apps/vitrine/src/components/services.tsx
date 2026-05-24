"use client";

import { ArrowRight, Check } from "lucide-react";
import { motion } from "motion/react";
import { Reveal } from "./reveal";

const kits = [
  {
    category: "Set bain individuel",
    name: "Kit Bain",
    subtitle: "1 personne · qualité hôtelière 550 g/m²",
    items: [
      "1 drap de bain 70 × 150 cm",
      "1 serviette de toilette 50 × 90 cm",
      "1 tapis de bain 50 × 70 cm",
      "Livré plié, emballé, prêt à poser",
      "Entretien blanchisserie inclus",
    ],
    price: "7,50",
    priceLabel: "par set · par rotation",
    badge: null,
    featured: false,
  },
  {
    category: "Set lit complet",
    name: "Kit Lit",
    subtitle: "Lit simple ou double · blanc hôtelier",
    items: [
      "1 housse de couette (160×200 ou 240×220)",
      "1 drap housse (90×200 ou 160×200)",
      "1 ou 2 taies d'oreiller selon le lit",
      "Repassé, plié, emballé sous film",
      "Entretien blanchisserie inclus",
    ],
    price: "16,50",
    priceLabel: "par kit · par rotation",
    badge: "Le plus demandé",
    featured: true,
  },
  {
    category: "Pack tout-en-un",
    name: "Kit Complet",
    subtitle: "Bain + Lit · idéal Airbnb / gîte",
    items: [
      "Tout le contenu du Kit Bain",
      "Tout le contenu du Kit Lit",
      "1 livraison + 1 reprise groupées",
      "Économie sur les frais de livraison",
      "Tarif dégressif dès 4 kits",
    ],
    price: "22",
    priceLabel: "bain + lit groupés · économie 2 €",
    badge: null,
    featured: false,
  },
];

const rotationStats = [
  { value: "5–10 j", label: "entre deux rotations en moyenne" },
  { value: "24 h", label: "délai de traitement entre reprise et remise en stock" },
  { value: "2–3 ×", label: "rotations par kit par mois pour un stock qui travaille bien" },
];

export function Services() {
  return (
    <section id="services" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="absolute inset-0 pattern-bg opacity-[0.04]" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Header */}
        <Reveal className="text-center mb-20">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Nos offres
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Des kits conçus pour
            <br />
            chaque type d&apos;hébergement
          </h2>
          <p className="mt-6 text-gray-700 max-w-2xl mx-auto text-lg leading-relaxed">
            Un set par voyageur, livré propre, plié, prêt à poser. Repris sale après le séjour. Vous
            ne touchez plus à rien.
          </p>
        </Reveal>

        {/* Kits */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {kits.map((kit, i) => (
            <Reveal key={kit.name} delay={i * 100}>
              <div
                className={`relative h-full rounded-3xl p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                  kit.featured
                    ? "bg-forest text-white shadow-xl shadow-forest/20 ring-2 ring-forest"
                    : "bg-white border border-lavender-100/60 shadow-sm hover:shadow-lg"
                }`}
              >
                {kit.badge && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.7 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.2 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-lavender-500 px-4 py-1 text-xs font-semibold text-white uppercase tracking-wider shadow-lg shadow-lavender-300/40"
                  >
                    {kit.badge}
                  </motion.div>
                )}

                <div className="mb-5">
                  <span
                    className={`text-xs uppercase tracking-widest font-medium ${kit.featured ? "text-lavender-300" : "text-lavender-600"}`}
                  >
                    {kit.category}
                  </span>
                  <h3
                    className={`font-serif text-2xl font-bold mt-1 ${kit.featured ? "text-white" : "text-forest"}`}
                  >
                    {kit.name}
                  </h3>
                  <p className={`text-xs mt-1 ${kit.featured ? "text-white/60" : "text-gray-500"}`}>
                    {kit.subtitle}
                  </p>
                </div>

                <ul className="flex flex-col gap-2.5 mb-8 flex-1">
                  {kit.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <Check
                        size={14}
                        aria-hidden
                        className={`shrink-0 mt-0.5 ${kit.featured ? "text-lavender-300" : "text-forest"}`}
                      />
                      <span className={kit.featured ? "text-white/85" : "text-gray-700"}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`border-t pt-6 ${kit.featured ? "border-white/20" : "border-lavender-100"}`}
                >
                  <div
                    className={`font-serif text-4xl font-bold tabular-nums ${kit.featured ? "text-white" : "text-forest"}`}
                  >
                    {kit.price} €
                  </div>
                  <p
                    className={`text-xs mt-1 mb-5 ${kit.featured ? "text-white/60" : "text-gray-500"}`}
                  >
                    {kit.priceLabel}
                  </p>
                  <a
                    href="#contact"
                    className={`inline-flex items-center justify-center gap-2 w-full rounded-full py-3 text-sm font-medium transition-all duration-300 ${
                      kit.featured
                        ? "bg-white text-forest hover:bg-lavender-50"
                        : "bg-forest text-white hover:bg-forest-light"
                    }`}
                  >
                    Commander
                    <ArrowRight size={14} aria-hidden />
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Delivery note */}
        <Reveal>
          <p className="text-center text-sm text-gray-600 mb-16">
            <span className="text-forest font-medium">✓ Livraison offerte</span> à Orange dès 4 kits
            &nbsp;·&nbsp;
            <span className="text-forest font-medium">Vaucluse</span> à partir de 120 € de commande
            &nbsp;·&nbsp; Sans engagement, sans abonnement
          </p>
        </Reveal>

        {/* Rotation frequency */}
        <Reveal>
          <div className="rounded-3xl bg-white border border-lavender-100/60 shadow-sm p-8 md:p-10">
            <h3 className="font-serif text-xl font-bold text-forest text-center mb-2">
              Fréquence de rotation
            </h3>
            <p className="text-sm text-gray-600 text-center mb-8">
              On s&apos;adapte à votre rythme de check-in. Pas d&apos;abonnement à fréquence imposée
              — vous commandez quand un voyageur arrive.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-lavender-100">
              {rotationStats.map((stat) => (
                <div key={stat.label} className="text-center py-6 sm:py-0 px-6">
                  <div className="font-serif text-3xl font-bold text-forest tabular-nums mb-2">
                    {stat.value}
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
