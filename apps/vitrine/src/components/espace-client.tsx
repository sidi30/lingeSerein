"use client";

import Image from "next/image";
import {
  ArrowRight,
  Phone,
  Mail,
  Clock,
  X,
  Smartphone,
  PackageCheck,
  CalendarClock,
  BarChart3,
  Bell,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { Reveal } from "./reveal";
import { AppMockup } from "./app-mockup";

const beforeItems = [
  { icon: <Phone size={18} />, text: "Appels téléphoniques pour chaque commande" },
  { icon: <Mail size={18} />, text: "Échanges d'emails à rallonge" },
  { icon: <ClipboardList size={18} />, text: "Suivi sur tableurs Excel ou papier" },
  { icon: <Clock size={18} />, text: "Aucune visibilité sur les livraisons" },
  { icon: <Bell size={18} />, text: "Oublis, erreurs et ruptures de stock" },
];

const afterItems = [
  { icon: <Smartphone size={18} />, text: "Commandez en 3 clics depuis l'appli" },
  { icon: <PackageCheck size={18} />, text: "Suivi en temps réel de chaque commande" },
  { icon: <BarChart3 size={18} />, text: "Votre stock visible en un coup d'œil" },
  { icon: <CalendarClock size={18} />, text: "Planning de livraison toujours à jour" },
  { icon: <Bell size={18} />, text: "Notifications à chaque étape, zéro surprise" },
];

const simulationSteps = [
  {
    step: "1",
    title: "Ouvrez l'appli",
    description: "Connectez-vous à votre espace en un instant",
    screen: "Accueil — Stock : 142 pièces",
  },
  {
    step: "2",
    title: "Passez commande",
    description: "Sélectionnez vos articles, la quantité, le créneau",
    screen: "Nouvelle commande — 80 draps, 120 serviettes",
  },
  {
    step: "3",
    title: "Suivez en direct",
    description: "Votre commande passe de « en préparation » à « livrée »",
    screen: "Statut : En livraison — Arrivée 9h30",
  },
  {
    step: "4",
    title: "C'est livré",
    description: "Notification reçue, linge à votre porte. Terminé.",
    screen: "Livraison confirmée — Bonne journée !",
  },
];

export function EspaceClient() {
  return (
    <section id="espace-client" className="relative py-28 md:py-36 overflow-hidden bg-forest-dark">
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="pattern-bg h-full w-full" />
      </div>
      <div className="absolute top-20 left-[10%] w-72 h-72 rounded-full bg-lavender-500/10 blur-3xl" />
      <div className="absolute bottom-20 right-[10%] w-96 h-96 rounded-full bg-forest-light/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Header */}
        <Reveal className="text-center mb-20">
          <div className="inline-flex items-center gap-2 rounded-full bg-lavender-500/20 px-4 py-1.5 mb-6">
            <Smartphone size={14} className="text-lavender-300" />
            <span className="text-sm font-medium text-lavender-200 uppercase tracking-wider">
              Ce qui fait la différence
            </span>
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white leading-tight">
            Votre espace client,
            <br />
            <span className="text-lavender-300">tout au bout des doigts</span>
          </h2>
          <p className="mt-6 text-white/50 max-w-2xl mx-auto text-lg leading-relaxed">
            Chaque client dispose de son propre espace digital pour gérer l&apos;intégralité de son
            linge en toute autonomie. Plus besoin de décrocher le téléphone.
          </p>
        </Reveal>

        {/* Avant / Après */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24">
          <Reveal>
            <div className="relative rounded-3xl border border-red-500/20 bg-red-500/5 p-8 md:p-10 h-full">
              <div className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-1.5 mb-6">
                <X size={14} className="text-red-400" />
                <span className="text-sm font-semibold text-red-400 uppercase tracking-wider">
                  Avant
                </span>
              </div>
              <h3 className="font-serif text-2xl font-bold text-white/90 mb-2">
                Sans Linge Serein
              </h3>
              <p className="text-white/40 text-sm mb-8">
                La gestion du linge est une charge mentale permanente.
              </p>
              <div className="flex flex-col gap-4">
                {beforeItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-xl bg-white/5 border border-white/5 px-5 py-3.5"
                  >
                    <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/10 text-red-400">
                      {item.icon}
                    </div>
                    <span className="text-white/60 text-sm">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="relative rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-8 md:p-10 h-full">
              <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-emerald-500/10 via-transparent to-lavender-500/10 pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-1.5 mb-6">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                    Après
                  </span>
                </div>
                <h3 className="font-serif text-2xl font-bold text-white/90 mb-2">
                  Avec Linge Serein
                </h3>
                <p className="text-white/40 text-sm mb-8">
                  Tout est automatisé, fluide et sous contrôle.
                </p>
                <div className="flex flex-col gap-4">
                  {afterItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 rounded-xl bg-white/5 border border-emerald-500/10 px-5 py-3.5"
                    >
                      <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400">
                        {item.icon}
                      </div>
                      <span className="text-white/70 text-sm">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Simulation */}
        <Reveal className="text-center mb-14">
          <h3 className="font-serif text-3xl md:text-4xl font-bold text-white">
            Concrètement, ça donne quoi ?
          </h3>
          <p className="mt-4 text-white/40 max-w-xl mx-auto">
            Voici comment se passe une commande type, du bout des doigts.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Phone mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <Reveal>
              <div className="relative">
                <div className="absolute inset-0 -m-8 rounded-full bg-lavender-500/20 blur-3xl animate-gentle-pulse" />
                <div className="relative w-[260px] md:w-[300px]">
                  <div className="relative rounded-[3rem] bg-gray-900 p-3 shadow-2xl shadow-black/40 ring-1 ring-white/10">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-gray-900 rounded-b-2xl z-10" />
                    <div className="relative rounded-[2.4rem] overflow-hidden aspect-[9/19.5]">
                      <AppMockup />
                    </div>
                  </div>

                  <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-black/30 ring-4 ring-forest-dark">
                    <Image
                      src="/site/app-icon.png"
                      alt="Linge Serein App"
                      fill
                      className="object-cover"
                    />
                  </div>

                  <div className="absolute -top-2 -left-4 md:-left-10 glass rounded-2xl px-4 py-3 shadow-xl animate-float delay-200 max-w-[200px]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-forest flex items-center justify-center shrink-0">
                        <PackageCheck size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-forest leading-tight">
                          Livraison confirmée
                        </p>
                        <p className="text-[9px] text-gray-400">Demain, 9h - 11h</p>
                      </div>
                    </div>
                  </div>

                  <div className="absolute top-1/3 -right-4 md:-right-12 glass rounded-2xl px-4 py-3 shadow-xl animate-float delay-500 max-w-[180px]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-lavender-500 flex items-center justify-center shrink-0">
                        <BarChart3 size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-forest leading-tight">
                          Stock optimal
                        </p>
                        <p className="text-[9px] text-gray-400">142 pièces disponibles</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Steps */}
          <div className="lg:col-span-7">
            <div className="relative">
              <div className="absolute left-[19px] top-4 bottom-4 w-px bg-gradient-to-b from-lavender-500/40 via-emerald-500/40 to-emerald-500/40 hidden sm:block" />
              <div className="flex flex-col gap-6">
                {simulationSteps.map((s, i) => (
                  <Reveal key={s.step} delay={i * 150}>
                    <div className="group flex gap-5 items-start">
                      <div className="relative z-10 shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-lavender-500/20 text-lavender-300 font-serif font-bold text-sm ring-4 ring-forest-dark group-hover:bg-lavender-500 group-hover:text-white transition-all duration-300">
                        {s.step}
                      </div>
                      <div className="flex-1 rounded-2xl bg-white/5 border border-white/10 p-5 transition-all duration-500 group-hover:bg-white/10 group-hover:border-lavender-400/20">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h4 className="font-semibold text-white text-base">{s.title}</h4>
                            <p className="text-white/40 text-sm mt-0.5">{s.description}</p>
                          </div>
                          <div className="shrink-0 rounded-xl bg-forest/40 border border-white/10 px-4 py-2.5 max-w-[260px]">
                            <p className="text-[11px] text-lavender-200 font-mono leading-snug">
                              {s.screen}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal delay={700}>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 pl-0 sm:pl-[60px]">
                <a
                  href="#contact"
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-base font-medium text-forest shadow-xl transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl"
                >
                  Demander une démo
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </a>
                <div className="flex items-center gap-3 text-white/40 text-sm">
                  <div className="flex -space-x-1">
                    <div className="w-8 h-8 rounded-full bg-lavender-400/30 ring-2 ring-forest-dark flex items-center justify-center text-[10px] text-white font-bold">
                      iOS
                    </div>
                    <div className="w-8 h-8 rounded-full bg-forest-light/40 ring-2 ring-forest-dark flex items-center justify-center text-[10px] text-white font-bold">
                      And
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/10 ring-2 ring-forest-dark flex items-center justify-center text-[10px] text-white font-bold">
                      Web
                    </div>
                  </div>
                  iOS, Android &amp; Web
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
