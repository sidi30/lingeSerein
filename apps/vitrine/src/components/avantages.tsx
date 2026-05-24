"use client";

import Image from "next/image";
import { MapPin, Repeat, Calendar, Star } from "lucide-react";
import { motion } from "motion/react";
import { Reveal } from "./reveal";

const avantages = [
  {
    icon: <MapPin size={24} />,
    title: "100 % local",
    description:
      "Basés à Orange, on connaît le Vaucluse, ses routes, ses saisons. Réactivité garantie, pas de prestataire national impersonnel.",
  },
  {
    icon: <Repeat size={24} />,
    title: "Rotation simplifiée",
    description:
      "On reprend le sale et on livre le propre en même temps. Zéro stock à gérer, zéro machine à lancer entre deux voyageurs.",
  },
  {
    icon: <Calendar size={24} />,
    title: "Sans engagement",
    description:
      "Pas d'abonnement, pas de contrat annuel. Vous commandez quand vous en avez besoin, à la rotation, sans minimum.",
  },
  {
    icon: <Star size={24} />,
    title: "Qualité hôtelière",
    description:
      "Linge blanc, 550 g/m², entretenu en blanchisserie. Vos voyageurs retrouvent la qualité d'un hôtel dans votre logement.",
  },
];

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const card = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 220, damping: 22 },
  },
};

const iconV = {
  hidden: { scale: 0, rotate: -90 },
  show: {
    scale: 1,
    rotate: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 14 },
  },
};

export function Avantages() {
  return (
    <section id="avantages" className="relative py-28 md:py-36 gradient-lavender overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <div className="relative group">
              <motion.div
                aria-hidden
                initial={{ rotate: 0 }}
                whileInView={{ rotate: 2 }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute -inset-4 rounded-[2rem] bg-lavender-100/50"
              />
              <Image
                src="/site/livraison-hotel.jpeg"
                alt="Livraison de linge frais à l'hôtel"
                width={700}
                height={467}
                className="relative rounded-3xl shadow-2xl shadow-forest/10 object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              />
            </div>
          </Reveal>

          <div>
            <Reveal>
              <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
                Pourquoi Linge Serein ?
              </span>
              <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest mb-12">
                Ce que nos clients
                <br />
                apprécient
              </h2>
            </Reveal>

            <motion.div
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-6"
            >
              {avantages.map((item) => (
                <motion.div
                  key={item.title}
                  variants={card}
                  whileHover={{ y: -4 }}
                  className="group flex gap-4 rounded-2xl bg-white/60 p-5 border border-lavender-100/40 transition-colors duration-300 hover:bg-white hover:shadow-lg hover:shadow-lavender-100/40"
                >
                  <motion.div
                    variants={iconV}
                    className="shrink-0 mt-0.5 flex items-center justify-center w-10 h-10 rounded-xl bg-forest/5 text-forest group-hover:bg-forest group-hover:text-white group-hover:rotate-6 transition-all duration-300"
                  >
                    {item.icon}
                  </motion.div>
                  <div>
                    <h3 className="font-serif text-base font-semibold text-forest mb-1">
                      {item.title}
                    </h3>
                    <p className="text-gray-700 text-sm leading-relaxed">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
