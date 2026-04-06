import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  outputFileTracingRoot: resolve(__dirname, "../../"),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
