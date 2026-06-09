/**
 * Test data helpers for Linge Serein vitrine QA
 */

export function uniqueEmail(): string {
  return `test.${Date.now()}@qa.example.com`;
}

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3002";

/** All pages that should be accessible */
export const ALL_PAGES = [
  { name: "Accueil", url: "/" },
  { name: "Devis", url: "/devis" },
  { name: "CGV", url: "/cgv" },
  { name: "CGPS", url: "/cgps" },
  { name: "Mentions légales", url: "/mentions-legales" },
  { name: "Politique de confidentialité", url: "/politique-confidentialite" },
  { name: "Zone de livraison", url: "/zone-de-livraison" },
];

/** Navbar anchor links */
export const NAVBAR_LINKS = [
  { href: "#services", label: "Services" },
  { href: "#fonctionnement", label: "Comment ça marche" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];
