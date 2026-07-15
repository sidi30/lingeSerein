import type { Metadata } from "next";

// Outil interne (génération de contrat) — non indexé.
export const metadata: Metadata = {
  title: "Contrat Pack Sérénité — Linge Serein",
  robots: { index: false, follow: false },
};

export default function ContratLayout({ children }: { children: React.ReactNode }) {
  return children;
}
