"use client";

import Script from "next/script";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Reveal } from "./reveal";

const faqs = [
  {
    q: "Quels types d'établissements peuvent travailler avec Linge Serein ?",
    a: "Nous travaillons avec tous les hébergeurs professionnels du Vaucluse : hôtels indépendants, gîtes, chambres d'hôtes, résidences de tourisme, locations Airbnb et propriétaires de meublés saisonniers.",
  },
  {
    q: "Y a-t-il un volume minimum de commande ?",
    a: "Non, vous pouvez commencer par un set unique. La livraison est offerte à partir de 4 sets ou en formule d'abonnement. Pour les commandes plus petites, des frais de 5 € s'appliquent.",
  },
  {
    q: "Quels sont vos délais de livraison ?",
    a: "Notre engagement est de 48 heures ouvrées maximum après confirmation de commande. En pratique, la plupart des livraisons sont effectuées le lendemain dans le bassin Orange-Avignon-Carpentras.",
  },
  {
    q: "Le linge est-il traité de manière écologique ?",
    a: "Oui. Nous utilisons des lessives certifiées Ecolabel européen, sans phosphates ni allergènes, et nous appliquons la méthode RABC de traçabilité bactériologique. Nos tournées de livraison sont optimisées pour limiter les émissions.",
  },
  {
    q: "Comment fonctionne l'abonnement ?",
    a: "Vous choisissez une formule mensuelle (Starter, Essentielle, Pro) avec un nombre fixe de sets et de livraisons. Sans engagement de durée, modifiable à tout moment selon votre saison.",
  },
  {
    q: "Que se passe-t-il en cas de dégradation du linge ?",
    a: "L'usure normale est incluse. Pour les dégradations anormales (taches indélébiles, brûlures, déchirures), un barème transparent vous est communiqué à la signature du contrat.",
  },
  {
    q: "Livrez-vous toute l'année ?",
    a: "Oui, y compris pendant les pics de saison estivale où nous renforçons nos équipes pour absorber les volumes.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="mx-auto max-w-4xl px-6">
        <Reveal className="text-center mb-14">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Questions fréquentes
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-forest">
            Tout ce que vous voulez savoir
          </h2>
        </Reveal>

        <ul className="flex flex-col gap-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <li
                key={f.q}
                className="rounded-2xl bg-white border border-lavender-100/60 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left min-h-[56px] hover:bg-lavender-50/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-inset"
                >
                  <span className="font-serif text-base md:text-lg font-semibold text-forest">
                    {f.q}
                  </span>
                  <ChevronDown
                    size={20}
                    aria-hidden
                    className={`shrink-0 text-lavender-700 transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  id={`faq-panel-${i}`}
                  role="region"
                  hidden={!isOpen}
                  className="px-5 pb-5 text-sm text-gray-800 leading-relaxed"
                >
                  {f.a}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <Script id="ld-faq" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(faqSchema)}
      </Script>
    </section>
  );
}
