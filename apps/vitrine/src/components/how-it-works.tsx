"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "01",
    title: "Échangeons ensemble",
    description:
      "Nous analysons vos besoins : volume, fréquence, types de linge. Un devis personnalisé vous est proposé sous 24h.",
    image: "/site/pub-vitrine.jpeg",
  },
  {
    number: "02",
    title: "Nous prenons le relais",
    description:
      "Collecte, lavage professionnel, contrôle qualité et conditionnement soigné. Votre linge est traité avec le plus grand soin.",
    image: "/site/pack-linge.jpeg",
  },
  {
    number: "03",
    title: "Livraison à votre porte",
    description:
      "Votre linge frais et impeccable est livré selon le planning convenu. Simple, ponctuel, serein.",
    image: "/site/livraison-linge.jpeg",
  },
];

export function HowItWorks() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      const el = wrapperRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const total = el.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;
        const p = Math.max(0, Math.min(1, scrolled / Math.max(1, total)));
        setProgress(p);
      }
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  if (reduced) {
    return (
      <section id="fonctionnement" className="relative py-28 md:py-36 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
              Simple et efficace
            </span>
            <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
              Comment ça marche ?
            </h2>
            <p className="mt-6 text-gray-700 max-w-2xl mx-auto text-lg leading-relaxed">
              Trois étapes simples pour ne plus jamais vous soucier de votre linge.
            </p>
          </div>
          <div className="flex flex-col gap-16">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
              >
                <div className={`relative ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={700}
                    height={467}
                    className="relative rounded-3xl shadow-xl object-cover w-full"
                  />
                  <div className="absolute -top-4 -left-4 flex items-center justify-center w-16 h-16 rounded-full gradient-forest text-white font-serif text-xl font-bold shadow-lg shadow-forest/30 z-10">
                    {step.number}
                  </div>
                </div>
                <div className={`${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <h3 className="font-serif text-3xl font-bold text-forest mb-4">{step.title}</h3>
                  <p className="text-gray-700 text-lg leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const scaled = progress * steps.length;
  const activeIdx = Math.min(steps.length - 1, Math.floor(scaled));

  return (
    <section
      id="fonctionnement"
      ref={wrapperRef}
      className="relative"
      style={{ height: `${steps.length * 100}vh` }}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="sticky top-0 h-screen flex flex-col overflow-hidden">
        <div className="mx-auto max-w-7xl w-full px-6 pt-24 md:pt-28">
          <div className="text-center">
            <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-3">
              Simple et efficace
            </span>
            <h2 className="font-serif text-3xl md:text-5xl font-bold text-forest">
              Comment ça marche ?
            </h2>
            <p className="mt-4 text-gray-700 max-w-2xl mx-auto text-base md:text-lg">
              Trois étapes simples pour ne plus jamais vous soucier de votre linge.
            </p>
          </div>

          <div className="mt-6 md:mt-8 flex items-center justify-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className="h-1 w-12 md:w-16 rounded-full bg-lavender-100 overflow-hidden"
              >
                <div
                  className="h-full bg-forest origin-left transition-transform duration-300 ease-out"
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(1, scaled - i))})`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 relative mx-auto max-w-7xl w-full px-6 mt-8">
          {steps.map((step, i) => {
            const localProgress = scaled - i;
            const isActive = i === activeIdx;
            const opacity = isActive ? 1 : Math.max(0, 1 - Math.abs(localProgress) * 1.4);
            const translateY = isActive ? 0 : localProgress < 0 ? 40 : -40;
            const scale = isActive ? 1 : 0.96;

            return (
              <div
                key={step.number}
                aria-hidden={!isActive}
                className="absolute inset-0 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center px-6"
                style={{
                  opacity,
                  transform: `translateY(${translateY}px) scale(${scale})`,
                  transition: "opacity 500ms ease-out, transform 500ms ease-out",
                  pointerEvents: isActive ? "auto" : "none",
                }}
              >
                <div className={`relative ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                  <div
                    className={`absolute -inset-3 rounded-[2rem] bg-lavender-100/40 ${
                      i % 2 === 0 ? "-rotate-2" : "rotate-2"
                    }`}
                  />
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={700}
                    height={467}
                    className="relative rounded-3xl shadow-2xl object-cover w-full max-h-[42vh] lg:max-h-[55vh]"
                  />
                  <div className="absolute -top-4 -left-4 lg:-top-6 lg:-left-6 flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full gradient-forest text-white font-serif text-lg lg:text-xl font-bold shadow-lg shadow-forest/30 z-10">
                    {step.number}
                  </div>
                </div>

                <div className={`${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <span className="block text-xs uppercase tracking-[0.25em] text-lavender-700 mb-3">
                    Étape {step.number}
                  </span>
                  <h3 className="font-serif text-2xl md:text-4xl font-bold text-forest mb-4 leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-gray-700 text-base md:text-lg leading-relaxed max-w-xl">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
