"use client";

import Image from "next/image";
import { ArrowRight, Phone, ChevronDown } from "lucide-react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { Magnetic } from "./magnetic";
import { AvailabilityBadge } from "./availability-badge";

function KineticHeadline() {
  const reduced = useReducedMotion();
  const words = [
    { text: "Votre", className: "text-forest" },
    { text: "linge,", className: "text-forest" },
    { text: "notre", className: "text-lavender-700" },
    { text: "sérénité", className: "text-lavender-700" },
  ];
  if (reduced) {
    return (
      <h1 className="font-serif text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight">
        <span className="text-forest">Votre linge, </span>
        <span className="text-lavender-700">notre sérénité</span>
      </h1>
    );
  }
  return (
    <h1 className="font-serif text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight">
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <span className={`word-rise ${w.className}`} style={{ animationDelay: `${i * 90}ms` }}>
            {w.text}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </h1>
  );
}

export function Hero() {
  const { scrollY } = useScroll();
  const reduced = useReducedMotion();
  const bgY = useTransform(scrollY, [0, 800], [0, 160]);
  const contentY = useTransform(scrollY, [0, 600], [0, -40]);

  return (
    <section className="relative min-h-dvh flex flex-col overflow-hidden">
      <motion.div className="absolute inset-0" style={reduced ? undefined : { y: bgY }}>
        <Image
          src="/site/hero-principal.jpeg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center scale-110"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-cream/70 via-cream/50 to-cream/95" />
      </motion.div>

      <div
        aria-hidden
        className="absolute top-32 left-[10%] w-3 h-3 rounded-full bg-lavender-300 animate-float opacity-60"
      />
      <div
        aria-hidden
        className="absolute bottom-40 left-[20%] w-4 h-4 rounded-full bg-lavender-200 animate-float delay-400 opacity-40"
      />
      <div
        aria-hidden
        className="absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full bg-lavender-200/30 blur-3xl animate-blob"
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -left-20 w-[480px] h-[480px] rounded-full bg-forest/10 blur-3xl animate-blob"
        style={{ animationDelay: "4s" }}
      />

      <motion.div
        className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-28 pb-20 text-center"
        style={reduced ? undefined : { y: contentY }}
      >
        <KineticHeadline />

        <p className="mt-8 animate-fade-in-up delay-200 text-lg md:text-xl text-gray-800 max-w-2xl mx-auto leading-relaxed font-light">
          Service de location et d&apos;entretien de linge hôtelier basé à Orange, au cœur du
          Vaucluse.
          <br className="hidden md:block" />
          Une qualité irréprochable, livrée avec soin jusqu&apos;à votre établissement.
        </p>

        <div className="mt-6 animate-fade-in-up delay-300">
          <AvailabilityBadge />
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up delay-400">
          <Magnetic strength={0.3}>
            <a
              href="/devis"
              className="group inline-flex items-center gap-3 rounded-full bg-forest px-8 py-4 text-base font-medium text-white shadow-xl shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:shadow-2xl hover:shadow-forest/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              Obtenir un devis en 2 min
              <ArrowRight
                size={18}
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              />
            </a>
          </Magnetic>
          <Magnetic strength={0.25}>
            <a
              href="tel:+33685218270"
              aria-label="Nous appeler au 06 85 21 82 70"
              className="inline-flex items-center gap-3 rounded-full border-2 border-lavender-400 bg-cream/60 backdrop-blur px-8 py-4 text-base font-medium text-forest transition-all duration-300 hover:bg-lavender-50 hover:border-lavender-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              <Phone size={18} aria-hidden className="text-lavender-700" />
              Nous appeler
            </a>
          </Magnetic>
        </div>
      </motion.div>

      <div className="relative z-10 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-3 gap-4 animate-fade-in-up delay-500">
            {[
              { src: "/site/pack-linge.jpeg", alt: "Pack de linge premium prêt à être livré" },
              { src: "/site/lit-provencal.png", alt: "Lit dressé avec draps hôteliers en lin" },
              {
                src: "/site/livraison-hotel.jpeg",
                alt: "Livraison de linge à un hôtel partenaire",
              },
            ].map((img) => (
              <div
                key={img.src}
                className="group relative h-32 md:h-48 rounded-2xl overflow-hidden shadow-lg"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="(min-width: 768px) 33vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-forest/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-fade-in delay-600">
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
