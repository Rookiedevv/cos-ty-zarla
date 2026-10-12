import type { NextConfig } from "next";

// Cache Components are left off on purpose: every page here is personal and
// rendered per request behind a login, so there is no static shell to gain.
const nextConfig: NextConfig = {
  // Meal photos are resized on the phone to ~150–400 KB before upload; 3 MB leaves headroom.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
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
