"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Phone, ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Magnetic } from "./magnetic";

function KineticHeadline() {
  const reduced = useReducedMotion();
  const words = [
    { text: "Le linge", className: "text-forest" },
    { text: "propre,", className: "text-forest" },
    { text: "livré.", className: "text-lavender-700" },
  ];
  if (reduced) {
    return (
      <h1 className="font-serif text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight">
        <span className="text-forest">Le linge propre, </span>
        <span className="text-lavender-700">livré.</span>
      </h1>
    );
  }
  return (
    <h1 className="font-serif text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight">
      {words.map((w, i) => (
        <span key={i}>
          <span className="inline-block overflow-hidden align-bottom">
            <span className={`word-rise ${w.className}`} style={{ animationDelay: `${i * 90}ms` }}>
              {w.text}
            </span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </h1>
  );
}

const SLIDES = [
  {
    src: "/site/linge-fleur.webp",
    alt: "Linge de bain blanc plié, décoré de fleurs, sur un lit hôtelier impeccable",
    caption: "Linge de lit & de bain impeccable",
  },
  {
    src: "/site/service-gants.webp",
    alt: "Préparation soignée du linge avec gants blancs, qualité hôtelière",
    caption: "Pliage & préparation soignés",
  },
  {
    src: "/site/chambre-ambiance.webp",
    alt: "Serviettes roulées sur un lit prêt à accueillir des voyageurs",
    caption: "Prêt à accueillir vos voyageurs",
  },
];

function HeroCarousel() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 4500);
    return () => clearInterval(id);
  }, [reduced]);

  const slide = SLIDES[index];

  return (
    <div className="relative">
      {/* soft glow behind frame */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-lavender-200/50 via-transparent to-forest/10 blur-2xl"
      />
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-2xl shadow-forest/15 ring-1 ring-white/60">
        <AnimatePresence mode="sync">
          <motion.div
            key={slide.src}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: reduced ? 1 : 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1.1, ease: "easeInOut" },
              scale: { duration: 5, ease: "easeOut" },
            }}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              className="object-cover"
              priority={index === 0}
            />
          </motion.div>
        </AnimatePresence>

        {/* legibility gradient for caption */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-forest-dark/70 to-transparent" />

        {/* caption */}
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-3">
          <AnimatePresence mode="wait">
            <motion.p
              key={slide.caption}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="font-serif text-lg md:text-xl font-semibold text-white drop-shadow-sm"
            >
              {slide.caption}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* dots */}
      <div className="mt-5 flex items-center justify-center gap-2.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Voir : ${s.caption}`}
            aria-current={i === index}
            className={`h-2.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
              i === index ? "w-8 bg-forest" : "w-2.5 bg-lavender-300 hover:bg-lavender-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="gradient-lavender relative min-h-dvh flex flex-col overflow-hidden">
      {/* ambient decor */}
      <div
        aria-hidden
        className="absolute top-32 left-[8%] w-3 h-3 rounded-full bg-lavender-300 animate-float opacity-60"
      />
      <div
        aria-hidden
        className="absolute bottom-40 left-[16%] w-4 h-4 rounded-full bg-lavender-200 animate-float delay-400 opacity-40"
      />
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-[460px] h-[460px] rounded-full bg-lavender-200/40 blur-3xl animate-blob"
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-24 w-[520px] h-[520px] rounded-full bg-forest/10 blur-3xl animate-blob"
        style={{ animationDelay: "4s" }}
      />

      <div className="relative z-10 flex-1 mx-auto w-full max-w-7xl px-6 pt-28 pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ── Text column ── */}
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-lavender-200 bg-white/70 px-4 py-1.5 text-sm font-medium text-lavender-700 backdrop-blur animate-fade-in-up">
              <span className="h-2 w-2 rounded-full bg-forest animate-gentle-pulse" />
              Basé à Orange · livraison dans tout le Vaucluse
            </span>

            <div className="mt-6">
              <KineticHeadline />
            </div>

            <p className="mt-5 animate-fade-in-up delay-100 text-xl md:text-2xl text-gray-700 max-w-xl mx-auto lg:mx-0 font-light leading-snug">
              Vous accueillez, on s&apos;occupe du reste.
            </p>

            <p className="mt-3 animate-fade-in-up delay-200 text-base text-gray-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Location, livraison et entretien de linge de bain et de lit pour vos locations de
              courte durée.
            </p>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 max-w-2xl mx-auto lg:mx-0 animate-fade-in-up delay-300">
              {[
                { value: "7,50 €", label: "set bain / rotation" },
                { value: "16,50 €", label: "set lit / rotation" },
                { value: "J+0", label: "livraison à Orange" },
                { value: "0", label: "engagement contractuel" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl bg-white/75 backdrop-blur border border-lavender-100/70 px-4 py-3 text-center shadow-sm"
                >
                  <div className="font-serif text-lg font-bold text-forest tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center lg:justify-start gap-4 animate-fade-in-up delay-400">
              <Magnetic strength={0.3}>
                <a
                  href="#services"
                  className="group inline-flex items-center gap-3 rounded-full bg-forest px-8 py-4 text-base font-medium text-white shadow-xl shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:shadow-2xl hover:shadow-forest/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  Découvrir nos offres
                  <ArrowRight
                    size={18}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-1"
                  />
                </a>
              </Magnetic>
              <Magnetic strength={0.25}>
                <a
                  href="tel:+33753569548"
                  aria-label="Nous appeler au 07 53 56 95 48"
                  className="inline-flex items-center gap-3 rounded-full border-2 border-lavender-400 bg-cream/60 backdrop-blur px-8 py-4 text-base font-medium text-forest transition-all duration-300 hover:bg-lavender-50 hover:border-lavender-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  <Phone size={18} aria-hidden className="text-lavender-700" />
                  Nous appeler
                </a>
              </Magnetic>
            </div>
          </div>

          {/* ── Carousel column ── */}
          <div className="animate-fade-in-up delay-200 mx-auto w-full max-w-md lg:max-w-none">
            <HeroCarousel />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex justify-center pb-6">
        <a
          href="#services"
          className="inline-flex flex-col items-center gap-2 text-lavender-700 hover:text-lavender-900 transition-colors"
        >
          <span className="text-xs font-medium uppercase tracking-widest">Découvrir</span>
          <ChevronDown size={20} aria-hidden className="animate-bounce" />
        </a>
      </div>
    </section>
  );
}
