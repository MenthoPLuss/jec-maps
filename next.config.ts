import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public settings are fixed while building, so the browser tests need several
  // builds side by side: see scripts/e2e-servers.mjs.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // We don't use next/image. Turning the optimizer off also removes its public
  // `/_next/image` endpoint, which has known security advisories.
  images: { unoptimized: true },

  // Pin the project root so a stray package-lock.json in a parent folder can't
  // confuse Turbopack. npm scripts always run from the folder of package.json.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
