import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Devis gratuit — Location de linge hôtelier à Orange",
  description:
    "Estimez en 2 minutes le coût de votre linge hôtelier : kits bain, kits lit, articles à l'unité. Tarifs transparents, livraison à Orange et dans les communes limitrophes. Devis immédiat.",
  alternates: { canonical: "https://lingeserein.fr/devis" },
  openGraph: {
    title: "Devis gratuit — Linge Serein",
    description:
      "Estimez le coût de votre linge hôtelier en 2 minutes. Tarifs transparents, livraison à Orange et communes limitrophes.",
    url: "https://lingeserein.fr/devis",
  },
};

export default function DevisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
