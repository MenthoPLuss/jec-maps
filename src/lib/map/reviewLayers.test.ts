import { validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";

import { localStyle } from "./basemap";
import { EMPTY } from "./registry";
import { PICK_LAYERS, REVIEW_SOURCES, reviewLayers } from "./reviewLayers";

describe("reviewLayers", () => {
  const look = (theme: "light" | "dark") => ({ theme, fonts: ["Arial"], indoors: false, still: false });

  it.each(["light", "dark"] as const)("is a valid MapLibre style (%s)", (theme) => {
    const sources = Object.fromEntries(REVIEW_SOURCES.map((id) => [id, { type: "geojson", data: EMPTY }]));
    const style = { ...localStyle(theme), sources, layers: [...localStyle(theme).layers, ...reviewLayers(look(theme))] };

    expect(validateStyleMin(style as StyleSpecification)).toEqual([]);
  });

  it("has unique ids, the same for both themes, including every layer a click can pick", () => {
    const ids = reviewLayers(look("light")).map((layer) => layer.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(reviewLayers(look("dark")).map((layer) => layer.id)).toEqual(ids);
    expect(ids).toEqual(expect.arrayContaining(PICK_LAYERS));
  });
});
