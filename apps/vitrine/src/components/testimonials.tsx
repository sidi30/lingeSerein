"use client";

import { useEffect, useState } from "react";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Reveal } from "./reveal";

const testimonials = [
  {
    quote:
      "Depuis que nous travaillons avec Linge Serein, la qualité du linge n'est plus un sujet. Nos clients le remarquent, et c'est ce qui compte.",
    author: "Marie-Claire D.",
    role: "Directrice, Hôtel Le Mas Provençal",
    rating: 5,
  },
  {
    quote:
      "Un service impeccable, toujours à l'heure. L'équipe est à l'écoute et s'adapte à nos pics d'activité en saison estivale.",
    author: "Thomas R.",
    role: "Gérant, Domaine des Oliviers",
    rating: 5,
  },
  {
    quote:
      "La démarche éco-responsable a été déterminante dans notre choix. Nous partageons les mêmes valeurs. Un vrai partenariat.",
    author: "Sophie L.",
    role: "Responsable hébergement, Résidence Ventoux",
    rating: 5,
  },
];

const CYCLE_MS = 5500;

export function Testimonials() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const t = testimonials[idx]!;

  useEffect(() => {
    if (reduced || paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % testimonials.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced, paused]);

  const next = () => setIdx((i) => (i + 1) % testimonials.length);
  const prev = () => setIdx((i) => (i - 1 + testimonials.length) % testimonials.length);

  return (
    <section
      aria-label="Témoignages clients"
      className="relative py-28 md:py-36 gradient-lavender overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-lavender-200/30 blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl px-6">
        <Reveal className="text-center mb-16">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Ils nous font confiance
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Paroles de partenaires
          </h2>
        </Reveal>

        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="relative min-h-[340px] md:min-h-[280px]">
            <AnimatePresence mode="wait">
              <motion.figure
                key={idx}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded-3xl bg-white p-10 md:p-14 shadow-xl shadow-lavender-200/40 border border-lavender-100/50"
              >
                <Quote aria-hidden size={56} className="absolute top-6 left-6 text-lavender-100" />

                <div
                  role="img"
                  aria-label={`${t.rating} étoiles sur 5`}
                  className="flex items-center gap-0.5 mb-6 justify-center"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        delay: 0.15 + i * 0.07,
                        type: "spring",
                        stiffness: 260,
                        damping: 14,
                      }}
                    >
                      <Star
                        size={20}
                        aria-hidden
                        className={
                          i < t.rating ? "fill-lavender-500 text-lavender-500" : "text-lavender-200"
                        }
                      />
                    </motion.span>
                  ))}
                </div>

                <blockquote className="font-serif text-xl md:text-2xl text-forest-dark leading-relaxed text-center italic">
                  « {t.quote} »
                </blockquote>

                <figcaption className="mt-8 text-center">
                  <div className="font-serif font-bold text-forest text-base">{t.author}</div>
                  <div className="text-sm text-gray-600 mt-0.5">{t.role}</div>
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>

          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={prev}
              aria-label="Témoignage précédent"
              className="w-10 h-10 rounded-full bg-white border border-lavender-200 text-forest hover:bg-lavender-50 hover:border-lavender-400 hover:-translate-x-0.5 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex items-center gap-2">
              {testimonials.map((_, i) => {
                const active = i === idx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`Témoignage ${i + 1}`}
                    aria-current={active ? "true" : undefined}
                    className="relative h-2 overflow-hidden rounded-full transition-all"
                    style={{ width: active ? 36 : 8 }}
                  >
                    <span
                      className={`absolute inset-0 rounded-full ${
                        active ? "bg-lavender-200" : "bg-lavender-300/60"
                      }`}
                    />
                    {active && !reduced && !paused && (
                      <motion.span
                        key={idx}
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: CYCLE_MS / 1000, ease: "linear" }}
                        className="absolute inset-y-0 left-0 bg-forest"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={next}
              aria-label="Témoignage suivant"
              className="w-10 h-10 rounded-full bg-white border border-lavender-200 text-forest hover:bg-lavender-50 hover:border-lavender-400 hover:translate-x-0.5 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
