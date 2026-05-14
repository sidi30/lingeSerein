"use client";

import Image from "next/image";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { Magnetic } from "./magnetic";

export function VisualBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], ["-15%", "15%"]);
  const textX = useTransform(scrollYProgress, [0, 0.5, 1], [-40, 0, 30]);

  return (
    <section ref={ref} className="relative py-0 overflow-hidden">
      <div className="relative h-[400px] md:h-[500px]">
        <motion.div
          className="absolute inset-0 will-change-transform"
          style={reduced ? undefined : { y: bgY }}
        >
          <Image
            src="/site/livraison-voiture.jpeg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover scale-110"
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-r from-forest/85 via-forest/55 to-transparent" />

        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto max-w-7xl px-6 w-full">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={reduced ? undefined : { x: textX }}
              className="max-w-lg text-white"
            >
              <h2 className="font-serif text-3xl md:text-5xl font-bold mb-6 leading-tight">
                <motion.span
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15, duration: 0.6 }}
                  className="block"
                >
                  La Provence au service
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="block text-lavender-200"
                >
                  de votre hôtellerie
                </motion.span>
              </h2>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.45, duration: 0.6 }}
                className="text-white/80 text-lg leading-relaxed mb-8"
              >
                Depuis Orange, nos véhicules sillonnent le Vaucluse chaque jour pour vous livrer un
                linge d&apos;une fraîcheur et d&apos;une propreté irréprochables.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.55, duration: 0.5 }}
              >
                <Magnetic strength={0.25}>
                  <a
                    href="/devis"
                    className="inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-base font-medium text-forest shadow-xl transition-colors hover:bg-cream-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-forest"
                  >
                    Demander un devis gratuit
                    <ArrowRight size={18} aria-hidden />
                  </a>
                </Magnetic>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
