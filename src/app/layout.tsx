import type { Metadata, Viewport } from "next";

import { APP_NAME, DISCLAIMER } from "@/lib/text";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `Find your way around campus. ${DISCLAIMER}.`,
  applicationName: APP_NAME,
  // Room numbers are not phone numbers.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Lets the map reach under the notch. The controls keep clear of it themselves.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111a2b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
