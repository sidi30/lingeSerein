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
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:3001 https://api.lingeserein.fr https://api.stripe.com;",
        },
      ],
    },
  ],
};

export default nextConfig;
