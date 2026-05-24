"use client";

import { useState } from "react";
import Image from "next/image";
import { Phone, Mail, MapPin, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { Reveal } from "./reveal";

const API_URL = process.env.NEXT_PUBLIC_MAILER_URL || "https://api.lingeserein.fr";

type Status = "idle" | "sending" | "success" | "error";

export function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [consent, setConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) {
      setStatus("error");
      setErrorMsg("Merci d'accepter la politique de confidentialité pour continuer.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      company: (form.elements.namedItem("company") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      phone: (form.elements.namedItem("phone") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch(`${API_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erreur lors de l'envoi. Merci de réessayer.");
      }

      setStatus("success");
      form.reset();
      setConsent(false);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Une erreur est survenue. Réessayez ou appelez-nous.",
      );
    }
  }

  return (
    <section id="contact" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
              Contactez-nous
            </span>
            <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest mb-6">
              Prêt à simplifier
              <br />
              votre quotidien ?
            </h2>
            <p className="text-gray-700 text-lg leading-relaxed mb-10">
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
                href="tel:+33753569548"
                className="group flex items-center gap-4 text-gray-800 hover:text-forest transition-colors"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-lavender-50 group-hover:bg-lavender-100 transition-colors">
                  <Phone size={20} aria-hidden className="text-lavender-700" />
                </div>
                <div>
                  <div className="text-xs text-gray-600 uppercase tracking-wider">Téléphone</div>
                  <div className="font-medium">07 53 56 95 48</div>
                </div>
              </a>

              <a
                href="mailto:lingeserein@gmail.com"
                className="group flex items-center gap-4 text-gray-800 hover:text-forest transition-colors"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-lavender-50 group-hover:bg-lavender-100 transition-colors">
                  <Mail size={20} aria-hidden className="text-lavender-700" />
                </div>
                <div>
                  <div className="text-xs text-gray-600 uppercase tracking-wider">Email</div>
                  <div className="font-medium">lingeserein@gmail.com</div>
                </div>
              </a>

              <div className="flex items-center gap-4 text-gray-800">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-lavender-50">
                  <MapPin size={20} aria-hidden className="text-lavender-700" />
                </div>
                <div>
                  <div className="text-xs text-gray-600 uppercase tracking-wider">
                    Zone d&apos;intervention
                  </div>
                  <div className="font-medium">Rue Simone Weil &mdash; 84100 Orange, Vaucluse</div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            {status === "success" ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-3xl bg-white/90 p-8 md:p-10 shadow-lg shadow-lavender-100/20 border border-lavender-100/40 text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-forest/10 mb-6">
                  <CheckCircle size={32} aria-hidden className="text-forest" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-forest mb-3">Demande envoyée</h3>
                <p className="text-gray-700 leading-relaxed mb-8">
                  Merci pour votre confiance. Vous allez recevoir un email de confirmation. Notre
                  équipe vous recontactera sous 24 heures.
                </p>
                <button
                  onClick={() => setStatus("idle")}
                  className="text-sm font-medium text-lavender-700 hover:text-lavender-900 transition-colors"
                >
                  Envoyer une autre demande
                </button>
              </div>
            ) : (
              <form
                className="rounded-3xl bg-white/90 p-8 md:p-10 shadow-lg shadow-lavender-100/20 border border-lavender-100/40"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-800 mb-2">
                      Nom{" "}
                      <span aria-hidden className="text-red-600">
                        *
                      </span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      minLength={2}
                      autoComplete="name"
                      placeholder="Votre nom"
                      className="w-full min-h-[44px] rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="company"
                      className="block text-sm font-medium text-gray-800 mb-2"
                    >
                      Établissement{" "}
                      <span aria-hidden className="text-red-600">
                        *
                      </span>
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      required
                      minLength={2}
                      autoComplete="organization"
                      placeholder="Nom de l'établissement"
                      className="w-full min-h-[44px] rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mb-5">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-2">
                    Email{" "}
                    <span aria-hidden className="text-red-600">
                      *
                    </span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder="votre@email.fr"
                    className="w-full min-h-[44px] rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                  />
                </div>

                <div className="mb-5">
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-800 mb-2">
                    Téléphone{" "}
                    <span aria-hidden className="text-red-600">
                      *
                    </span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    minLength={8}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="06 ..."
                    className="w-full min-h-[44px] rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 focus:outline-none"
                  />
                </div>

                <div className="mb-6">
                  <label htmlFor="message" className="block text-sm font-medium text-gray-800 mb-2">
                    Votre besoin{" "}
                    <span aria-hidden className="text-red-600">
                      *
                    </span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={4}
                    required
                    minLength={10}
                    aria-describedby="message-help"
                    placeholder="Volume, fréquence, types de linge..."
                    className="w-full rounded-xl border border-lavender-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 focus:outline-none resize-none"
                  />
                  <p id="message-help" className="mt-2 text-xs text-gray-600">
                    Plus votre description est précise, plus notre devis sera juste.
                  </p>
                </div>

                <label className="flex items-start gap-3 mb-6 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    name="consent"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-lavender-300 text-forest focus:ring-2 focus:ring-lavender-300"
                  />
                  <span>
                    J&apos;accepte que mes données soient utilisées pour traiter ma demande,
                    conformément à la{" "}
                    <a
                      href="/politique-confidentialite"
                      className="underline text-forest hover:text-forest-light"
                    >
                      politique de confidentialité
                    </a>
                    .
                  </span>
                </label>

                <div aria-live="polite" aria-atomic="true">
                  {status === "error" && (
                    <div
                      role="alert"
                      className="mb-5 rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-800"
                    >
                      {errorMsg}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="group w-full inline-flex items-center justify-center gap-3 rounded-full bg-forest px-8 py-4 text-base font-medium text-white shadow-lg shadow-forest/20 transition-all duration-300 hover:bg-forest-light hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  {status === "sending" ? (
                    <>
                      <Loader2 size={18} aria-hidden className="animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      Envoyer ma demande
                      <ArrowRight
                        size={18}
                        aria-hidden
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-xs text-gray-600">
                  Réponse garantie sous 24 heures ouvrées
                </p>
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
