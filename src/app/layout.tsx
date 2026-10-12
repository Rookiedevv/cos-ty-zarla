import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coś ty żarła",
  description: "Calories, fasting and a weekly weigh-in for two.",
  appleWebApp: { capable: true, title: "Coś ty żarła", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111316",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
