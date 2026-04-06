import Image from "next/image";
import { ArrowRight, Phone, ChevronDown } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/site/hero-principal.jpeg"
          alt="Linge Serein — Service complet de linge hôtelier"
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-cream/70 via-cream/50 to-cream/95" />
      </div>

      <div className="absolute top-32 left-[10%] w-3 h-3 rounded-full bg-lavender-300 animate-float opacity-60" />
      <div className="absolute top-48 right-[15%] w-2 h-2 rounded-full bg-lavender-400 animate-float delay-200 opacity-40" />
      <div className="absolute bottom-40 left-[20%] w-4 h-4 rounded-full bg-lavender-200 animate-float delay-400 opacity-40" />
      <div className="absolute top-60 right-[30%] w-2.5 h-2.5 rounded-full bg-lavender-300 animate-float delay-300 opacity-50" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-28 pb-20 text-center">
        <div className="mb-10 animate-scale-in">
          <div className="relative inline-block">
            <div className="absolute -inset-8 bg-cream/80 rounded-full blur-3xl" />
            <Image
              src="/images/logo_full.svg"
              alt="Linge Serein"
              width={420}
              height={200}
              className="relative h-40 md:h-52 lg:h-64 w-auto drop-shadow-lg"
              priority
            />
          </div>
        </div>

        <h1 className="animate-fade-in-up font-serif text-5xl md:text-6xl xl:text-7xl font-bold text-forest leading-[1.1] tracking-tight">
          Votre linge, <span className="text-lavender-600">notre sérénité</span>
        </h1>

        <p className="mt-8 animate-fade-in-up delay-200 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed font-light">
          Service de location et d&apos;entretien de linge hôtelier basé à Orange, au cœur du
          Vaucluse.
          <br className="hidden md:block" />
          Une qualité irréprochable, livrée avec soin jusqu&apos;à votre établissement.
        </p>

        <div className="mt-12 flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up delay-400">
          <a
            href="#contact"
            className="group inline-flex items-center gap-3 rounded-full bg-forest px-8 py-4 text-base font-medium text-white shadow-xl shadow-forest/20 transition-all duration-500 hover:bg-forest-light hover:shadow-2xl hover:shadow-forest/30 hover:-translate-y-1"
          >
            Découvrir nos services
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="tel:+33685218270"
            className="inline-flex items-center gap-3 rounded-full border-2 border-lavender-300 px-8 py-4 text-base font-medium text-forest transition-all duration-500 hover:bg-lavender-50 hover:border-lavender-400 hover:-translate-y-1"
          >
            <Phone size={18} className="text-lavender-600" />
            Nous appeler
          </a>
        </div>
      </div>

      <div className="relative z-10 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-3 gap-4 animate-fade-in-up delay-500">
            {[
              { src: "/site/pack-linge.jpeg", alt: "Linge premium" },
              { src: "/site/lit-provencal.png", alt: "Draps hôteliers" },
              {
                src: "/site/livraison-hotel.jpeg",
                alt: "Livraison à votre hôtel",
              },
            ].map((img) => (
              <div
                key={img.src}
                className="relative h-32 md:h-48 rounded-2xl overflow-hidden shadow-lg"
              >
                <Image src={img.src} alt={img.alt} fill className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-fade-in delay-600">
        <a
          href="#services"
          className="inline-flex flex-col items-center gap-2 text-lavender-500 hover:text-lavender-700 transition-colors"
        >
          <span className="text-xs font-medium uppercase tracking-widest">Découvrir</span>
          <ChevronDown size={20} className="animate-bounce" />
        </a>
      </div>
    </section>
  );
}
