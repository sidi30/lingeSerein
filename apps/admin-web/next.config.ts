import type { NextConfig } from "next";
import { resolve } from "path";

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
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: blob: http://localhost:3001 https://api.lingeserein.fr https://api.stripe.com;",
        },
      ],
    },
  ],
};

export default nextConfig;
