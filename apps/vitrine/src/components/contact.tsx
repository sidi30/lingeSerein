"use client";

import Image from "next/image";
import { Phone, Mail, MapPin, ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

export function Contact() {
  return (
    <section id="contact" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-600 mb-4">
              Contactez-nous
            </span>
            <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest mb-6">
              Prêt à simplifier
              <br />
              votre quotidien ?
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed mb-10">
              Recevez un devis personnalisé sous 24 heures. Notre équipe est à votre disposition
              pour échanger sur vos besoins.
            </p>

            <div className="relative rounded-2xl overflow-hidden mb-10 shadow-lg">
              <Image
                src="/site/livraison-hotel.jpeg"
                alt="Livraison Linge Serein"
                width={600}
                height={300}
                className="w-full h-48 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-forest/40 to-transparent" />
            </div>

            <div className="flex flex-col gap-5">
              <a
                href="tel:+33490000000"
                className="group flex items-center gap-4 text-gray-600 hover:text-forest transition-colors"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-lavender-50 group-hover:bg-lavender-100 transition-colors">
                  <Phone size={20} className="text-lavender-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Téléphone</div>
                  <div className="font-medium">04 90 00 00 00</div>
                </div>
              </a>

              <a
                href="mailto:contact@lingeserein.fr"
                className="group flex items-center gap-4 text-gray-600 hover:text-forest transition-colors"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-lavender-50 group-hover:bg-lavender-100 transition-colors">
                  <Mail size={20} className="text-lavender-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Email</div>
                  <div className="font-medium">contact@lingeserein.fr</div>
                </div>
              </a>

              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-lavender-50">
                  <MapPin size={20} className="text-lavender-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Zone d&apos;intervention
                  </div>
                  <div className="font-medium">Orange &mdash; Vaucluse, Provence</div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <form
              className="rounded-3xl bg-white/80 p-8 md:p-10 shadow-lg shadow-lavender-100/20 border border-lavender-100/40"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-600 mb-2">
                    Nom
                  </label>
                  <input
                    type="text"
                    id="name"
                    placeholder="Votre nom"
                    className="w-full rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 transition-all focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-gray-600 mb-2">
                    Établissement
                  </label>
                  <input
                    type="text"
                    id="company"
                    placeholder="Nom de l'établissement"
                    className="w-full rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 transition-all focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mb-5">
                <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  placeholder="votre@email.fr"
                  className="w-full rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 transition-all focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                />
              </div>

              <div className="mb-5">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-600 mb-2">
                  Téléphone
                </label>
                <input
                  type="tel"
                  id="phone"
                  placeholder="04 90 ..."
                  className="w-full rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 transition-all focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                />
              </div>

              <div className="mb-8">
                <label htmlFor="message" className="block text-sm font-medium text-gray-600 mb-2">
                  Votre besoin
                </label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Décrivez vos besoins en linge (volume, fréquence, types de linge...)"
                  className="w-full rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 transition-all focus:border-lavender-400 focus:ring-2 focus:ring-lavender-100 focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="group w-full inline-flex items-center justify-center gap-3 rounded-full bg-forest px-8 py-4 text-base font-medium text-white shadow-lg shadow-forest/20 transition-all duration-500 hover:bg-forest-light hover:shadow-xl hover:-translate-y-0.5"
              >
                Envoyer ma demande
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>

              <p className="mt-4 text-center text-xs text-gray-400">
                Réponse garantie sous 24 heures ouvrées
              </p>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
