import type { StyleSpecification } from "maplibre-gl";

import type { AppConfig } from "../config";
import { MAP_THEMES, type ThemeName } from "./theme";

/**
 * A plain background and nothing else. It has no tiles, sprites or glyphs, so it
 * never talks to another site: MapLibre draws the labels with the device's fonts.
 */
export function localStyle(theme: ThemeName): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": MAP_THEMES[theme].background },
      },
    ],
  };
}

/** The street map of a provider. Only used after the visitor has agreed. */
export function onlineStyle(config: AppConfig): StyleSpecification | string {
  if (!isRasterTemplate(config.tileUrl)) return config.tileUrl;

  return {
    version: 8,
    sources: {
      "basemap-tiles": {
        type: "raster",
        tiles: [config.tileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution: config.tileAttribution,
      },
    },
    layers: [{ id: "basemap-tiles", type: "raster", source: "basemap-tiles" }],
  };
}

export function isRasterTemplate(url: string): boolean {
  return url.includes("{z}") && url.includes("{x}") && url.includes("{y}");
}

/** Who receives the map requests: shown to the visitor before they agree. */
export function providerName(config: AppConfig): string {
  try {
    return new URL(config.tileUrl).host;
  } catch {
    return "the map provider";
  }
}

/** Fonts that every device has. */
export const DEVICE_FONTS = ["Arial", "sans-serif"];

/**
 * The fonts for our own labels. A provider's style can only draw the fonts that it
 * ships, so reuse one of its own there.
 */
export function labelFonts(style: Pick<StyleSpecification, "glyphs" | "layers">): string[] {
  if (!style.glyphs) return DEVICE_FONTS;

  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const fonts: unknown = layer.layout?.["text-font"];
    if (Array.isArray(fonts) && fonts.length > 0 && fonts.every((font) => typeof font === "string")) {
      return fonts;
    }
  }
  return DEVICE_FONTS;
}
