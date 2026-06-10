import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Devis gratuit — Location de linge hôtelier en Vaucluse",
  description:
    "Estimez en 2 minutes le coût de votre linge hôtelier : draps, serviettes, linge de table. Tarifs transparents, livraison Orange, Avignon, Carpentras. Devis immédiat et sans engagement.",
  alternates: { canonical: "https://lingeserein.fr/devis" },
  openGraph: {
    title: "Devis gratuit — Linge Serein",
    description:
      "Estimez le coût de votre linge hôtelier en 2 minutes. Tarifs transparents, livraison en Vaucluse.",
    url: "https://lingeserein.fr/devis",
  },
};

export default function DevisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
