import type { MetadataRoute } from "next";

import { APP_NAME, DISCLAIMER } from "@/lib/text";

/** For "Add to Home Screen". There is no offline mode: the app needs the internet to start. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: `Find your way around campus. ${DISCLAIMER}.`,
    start_url: "/",
    display: "standalone",
    background_color: "#e6eaef",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
