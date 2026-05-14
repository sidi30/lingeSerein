import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/devis?admin=1"],
      },
    ],
    sitemap: "https://lingeserein.fr/sitemap.xml",
    host: "https://lingeserein.fr",
  };
}
