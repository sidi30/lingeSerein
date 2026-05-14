import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = "https://lingeserein.fr";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
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
    {
      url: `${base}/politique-confidentialite`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
