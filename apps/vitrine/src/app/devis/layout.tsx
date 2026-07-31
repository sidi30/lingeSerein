import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Devis gratuit — Location de linge hôtelier en Vaucluse",
  description:
    "Estimez en 2 minutes le coût de votre linge hôtelier : kits bain, kits lit, articles à l'unité. Tarifs transparents, livraison dans tout le Vaucluse — Orange, Avignon, Carpentras, Cavaillon. Devis immédiat.",
  alternates: { canonical: "https://lingeserein.fr/devis" },
  openGraph: {
    title: "Devis gratuit — Linge Serein",
    description:
      "Estimez le coût de votre linge hôtelier en 2 minutes. Tarifs transparents, livraison dans tout le Vaucluse depuis Orange.",
    url: "https://lingeserein.fr/devis",
  },
};

export default function DevisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
