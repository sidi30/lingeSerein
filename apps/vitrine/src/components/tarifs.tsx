"use client";

import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./reveal";

/* ─── Données ─── */

const abonnementFeatures = [
  "8 kits bain inclus par mois",
  "4 kits lit inclus par mois",
  "Livraisons & reprises incluses",
  "Entretien blanchisserie compris",
  "Kits supplémentaires au tarif normal",
  "Sans engagement · résiliable à tout moment",
];

const abonnementSavings = [
  { label: "8 kits bain à la rotation", amount: "60,00 €", bold: false, highlight: false },
  { label: "4 kits lit à la rotation", amount: "66,00 €", bold: false, highlight: false },
  { label: "Livraisons estimées (×4)", amount: "48,00 €", bold: false, highlight: false },
  { label: "Total sans abonnement", amount: "174,00 €", bold: true, highlight: false },
  { label: "Avec l'abonnement", amount: "89 €", bold: false, highlight: true },
];

const uniteBain = [
  { name: "Serviette 30×50", desc: "Petite serviette / gant", price: "2,50 €" },
  { name: "Serviette 50×90", desc: "Serviette de toilette", price: "4,50 €" },
  { name: "Drap de bain 70×150", desc: "Grand drap de bain", price: "6,50 €" },
  { name: "Tapis de bain 50×70", desc: "Tapis de sortie de douche", price: "4,00 €" },
];

const uniteLit = [
  { name: "Drap housse", desc: "90×200 ou 160×200 cm", price: "7,50 €" },
  { name: "Housse de couette", desc: "160×200 ou 240×220 cm", price: "9,00 €" },
];

const livraison = [
  { value: "Offerte", label: "Orange (84100) · dès 4 kits commandés" },
  { value: "12 €", label: "Zone proche — Carpentras, Vaison, Bollène…" },
  { value: "15 €", label: "Zone élargie — Avignon, Apt, Pertuis…" },
  { value: "Offerte", label: "Dès 120 € de commande · tout le Vaucluse" },
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
            Options & tarifs
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Tout inclus,
            <br />
            sans mauvaise surprise
          </h2>
          <p className="mt-6 text-gray-700 max-w-2xl mx-auto text-lg leading-relaxed">
            Abonnement mensuel, articles à l&apos;unité, zones de livraison — tout est transparent.
          </p>
        </Reveal>

        {/* ─── Pack Sérénité ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Abonnement mensuel
          </h3>
          <p className="text-gray-600 text-center text-sm mb-10">
            Vous louez régulièrement ? Passez à l&apos;abonnement. Un tarif fixe, tout inclus.
          </p>
        </Reveal>

        <Reveal className="mb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="rounded-3xl bg-forest text-white p-8 shadow-xl shadow-forest/20">
              <span className="text-xs uppercase tracking-widest text-lavender-300 font-medium">
                Formule mensuelle
              </span>
              <h4 className="font-serif text-2xl font-bold mt-1 mb-1">Pack Sérénité</h4>
              <p className="text-xs text-white/60 mb-6">
                Idéal propriétaires Airbnb · gîtes · chambres d&apos;hôtes
              </p>

              <div className="mb-6">
                <span className="font-serif text-5xl font-bold tabular-nums">89 €</span>
                <span className="text-sm text-white/70 ml-2">par mois · livraison incluse</span>
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
                Souscrire à l&apos;abonnement
                <ArrowRight size={14} aria-hidden />
              </a>
            </div>

            <div className="rounded-3xl bg-white border border-lavender-100/60 shadow-sm p-8">
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
                <p className="text-xs text-lavender-700 font-medium mt-1">
                  Économie : ~85 € / mois soit −49 %
                </p>
              </div>
              <p className="mt-6 text-xs text-gray-500 leading-relaxed border-t border-lavender-100 pt-4">
                Kits supplémentaires facturés au tarif normal (7,50 € le bain, 16,50 € le lit). Pas
                de frais cachés, pas de pénalité.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ─── Location à l'unité ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-2">
            Location à l&apos;unité
          </h3>
          <p className="text-gray-600 text-center text-sm mb-10">
            Commandez uniquement ce dont vous avez besoin. Prix hors livraison.
          </p>
        </Reveal>

        <Reveal className="mb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-lavender-100/60 shadow-sm overflow-hidden">
              <div className="bg-forest/5 px-6 py-4 border-b border-lavender-100/40">
                <h4 className="font-serif font-bold text-forest">Linge de bain</h4>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {uniteBain.map((item, i) => (
                    <tr key={item.name} className={i % 2 === 0 ? "bg-white" : "bg-lavender-50/40"}>
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.desc}</div>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-forest tabular-nums">
                        {item.price}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-lavender-100/60 shadow-sm overflow-hidden">
              <div className="bg-forest/5 px-6 py-4 border-b border-lavender-100/40">
                <h4 className="font-serif font-bold text-forest">Linge de lit</h4>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {uniteLit.map((item, i) => (
                    <tr key={item.name} className={i % 2 === 0 ? "bg-white" : "bg-lavender-50/40"}>
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.desc}</div>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-forest tabular-nums">
                        {item.price}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-lavender-50/40">
                    <td
                      colSpan={2}
                      className="px-6 py-3 text-xs text-gray-500 border-t border-lavender-100/40"
                    >
                      💡 Les taies d&apos;oreiller sont incluses dans le Kit Lit complet (16,50 €)
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="px-6 py-3 bg-forest/5 border-t border-lavender-100/40 text-xs text-gray-500">
                🚐 Livraison selon zone : offerte à Orange dès 4 articles, 12 € zone proche, 15 €
                zone élargie.
              </div>
            </div>
          </div>
        </Reveal>

        {/* ─── Zones de livraison ─── */}
        <Reveal className="mb-6">
          <h3 className="font-serif text-2xl font-bold text-forest text-center mb-10">
            Zones de livraison
          </h3>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-24">
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
          <p className="mt-4 text-gray-600 text-sm">Sans engagement — Réponse sous 24 h ouvrées</p>
        </Reveal>
      </div>
    </section>
  );
}
