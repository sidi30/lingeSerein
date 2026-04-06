import Image from "next/image";
import { Reveal } from "./reveal";

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
  return (
    <section id="fonctionnement" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="text-center mb-20">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-600 mb-4">
            Simple et efficace
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Comment ça marche ?
          </h2>
          <p className="mt-6 text-gray-500 max-w-2xl mx-auto text-lg leading-relaxed">
            Trois étapes simples pour ne plus jamais vous soucier de votre linge.
          </p>
        </Reveal>

        <div className="flex flex-col gap-20">
          {steps.map((step, i) => (
            <Reveal key={step.number} delay={i * 100}>
              <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center`}>
                <div className={`relative ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                  <div
                    className={`absolute -inset-3 rounded-[2rem] bg-lavender-100/30 ${i % 2 === 0 ? "-rotate-2" : "rotate-2"}`}
                  />
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={700}
                    height={467}
                    className="relative rounded-3xl shadow-xl object-cover w-full"
                  />
                  <div className="absolute -top-4 -left-4 lg:-top-6 lg:-left-6 flex items-center justify-center w-16 h-16 rounded-full gradient-forest text-white font-serif text-xl font-bold shadow-lg shadow-forest/30 z-10">
                    {step.number}
                  </div>
                </div>

                <div className={`${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <h3 className="font-serif text-3xl font-bold text-forest mb-4">{step.title}</h3>
                  <p className="text-gray-500 text-lg leading-relaxed">{step.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
