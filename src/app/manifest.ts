import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coś ty żarła",
    short_name: "Żarła",
    description: "Calories, fasting and a weekly weigh-in for two.",
    start_url: "/",
    display: "standalone",
    background_color: "#dcebe3",
    theme_color: "#dcebe3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
