import Image from "next/image";
import { Sparkles, Heart, Star, Award } from "lucide-react";
import { Reveal } from "./reveal";

const services = [
  {
    icon: <Sparkles className="text-lavender-700" size={28} aria-hidden />,
    title: "Draps & Housses",
    description:
      "Draps plats, housses de couette et taies d'oreiller en coton de haute qualité. Un confort incomparable pour vos clients.",
    image: "/site/lit-provencal.png",
    stat: "Coton 200 fils",
  },
  {
    icon: <Heart className="text-lavender-700" size={28} aria-hidden />,
    title: "Serviettes de bain",
    description:
      "Serviettes, peignoirs et tapis de bain d'une douceur exceptionnelle. L'expérience spa dans chaque chambre.",
    image: "/site/serviettes-bain.png",
    stat: "Jusqu'à 600 g/m²",
  },
  {
    icon: <Star className="text-lavender-700" size={28} aria-hidden />,
    title: "Packs complets",
    description:
      "Des packs de linge soigneusement préparés et conditionnés, prêts à être déployés dans votre établissement.",
    image: "/site/pack-linge.jpeg",
    stat: "3 gammes au choix",
  },
  {
    icon: <Award className="text-lavender-700" size={28} aria-hidden />,
    title: "Livraison à domicile",
    description:
      "Notre flotte, basée à Orange, assure la collecte et la livraison directement à votre porte dans tout le Vaucluse.",
    image: "/site/livraison-linge.jpeg",
    stat: "48 h max",
  },
];

export function Services() {
  return (
    <section id="services" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="text-center mb-20">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Nos services
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Un linge d&apos;exception
            <br />
            pour votre établissement
          </h2>
          <p className="mt-6 text-gray-700 max-w-2xl mx-auto text-lg leading-relaxed">
            De la sélection des matières premières jusqu&apos;à la livraison, nous prenons soin de
            chaque détail pour vous offrir un service irréprochable.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service, i) => (
            <Reveal key={service.title} delay={i * 100}>
              <div className="tilt-card group relative h-full rounded-3xl overflow-hidden bg-white shadow-sm border border-lavender-100/50 hover:shadow-2xl hover:shadow-lavender-200/40">
                <div className="relative h-56 overflow-hidden">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-forest/0 via-transparent to-lavender-200/0 group-hover:from-forest/10 group-hover:to-lavender-200/20 transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
                  <span className="absolute top-4 right-4 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-forest shadow-sm">
                    {service.stat}
                  </span>
                </div>
                <div className="relative p-8 -mt-8">
                  <div className="mb-4 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lavender-50 group-hover:bg-lavender-100 transition-colors duration-300 shadow-sm">
                    {service.icon}
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-forest mb-3">
                    {service.title}
                  </h3>
                  <p className="text-gray-700 leading-relaxed text-sm">{service.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
