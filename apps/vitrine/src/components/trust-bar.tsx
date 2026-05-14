import { Marquee } from "./marquee";

const partners = [
  "Hôtel Le Mas Provençal",
  "Domaine des Oliviers",
  "Résidence Ventoux",
  "Mas de la Lavande",
  "Villa Sérénité",
  "Auberge du Vieux Pont",
  "Château des Roses",
  "Bastide Saint-Antoine",
];

export function TrustBar() {
  return (
    <section
      aria-label="Établissements partenaires"
      className="relative border-y border-lavender-100/60 bg-white/60 py-10"
    >
      <div className="mx-auto max-w-7xl px-6 mb-6">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-lavender-700">
          Ils nous font confiance dans le Vaucluse
        </p>
      </div>
      <Marquee speed={45}>
        {partners.map((name) => (
          <span
            key={name}
            className="font-serif text-base md:text-lg text-gray-600 hover:text-forest transition-colors duration-300 whitespace-nowrap"
          >
            {name}
            <span aria-hidden className="mx-12 text-lavender-300">
              ✦
            </span>
          </span>
        ))}
      </Marquee>
    </section>
  );
}
