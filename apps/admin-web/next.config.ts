import type { NextConfig } from "next";
import { resolve } from "path";

const enProduction = process.env.NODE_ENV === "production";

// L'API locale n'a rien à faire dans la CSP servie en production : c'est une
// origine EN CLAIR, et l'y laisser autorise la page d'administration à parler à
// n'importe quel service qui écouterait sur le port 3001 du poste de l'admin.
const originesApi = enProduction
  ? ["https://api.lingeserein.fr", "https://api.stripe.com"]
  : ["http://localhost:3001", "https://api.lingeserein.fr", "https://api.stripe.com"];

const nextConfig: NextConfig = {
  // Docker prod : serveur autonome (.next/standalone), cf. apps/admin-web/Dockerfile
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, "../../"),
  transpilePackages: ["@lingengo/shared", "@lingengo/ui"],
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // HSTS — il manquait ici, et ICI SEULEMENT : `api.lingeserein.fr`
        // (helmet) et les autres domaines du serveur l'envoient déjà. Sans lui,
        // la toute première visite en `http://` reste interceptable, et c'est
        // le domaine qui porte les sessions d'administration. `preload` est
        // volontairement omis : l'inscription sur la liste des navigateurs est
        // difficile à défaire et engage tous les sous-domaines.
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        {
          // La génération de PDF (@react-pdf/renderer) impose deux ouvertures,
          // sans quoi elle échoue EN SILENCE (promesse jamais résolue, bouton mort) :
          //   - worker-src 'self' blob: → pour embarquer une image PNG, @react-pdf
          //     décode les pixels dans un Web Worker créé depuis un blob:. Sans
          //     worker-src explicite, la CSP retombe sur script-src, qui n'autorise
          //     pas blob: → « Creating a worker from 'blob:…' violates … ».
          //   - connect-src … data: → le décodeur charge son module WebAssembly
          //     depuis une data: URI via fetch → « Fetch API cannot load data:… ».
          // Les deux ressources sont générées localement par la page elle-même,
          // elles n'élargissent pas la surface à des origines tierces.
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; font-src 'self'; frame-ancestors 'none'; " +
            "base-uri 'self'; form-action 'self'; object-src 'none'; " +
            `connect-src 'self' data: blob: ${originesApi.join(" ")};`,
        },
      ],
    },
  ],
};

export default nextConfig;
