import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

export function VisualBanner() {
  return (
    <section className="relative py-0 overflow-hidden">
      <div className="relative h-[400px] md:h-[500px]">
        <Image
          src="/site/livraison-voiture.jpeg"
          alt="Livraison Linge Serein en Provence"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-forest/80 via-forest/50 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto max-w-7xl px-6 w-full">
            <Reveal>
              <div className="max-w-lg text-white">
                <h2 className="font-serif text-3xl md:text-5xl font-bold mb-6 leading-tight">
                  La Provence au service
                  <br />
                  de votre hôtellerie
                </h2>
                <p className="text-white/80 text-lg leading-relaxed mb-8">
                  Depuis Orange, nos véhicules sillonnent le Vaucluse chaque jour pour vous livrer
                  un linge d&apos;une fraîcheur et d&apos;une propreté irréprochables.
                </p>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-base font-medium text-forest shadow-xl transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl"
                >
                  Demander un devis gratuit
                  <ArrowRight size={18} />
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
