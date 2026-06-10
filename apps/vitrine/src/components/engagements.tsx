import Image from "next/image";
import { Reveal } from "./reveal";

export function Engagements() {
  return (
    <section id="engagements" className="relative py-28 md:py-36 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="absolute inset-0 pattern-bg opacity-[0.06]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="relative rounded-[2rem] overflow-hidden shadow-2xl shadow-forest/20">
          <div className="absolute inset-0">
            <Image src="/site/livraison-voiture.webp" alt="" fill className="object-cover" />
            <div className="absolute inset-0 bg-forest/85" />
          </div>

          <div className="relative z-10 p-12 md:p-20">
            <Reveal>
              <div className="text-center">
                <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-200 mb-4">
                  Nos engagements
                </span>
                <h2 className="font-serif text-4xl md:text-5xl font-bold text-white mb-8">
                  L&apos;excellence au service
                  <br />
                  de votre sérénité
                </h2>
                <p className="text-white/80 max-w-2xl mx-auto text-lg leading-relaxed mb-14">
                  Chez Linge Serein, chaque geste compte. De la sélection de nos fournisseurs à la
                  livraison dans votre établissement, nous construisons une relation de confiance
                  durable, fondée sur la transparence et la qualité.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
                  {[
                    { value: "100%", label: "Traçabilité du linge" },
                    { value: "48h", label: "Délai de livraison max" },
                    { value: "Éco", label: "Produits certifiés" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center">
                      <div className="font-serif text-4xl md:text-5xl font-bold text-white mb-2">
                        {stat.value}
                      </div>
                      <div className="text-sm text-white/60 uppercase tracking-wider">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
