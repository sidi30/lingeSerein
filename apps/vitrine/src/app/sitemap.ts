import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = "https://lingeserein.fr";

// Images de contenu de l'accueil → extension Google Image Sitemap (<image:image>).
// Logos/icônes exclus (boilerplate ignoré par Google Images).
const homeImages = [
  `${base}/site/hero-principal.webp`,
  `${base}/site/livraison-hotel.webp`,
  `${base}/site/livraison-linge.webp`,
  `${base}/site/livraison-voiture.webp`,
  `${base}/site/pack-linge.webp`,
  `${base}/site/lit-provencal.webp`,
  `${base}/site/pub-vitrine.webp`,
  `${base}/images/og_image_1200x630.png`,
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1,
      images: homeImages,
    },
    { url: `${base}/devis`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    {
      url: `${base}/zone-de-livraison`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${base}/mentions-legales`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    { url: `${base}/cgv`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/cgps`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    {
      url: `${base}/politique-confidentialite`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
