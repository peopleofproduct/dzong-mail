import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.6"],
  // Keep the dev-tools "N" bubble off the icon rail's settings button.
  devIndicators: { position: "bottom-right" },
  transpilePackages: ["@unwalled/database", "@unwalled/ai-engine", "@unwalled/sync-engine"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
