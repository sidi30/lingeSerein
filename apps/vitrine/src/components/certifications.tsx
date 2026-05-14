import { Leaf, ShieldCheck, BadgeCheck, Flag } from "lucide-react";
import { Reveal } from "./reveal";

const certifs = [
  {
    icon: <ShieldCheck size={26} aria-hidden />,
    title: "Méthode RABC",
    description:
      "Traçabilité bactériologique sur l'ensemble du processus de blanchisserie professionnelle.",
  },
  {
    icon: <Leaf size={26} aria-hidden />,
    title: "Lessives écologiques",
    description: "Produits certifiés Ecolabel européen, sans phosphates ni allergènes.",
  },
  {
    icon: <BadgeCheck size={26} aria-hidden />,
    title: "Coton Oeko-Tex 100",
    description: "Linge certifié sans substances nocives pour la peau et l'environnement.",
  },
  {
    icon: <Flag size={26} aria-hidden />,
    title: "Service local",
    description: "Entreprise basée à Orange, circuits courts et savoir-faire provençal.",
  },
];

export function Certifications() {
  return (
    <section
      id="certifications"
      aria-label="Nos engagements qualité"
      className="relative py-20 md:py-28 overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="text-center mb-14">
          <span className="inline-block text-sm font-medium uppercase tracking-[0.2em] text-lavender-700 mb-4">
            Qualité &amp; conformité
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-forest">
            Des standards à la hauteur de votre exigence
          </h2>
        </Reveal>

        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {certifs.map((c, i) => (
            <Reveal key={c.title} delay={i * 100}>
              <li className="h-full rounded-2xl bg-white border border-lavender-100/60 p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-forest/5 text-forest">
                  {c.icon}
                </div>
                <h3 className="font-serif text-base font-semibold text-forest mb-2">{c.title}</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{c.description}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
