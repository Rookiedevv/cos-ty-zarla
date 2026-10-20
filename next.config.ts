import type { NextConfig } from "next";

// Cache Components are left off on purpose: every page here is personal and
// rendered per request behind a login, so there is no static shell to gain.
const nextConfig: NextConfig = {
  experimental: {
    // Meal photos are resized on the phone to ~150–400 KB before upload; 3 MB leaves headroom.
    serverActions: { bodySizeLimit: "3mb" },
    // Keep a visited screen for 30 s, so switching tabs back and forth is instant.
    // Every save goes through a server action that revalidates, so nothing shows stale after a change.
    staleTimes: { dynamic: 30 },
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
