import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  outputFileTracingRoot: resolve(__dirname, "../../"),
  // @lingengo/shared is a compiled CJS workspace package — Next.js resolves it via
  // node_modules symlink (npm workspaces). transpilePackages not needed for compiled dist.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
