import { Reveal } from "./reveal";

const testimonials = [
  {
    quote:
      "Depuis que nous travaillons avec Linge Serein, la qualité du linge n'est plus un sujet. Nos clients le remarquent, et c'est ce qui compte.",
    author: "Marie-Claire D.",
    role: "Directrice, Hôtel Le Mas Provençal",
  },
  {
    quote:
      "Un service impeccable, toujours à l'heure. L'équipe est à l'écoute et s'adapte à nos pics d'activité en saison estivale.",
    author: "Thomas R.",
    role: "Gérant, Domaine des Oliviers",
  },
  {
    quote:
      "La démarche éco-responsable a été déterminante dans notre choix. Nous partageons les mêmes valeurs. Un vrai partenariat.",
    author: "Sophie L.",
    role: "Responsable hébergement, Résidence Ventoux",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-28 md:py-36 gradient-lavender overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="text-center mb-20">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-600 mb-4">
            Ils nous font confiance
          </span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-forest">
            Paroles de partenaires
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <Reveal key={t.author} delay={i * 150}>
              <div className="relative h-full rounded-3xl bg-white/70 p-8 shadow-sm border border-lavender-100/50 transition-all duration-500 hover:shadow-xl hover:bg-white">
                <div className="font-serif text-6xl text-lavender-200 leading-none mb-4">
                  &ldquo;
                </div>
                <p className="text-gray-600 leading-relaxed mb-8 italic">{t.quote}</p>
                <div className="mt-auto">
                  <div className="font-serif font-semibold text-forest">{t.author}</div>
                  <div className="text-sm text-gray-400">{t.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
