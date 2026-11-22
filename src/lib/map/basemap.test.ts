import { describe, expect, it } from "vitest";

import { readConfig } from "../config";
import { DEVICE_FONTS, isRasterTemplate, labelFonts, localStyle, onlineStyle, providerName } from "./basemap";

describe("localStyle", () => {
  it.each(["light", "dark"] as const)("never refers to another site (%s)", (theme) => {
    expect(JSON.stringify(localStyle(theme))).not.toMatch(/https?:|\/\//);
    expect(localStyle(theme)).not.toHaveProperty("glyphs");
    expect(localStyle(theme)).not.toHaveProperty("sprite");
  });
});

describe("onlineStyle", () => {
  it("passes a style address through", () => {
    const config = readConfig({ basemapMode: "online", tileUrl: "https://maps.example.com/style.json" });
    expect(onlineStyle(config)).toBe("https://maps.example.com/style.json");
  });

  it("wraps a raster template and keeps the credit line", () => {
    const tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    const style = onlineStyle(readConfig({ basemapMode: "online", tileUrl }));

    expect(style).toMatchObject({
      sources: { "basemap-tiles": { type: "raster", tiles: [tileUrl], attribution: "© OpenStreetMap contributors" } },
    });
  });
});

describe("isRasterTemplate", () => {
  it("needs all three placeholders", () => {
    expect(isRasterTemplate("https://a/{z}/{x}/{y}.png")).toBe(true);
    expect(isRasterTemplate("https://a/{z}/{x}.png")).toBe(false);
    expect(isRasterTemplate("https://a/style.json")).toBe(false);
  });
});

describe("providerName", () => {
  it("names the site that receives the requests", () => {
    expect(providerName(readConfig({}))).toBe("tiles.openfreemap.org");
  });
});

describe("labelFonts", () => {
  it("uses the device's fonts when the style ships none", () => {
    expect(labelFonts(localStyle("light"))).toEqual(DEVICE_FONTS);
  });

  it("reuses a font that the provider's style ships", () => {
    expect(
      labelFonts({
        glyphs: "https://a/{fontstack}/{range}.pbf",
        layers: [
          { id: "a", type: "symbol", source: "s", layout: { "text-font": ["step", ["zoom"], "x"] as never } },
          { id: "b", type: "symbol", source: "s", layout: { "text-font": ["Noto Sans Regular"] } },
        ],
      }),
    ).toEqual(["Noto Sans Regular"]);
  });
});
