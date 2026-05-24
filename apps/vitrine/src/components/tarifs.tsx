"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "./reveal";

function AnimatedPrice({
  value,
  suffix = " €",
  decimals = 0,
}: {
  value: string;
  suffix?: string;
  decimals?: number;
}) {
  const target = Number(value);
  const reduced = useReducedMotion();
  const [val, setVal] = useState(reduced ? target : 0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setVal(target);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const dur = 1200;
          const step = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            const raw = target * eased;
            setVal(
              decimals > 0 ? Math.round(raw * 10 ** decimals) / 10 ** decimals : Math.round(raw),
            );
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, reduced, decimals]);

  const display = decimals > 0 ? val.toFixed(decimals).replace(".", ",") : String(val);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

/* ─── Données ─── */

const produits = [
  {
    name: "Set bain",
    price: "7.5",
    unit: "/ set",
    items: [
      "Serviettes de bain",
      "Tapis de bain",
      "Lavage & séchage inclus",
      "Livraison & reprise incluse",
    ],
    featured: false,
  },
  {
    name: "Set lit",
    price: "16.5",
    unit: "/ set",
    items: [
      "Drap housse",
      "Housse de couette",
      "Taie d'oreiller",
      "Lavage & séchage inclus",
      "Livraison & reprise incluse",
    ],
    featured: true,
  },
];

const degradations = [
  { article: "Petite serviette 30×50 perdue ou inutilisable", tarif: "2,50 €" },
  { article: "Serviette 50×90 perdue ou inutilisable", tarif: "5,00 €" },
  { article: "Serviette 70×150 perdue ou inutilisable", tarif: "9,00 €" },
  { article: "Serviette 90×150 perdue ou inutilisable", tarif: "12,00 €" },
  { article: "Tapis de bain perdu ou inutilisable", tarif: "8,00 €" },
  { article: "Taie / petite pièce de lit perdue ou inutilisable", tarif: "6,00 €" },
  { article: "Housse de couette / drap housse perdu(e) ou inutilisable", tarif: "15,00 €" },
  { article: "Kit lit complet perdu ou inutilisable", tarif: "29,90 €" },
  { article: "Article très sale — traitement renforcé", tarif: "5,00 € / kit" },
  { article: "Article non restitué après relance", tarif: "Remplacement + frais de gestion" },
];

const livraison = [
  { value: "Offerte", label: "À Orange dès 4 kits commandés" },
  { value: "Offerte", label: "Dès 120 € de commande (alentours)" },
  { value: "12 €", label: "Zone proche — Vaucluse" },
  { value: "15 €", label: "Zone élargie" },
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
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Nos tarifs
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Des tarifs clairs,
            <br />
            sans surprise
          </h2>
          <p className="mt-6 text-gray-700 max-w-2xl mx-auto text-lg leading-relaxed">
            Location, entretien et livraison de linge de bain et de lit pour vos locations courte
            durée.
          </p>
        </Reveal>

        {/* ─── Produits ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Nos prestations
          </h3>
          <p className="text-gray-600 text-center text-sm mb-10">
            Tout le linge, l&apos;entretien et la logistique inclus dans un tarif unique
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-24 max-w-3xl mx-auto">
          {produits.map((p, i) => (
            <Reveal key={p.name} delay={i * 100}>
              <a
                href="/devis"
                aria-label={`Simuler un devis pour le ${p.name}`}
                className={`block relative h-full rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
                  p.featured
                    ? "bg-forest text-white shadow-xl shadow-forest/20 ring-2 ring-forest"
                    : "bg-white border border-lavender-100/60 shadow-sm hover:shadow-lg"
                }`}
              >
                {p.featured && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.7 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.2 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-lavender-500 px-4 py-1 text-xs font-semibold text-white uppercase tracking-wider shadow-lg shadow-lavender-300/40"
                  >
                    Populaire
                  </motion.div>
                )}

                <div className="mb-6">
                  <h4
                    className={`font-serif text-xl font-bold mb-1 ${p.featured ? "text-white" : "text-forest"}`}
                  >
                    {p.name}
                  </h4>
                </div>

                <div className="mb-8">
                  <span
                    className={`font-serif text-5xl font-bold ${p.featured ? "text-white" : "text-forest"}`}
                  >
                    <AnimatedPrice value={p.price} decimals={2} />
                  </span>
                  <span
                    className={`text-sm ml-1 ${p.featured ? "text-white/80" : "text-gray-600"}`}
                  >
                    {p.unit}
                  </span>
                </div>

                <ul className="flex flex-col gap-3 mb-6">
                  {p.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <span
                        aria-hidden
                        className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${p.featured ? "bg-lavender-300" : "bg-lavender-500"}`}
                      />
                      <span className={p.featured ? "text-white/90" : "text-gray-700"}>{item}</span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`mt-auto inline-flex items-center gap-2 text-sm font-medium ${
                    p.featured ? "text-lavender-200" : "text-lavender-700"
                  }`}
                >
                  Simuler mon devis
                  <ArrowRight size={14} aria-hidden />
                </div>
              </a>
            </Reveal>
          ))}
        </div>

        {/* ─── Livraison ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-10">Livraison</h3>
        </Reveal>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-24">
          {livraison.map((l, i) => (
            <Reveal key={l.label} delay={i * 100}>
              <div className="text-center rounded-2xl bg-white border border-lavender-100/60 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="font-serif text-2xl font-bold text-forest mb-2 tabular-nums">
                  {l.value}
                </div>
                <p className="text-gray-700 text-xs leading-relaxed">{l.label}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ─── Barème dégradations ─── */}
        <Reveal className="mb-24">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Barème de remplacement
          </h3>
          <p className="text-gray-600 text-center text-sm mb-10">
            Applicable en cas de perte ou dégradation hors usure normale
          </p>

          <div className="overflow-x-auto rounded-2xl border border-lavender-100/60 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-forest text-white">
                  <th className="text-left font-semibold px-6 py-4 rounded-tl-2xl">Article</th>
                  <th className="text-center font-semibold px-6 py-4 rounded-tr-2xl w-48">
                    Facturation
                  </th>
                </tr>
              </thead>
              <tbody>
                {degradations.map((d, i) => (
                  <tr key={d.article} className={i % 2 === 0 ? "bg-white" : "bg-lavender-50/50"}>
                    <td className="px-6 py-4 text-gray-700">{d.article}</td>
                    <td className="text-center px-6 py-4 font-medium text-forest tabular-nums">
                      {d.tarif}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Taches indélébiles, brûlures et déchirures : prix de remplacement de l&apos;article
            concerné. Voir{" "}
            <a href="/cgv" className="underline text-lavender-700 hover:text-forest">
              CGV article 10
            </a>
            .
          </p>
        </Reveal>

        {/* ─── CTA ─── */}
        <Reveal className="text-center">
          <a
            href="/devis"
            className="group inline-flex items-center gap-3 rounded-full bg-forest px-10 py-5 text-lg font-medium text-white shadow-xl shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:shadow-2xl hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Lancer mon devis personnalisé
            <ArrowRight
              size={20}
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            />
          </a>
          <p className="mt-4 text-gray-600 text-sm">Sans engagement — Réponse sous 24 h ouvrées</p>
        </Reveal>
      </div>
    </section>
  );
}
