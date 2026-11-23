/** Public settings. They are fixed when the app is built: see `.env.example`. */

export interface AppConfig {
  /** "local" loads nothing from other sites. "online" asks the visitor first. */
  basemapMode: "local" | "online";
  /** A MapLibre style, or a raster template with {z}, {x} and {y}. */
  tileUrl: string;
  tileAttribution: string;
  /** True when this build may use the fake GPS and the demo tools. */
  demoEnabled: boolean;
  /** Start with the fake GPS without `?mock=1`. */
  mockByDefault: boolean;
}

const DEFAULT_TILE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_TILE_ATTRIBUTION = "© OpenStreetMap contributors";

export interface RawConfig {
  basemapMode?: string;
  tileUrl?: string;
  tileAttribution?: string;
  enableDemo?: string;
  mockLocation?: string;
}

export function readConfig(raw: RawConfig): AppConfig {
  const tileUrl = raw.tileUrl?.trim() || DEFAULT_TILE_URL;
  const demoEnabled = raw.enableDemo === "1";

  return {
    // An address we can't trust turns the online map off instead of half-working.
    basemapMode: raw.basemapMode === "online" && isSafeTileUrl(tileUrl) ? "online" : "local",
    tileUrl,
    tileAttribution: raw.tileAttribution?.trim() || DEFAULT_TILE_ATTRIBUTION,
    demoEnabled,
    mockByDefault: demoEnabled && raw.mockLocation === "1",
  };
}

/** The fake GPS needs a demo build. In a normal build `?mock=1` does nothing. */
export function isMockRequested(config: AppConfig, params: { get(name: string): string | null }): boolean {
  return config.demoEnabled && (config.mockByDefault || params.get("mock") === "1");
}

/** The place editor is a demo tool too. */
export function isEditorRequested(config: AppConfig, params: { get(name: string): string | null }): boolean {
  return config.demoEnabled && params.get("edit") === "1";
}

/**
 * The review page (/review) is a tool for the people who collect the data. It runs
 * with `npm run dev` and in demo builds, and is "not found" in a normal build.
 */
export function isReviewToolAvailable(config: AppConfig, nodeEnv: string | undefined): boolean {
  return config.demoEnabled || nodeEnv === "development";
}

/** Only https, or a server on this computer. */
export function isSafeTileUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

// Next.js replaces each of these with its value while building, so every name has
// to be written out in full.
export const config: AppConfig = readConfig({
  basemapMode: process.env.NEXT_PUBLIC_BASEMAP_MODE,
  tileUrl: process.env.NEXT_PUBLIC_TILE_URL,
  tileAttribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION,
  enableDemo: process.env.NEXT_PUBLIC_ENABLE_DEMO,
  mockLocation: process.env.NEXT_PUBLIC_MOCK_LOCATION,
});
