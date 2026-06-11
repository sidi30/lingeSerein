"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SUBSCRIPTION_DEFAULTS } from "@lingengo/shared";
import { Reveal } from "./reveal";

const ABO = SUBSCRIPTION_DEFAULTS;

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
    q: "Comment fonctionne l'abonnement de location de linge ?",
    a: `L'abonnement Pack Sérénité est une formule mensuelle à ${ABO.PRICE_CENTS / 100} € incluant ${ABO.KIT_BAIN_QTY} kits bain, ${ABO.KIT_LIT_QTY} kits lit et les livraisons. Il comporte un engagement minimum de ${ABO.MIN_ENGAGEMENT_MONTHS} mois, puis il est résiliable avec un préavis de ${ABO.NOTICE_PERIOD_DAYS} jours. La composition peut être ajustée avec nous selon votre saison touristique en Vaucluse.`,
  },
  {
    q: "Que se passe-t-il en cas de dégradation du linge ?",
    a: "L'usure normale est incluse. Pour les dégradations anormales (taches indélébiles, brûlures, déchirures), un barème transparent vous est communiqué à la signature du contrat.",
  },
  {
    q: "Linge Serein livre-t-il toute l'année dans le Vaucluse ?",
    a: "Oui, Linge Serein livre toute l'année dans le Vaucluse, y compris pendant les pics de la saison estivale. Durant l'été, nous renforçons nos équipes et nos tournées pour absorber les volumes supplémentaires des hôtels, gîtes et locations saisonnières, sans allonger les délais de livraison.",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
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
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${i}`}
                      role="region"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 text-sm text-gray-800 leading-relaxed">{f.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
