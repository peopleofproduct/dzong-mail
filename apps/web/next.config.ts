import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.6"],
  // Keep the dev-tools "N" bubble off the icon rail's settings button.
  devIndicators: { position: "bottom-right" },
  transpilePackages: ["@dzong/database", "@dzong/ai-engine", "@dzong/sync-engine"],
  experimental: {
    // Composer attachments upload through a server action (default cap is 1 MB).
    serverActions: { bodySizeLimit: "25mb" },
  },
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
