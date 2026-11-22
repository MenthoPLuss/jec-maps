import type { AddLayerObject } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY, LayerRegistry, type FeatureCollection, type LayerHost, type LayerLook } from "./registry";

/** A stand-in for the map that remembers what it was told. */
class FakeMap implements LayerHost {
  sources = new Map<string, { data: unknown; setData: (data: FeatureCollection) => Promise<void> }>();
  layers: AddLayerObject[] = [];
  paint: [string, string, unknown][] = [];
  setDataCalls = 0;

  getSource = (id: string) => this.sources.get(id);
  getLayer = (id: string) => this.layers.find((layer) => layer.id === id);

  addSource(id: string, source: { data: unknown }) {
    if (this.sources.has(id)) throw new Error(`source ${id} already exists`);
    const entry = {
      data: source.data,
      setData: async (data: FeatureCollection) => {
        this.setDataCalls++;
        entry.data = data;
      },
    };
    this.sources.set(id, entry);
  }

  addLayer(layer: AddLayerObject) {
    if (this.getLayer(layer.id)) throw new Error(`layer ${layer.id} already exists`);
    this.layers.push(layer);
  }

  setPaintProperty(layer: string, name: string, value: unknown) {
    this.paint.push([layer, name, value]);
  }

  /** What a new style or a restarted graphics card does. */
  wipe() {
    this.sources.clear();
    this.layers = [];
  }
}

const pointAt = (lng: number): FeatureCollection => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, 26] } }],
});

function createRegistry(onError?: (error: unknown) => void) {
  return new LayerRegistry<"places" | "route">({
    sources: { places: {}, route: {} },
    layers: ({ theme }) => [
      { id: "route-line", type: "line", source: "route", paint: { "line-color": theme === "dark" ? "#fff" : "#000" } },
      { id: "place-dot", type: "circle", source: "places", paint: { "circle-color": theme === "dark" ? "#0f0" : "#080" } },
    ],
    onError,
  });
}

const look: LayerLook = { theme: "light", fonts: ["Arial"], indoors: false, still: false };

let map: FakeMap;

beforeEach(() => {
  map = new FakeMap();
});

describe("LayerRegistry", () => {
  it("adds every source and layer, bottom to top", () => {
    createRegistry().attach(map, look);

    expect([...map.sources.keys()]).toEqual(["places", "route"]);
    expect(map.layers.map((layer) => layer.id)).toEqual(["route-line", "place-dot"]);
    expect(map.sources.get("places")!.data).toBe(EMPTY);
  });

  it("can be attached again without adding anything twice", () => {
    const registry = createRegistry();
    registry.attach(map, look);

    expect(() => registry.attach(map, look)).not.toThrow();
    expect(map.layers).toHaveLength(2);
  });

  it("updates data in place: it never adds the layer again", () => {
    const registry = createRegistry();
    registry.attach(map, look);
    const addLayer = vi.spyOn(map, "addLayer");
    registry.setData("places", pointAt(94.1));
    registry.setData("places", pointAt(94.2));

    expect(map.sources.get("places")!.data).toEqual(pointAt(94.2));
    expect(map.setDataCalls).toBe(2);
    expect(addLayer).not.toHaveBeenCalled();
  });

  it("uses data that arrived before the map was ready", () => {
    const registry = createRegistry();
    registry.setData("places", pointAt(94.3));
    registry.attach(map, look);

    expect(map.sources.get("places")!.data).toEqual(pointAt(94.3));
  });

  it("restores the current data after the style was replaced", () => {
    const registry = createRegistry();
    registry.attach(map, look);
    registry.setData("places", pointAt(94.4));

    registry.detach();
    map.wipe();
    registry.setData("route", pointAt(94.5)); // arrives while there is no style
    registry.attach(map, look);

    expect(map.sources.get("places")!.data).toEqual(pointAt(94.4));
    expect(map.sources.get("route")!.data).toEqual(pointAt(94.5));
    expect(map.layers).toHaveLength(2);
  });

  it("puts back a single missing layer", () => {
    const registry = createRegistry();
    registry.attach(map, look);
    map.layers = map.layers.filter((layer) => layer.id !== "route-line");
    registry.attach(map, look);

    expect(map.layers.map((layer) => layer.id).sort()).toEqual(["place-dot", "route-line"]);
  });

  it("recolours without adding layers or touching data", () => {
    const registry = createRegistry();
    registry.attach(map, look);
    registry.setLook({ theme: "dark" });

    expect(map.paint).toEqual([
      ["route-line", "line-color", "#fff"],
      ["place-dot", "circle-color", "#0f0"],
    ]);
    expect(map.layers).toHaveLength(2);
    expect(map.setDataCalls).toBe(0);
  });

  it("ignores a theme change that changes nothing", () => {
    const registry = createRegistry();
    registry.attach(map, look);
    registry.setLook({ theme: "light" });

    expect(map.paint).toEqual([]);
  });

  it("reports data that the map refuses, without an unhandled rejection", async () => {
    const onError = vi.fn();
    const registry = createRegistry(onError);
    registry.attach(map, look);
    map.sources.get("places")!.setData = () => Promise.reject(new Error("worker gone"));
    registry.setData("places", pointAt(94.6));
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledOnce();
    expect(registry.current("places")).toEqual(pointAt(94.6)); // kept for the next attach
  });
});
