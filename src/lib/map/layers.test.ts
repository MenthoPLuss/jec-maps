import { validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";

import { published } from "../data/testing";
import { localStyle } from "./basemap";
import { findJourney } from "../routing/journey";
import { buildGraph } from "../routing/graph";
import { routeTarget } from "../state/destination";
import { accuracyCircle, appLayers, indoorPlan, indoorRoute, staticMapData } from "./layers";
import { EMPTY } from "./registry";

describe("appLayers", () => {
  it.each(["light", "dark"] as const)("is a valid MapLibre style (%s)", (theme) => {
    const layers = appLayers({ theme, fonts: ["Arial"], indoors: theme === "dark", still: theme === "dark" });
    const sources = Object.fromEntries(
      layers.flatMap((layer) => ("source" in layer ? [[layer.source as string, { type: "geojson", data: EMPTY }]] : [])),
    );
    const style = { ...localStyle(theme), sources, layers: [...localStyle(theme).layers, ...layers] };

    expect(validateStyleMin(style as StyleSpecification)).toEqual([]);
  });

  it("has unique layer ids, the same for both themes", () => {
    const ids = (theme: "light" | "dark") =>
      appLayers({ theme, fonts: ["Arial"], indoors: theme === "dark", still: false }).map((layer) => layer.id);

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

describe("indoor data", () => {
  const { core, indoor } = published();
  const [plans] = indoor;

  it("draws one floor with labels and marks the chosen room", () => {
    const { rooms, lines, points } = indoorPlan(plans, 1, core.rooms, "demo-a-102", null);
    const chosen = rooms.features.filter((feature) => feature.properties?.chosen);

    expect(rooms.features).toHaveLength(9); // 7 rooms, stairs and lift
    expect(chosen.map((feature) => feature.properties?.id)).toEqual(["demo-a-102"]);
    expect(rooms.features.map((feature) => feature.properties?.label)).toContain("A-102");
    expect(lines.features).toHaveLength(5);
    expect(points.features.length).toBeGreaterThan(7);
  });

  it("is empty for a floor without a plan", () => {
    const { rooms, lines, points } = indoorPlan(plans, 7, core.rooms, null, null);
    expect([rooms, lines, points].every((collection) => collection.features.length === 0)).toBe(true);
  });

  it("separates the floor that is shown from the others, and marks where it changes", () => {
    const destination = { kind: "room", id: "demo-a-102" } as const;
    const result = findJourney(
      { dataset: core, graph: buildGraph(core), obstacles: [], plans: new Map([[plans.buildingId, plans]]) },
      { origin: { kind: "position", position: [94.2506399, 26.745] }, target: routeTarget(core, destination)!, targetRoomId: destination.id, avoidSteps: false },
    );
    if (!result.ok) throw new Error(result.reason);
    const ground = indoorRoute([result.route.enter], 0, (level) => `Floor ${level}`);

    expect(ground.features.filter((feature) => feature.properties?.kind === "line").map((feature) => feature.properties?.current)).toEqual([true, false]);
    expect(ground.features.find((feature) => feature.properties?.kind === "change")?.properties).toMatchObject({ label: "↑ Floor 1" });
    const upstairs = indoorRoute([result.route.enter], 1, (level) => `Floor ${level}`);
    expect(upstairs.features.find((feature) => feature.properties?.kind === "change")?.properties).toMatchObject({ label: "↓ Floor 0" });
  });
});
