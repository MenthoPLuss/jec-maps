import { validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";

import { published } from "../data/testing";
import { localStyle } from "./basemap";
import { accuracyCircle, appLayers, staticMapData } from "./layers";
import { EMPTY } from "./registry";

describe("appLayers", () => {
  it.each(["light", "dark"] as const)("is a valid MapLibre style (%s)", (theme) => {
    const layers = appLayers({ theme, fonts: ["Arial"] });
    const sources = Object.fromEntries(
      layers.flatMap((layer) => ("source" in layer ? [[layer.source as string, { type: "geojson", data: EMPTY }]] : [])),
    );
    const style = { ...localStyle(theme), sources, layers: [...localStyle(theme).layers, ...layers] };

    expect(validateStyleMin(style as StyleSpecification)).toEqual([]);
  });

  it("has unique layer ids, the same for both themes", () => {
    const ids = (theme: "light" | "dark") => appLayers({ theme, fonts: ["Arial"] }).map((layer) => layer.id);

    expect(new Set(ids("light")).size).toBe(ids("light").length);
    expect(ids("dark")).toEqual(ids("light"));
  });
});

describe("staticMapData", () => {
  const { core } = published();
  const data = staticMapData(core);

  it("draws everything in the dataset", () => {
    expect(data.campus.features).toHaveLength(1);
    expect(data.buildings.features).toHaveLength(3);
    expect(data.places.features).toHaveLength(core.places.length);
    expect(data.paths.features).toHaveLength(core.paths.length);
  });

  it("marks the paths that routes may use", () => {
    const usable = Object.fromEntries(data.paths.features.map(({ properties }) => [properties!.id, properties!.usable]));

    expect(usable["demo-gate-road"]).toBe(true);
    expect(usable["demo-service-road"]).toBe(false);
  });

  it("copes with a dataset without a boundary", () => {
    expect(staticMapData({ ...core, boundary: null }).campus.features).toEqual([]);
  });
});

describe("accuracyCircle", () => {
  it("is in metres: 10 m is about 37 pixels at zoom 18 in Jorhat", () => {
    const { radius } = accuracyCircle([94.25, 26.745], 10).features[0].properties as { radius: number };
    // 0.597 m per pixel at the equator, times cos(26.7 degrees), for 256 px tiles.
    const metresPerPixel = (0.5971642834779395 * Math.cos((26.745 * Math.PI) / 180)) / 2;

    expect(radius * 2 ** 18).toBeCloseTo(10 / metresPerPixel, 1);
  });
});
