/** Every source and layer that the app draws itself. */
import type { AddLayerObject } from "maplibre-gl";

import type { PublishedDataset } from "../data/published";
import type { LngLat } from "../geo/types";
import type { Route } from "../routing/route";
import { LayerRegistry, type FeatureCollection, type LayerLook } from "./registry";
import { MAP_THEMES } from "./theme";

/** Drawn once, from the dataset. */
export type StaticSource = "campus" | "paths" | "buildings" | "entrances" | "places";
export type AppSource = StaticSource | "route" | "user";

const SOURCES: Record<AppSource, object> = {
  campus: {},
  paths: {},
  buildings: {},
  entrances: {},
  places: {},
  route: {},
  user: {},
};

export function createAppRegistry(onError?: (error: unknown) => void): LayerRegistry<AppSource> {
  return new LayerRegistry<AppSource>({ sources: SOURCES, layers: appLayers, onError });
}

/** Bottom to top. */
export function appLayers({ theme, fonts }: LayerLook): AddLayerObject[] {
  const colour = MAP_THEMES[theme];

  return [
    {
      id: "campus-fill",
      type: "fill",
      source: "campus",
      paint: { "fill-color": colour.campus, "fill-opacity": 0.9 },
    },
    {
      id: "campus-outline",
      type: "line",
      source: "campus",
      paint: { "line-color": colour.campusLine, "line-width": 1.5, "line-dasharray": [3, 2] },
    },
    {
      id: "paths-casing",
      type: "line",
      source: "paths",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colour.pathCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 6, 20, 16],
      },
    },
    {
      id: "paths-line",
      type: "line",
      source: "paths",
      filter: ["==", ["get", "usable"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colour.path,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 17, 4, 20, 12],
      },
    },
    {
      // Steps, so that they don't look like an ordinary path.
      id: "paths-steps",
      type: "line",
      source: "paths",
      filter: ["==", ["get", "kind"], "steps"],
      paint: {
        "line-color": colour.campusLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 17, 4, 20, 12],
        "line-dasharray": [0.3, 0.3],
      },
    },
    {
      id: "buildings-fill",
      type: "fill",
      source: "buildings",
      paint: { "fill-color": colour.building },
    },
    {
      id: "buildings-outline",
      type: "line",
      source: "buildings",
      paint: { "line-color": colour.buildingLine, "line-width": 1.2 },
    },
    {
      id: "user-accuracy",
      type: "circle",
      source: "user",
      paint: {
        // The radius in metres: it doubles with every zoom level, like the map itself.
        "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "radius"], 24, ["*", ["get", "radius"], 2 ** 24]],
        "circle-color": colour.user,
        "circle-opacity": 0.15,
        "circle-stroke-color": colour.user,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.5,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "route-casing",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "verified"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colour.routeCasing, "line-width": 9 },
    },
    {
      id: "route-line",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "verified"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colour.route, "line-width": 5 },
    },
    {
      id: "route-steps",
      type: "line",
      source: "route",
      filter: ["==", ["get", "steps"], true],
      paint: { "line-color": colour.routeCasing, "line-width": 5, "line-dasharray": [0.3, 0.6] },
    },
    {
      // Across ground that nobody has checked: never looks like a route.
      id: "route-unverified",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "unverified"],
      paint: { "line-color": colour.routeUnverified, "line-width": 4, "line-dasharray": [1.5, 1.2] },
    },
    {
      id: "route-straight",
      type: "line",
      source: "route",
      filter: ["==", ["get", "kind"], "straight"],
      layout: { "line-cap": "round" },
      paint: { "line-color": colour.routeUnverified, "line-width": 3, "line-dasharray": [0.1, 2] },
    },
    {
      id: "entrances-dot",
      type: "circle",
      source: "entrances",
      minzoom: 17,
      paint: {
        "circle-radius": 4,
        "circle-color": colour.labelHalo,
        "circle-stroke-color": colour.entrance,
        "circle-stroke-width": 2,
      },
    },
    {
      id: "places-dot",
      type: "circle",
      source: "places",
      minzoom: 15,
      filter: ["!=", ["get", "inBuilding"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 3, 18, 6],
        "circle-color": colour.place,
        "circle-stroke-color": colour.labelHalo,
        "circle-stroke-width": 1.5,
      },
    },
    {
      id: "places-label",
      type: "symbol",
      source: "places",
      minzoom: 16,
      filter: ["!=", ["get", "inBuilding"], true],
      layout: {
        "text-field": ["get", "name"],
        "text-font": fonts,
        "text-size": 12,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.8,
        "text-max-width": 8,
      },
      paint: { "text-color": colour.label, "text-halo-color": colour.labelHalo, "text-halo-width": 1.5 },
    },
    {
      id: "buildings-label",
      type: "symbol",
      source: "buildings",
      minzoom: 14.5,
      layout: {
        "text-field": ["get", "shortName"],
        "text-font": fonts,
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 11, 18, 15],
        "text-max-width": 7,
      },
      paint: { "text-color": colour.label, "text-halo-color": colour.labelHalo, "text-halo-width": 1.5 },
    },
  ];
}

/** The parts of the dataset that don't change while the app runs. */
export function staticMapData(dataset: PublishedDataset): Record<StaticSource, FeatureCollection> {
  const usable = new Set(dataset.routablePathIds);

  return {
    campus: collection(dataset.boundary ? [feature(dataset.boundary, { id: dataset.boundary.properties.id })] : []),
    paths: collection(
      dataset.paths.map((path) =>
        feature(path, { id: path.properties.id, kind: path.properties.kind, usable: usable.has(path.properties.id) }),
      ),
    ),
    buildings: collection(
      dataset.buildings.map((building) =>
        feature(building, { id: building.properties.id, shortName: building.properties.shortName }),
      ),
    ),
    entrances: collection(dataset.entrances.map((entrance) => feature(entrance, { id: entrance.properties.id }))),
    places: collection(
      dataset.places.map((place) =>
        feature(place, {
          id: place.properties.id,
          name: place.properties.name,
          inBuilding: place.properties.buildingId !== undefined,
        }),
      ),
    ),
  };
}

function feature(source: { geometry: unknown }, properties: Record<string, unknown>): GeoJSON.Feature {
  return { type: "Feature", geometry: source.geometry as GeoJSON.Geometry, properties };
}

function collection(features: GeoJSON.Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6_378_137;

/** The circle of uncertainty. `radius` is in pixels at zoom 0, as the layer expects. */
export function accuracyCircle([lng, lat]: LngLat, accuracyM: number): FeatureCollection {
  const metresPerPixel = (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 512;
  return collection([
    {
      type: "Feature",
      properties: { radius: accuracyM / metresPerPixel },
      geometry: { type: "Point", coordinates: [lng, lat] },
    },
  ]);
}

export function routeLines(route: Route): FeatureCollection {
  return collection(
    route.legs.map((leg) => ({
      type: "Feature",
      properties: { kind: leg.verified ? "verified" : "unverified", steps: leg.verified && leg.steps },
      geometry: { type: "LineString", coordinates: leg.coordinates },
    })),
  );
}

/** Only a direction: shown when there is no route. */
export function straightLine(from: LngLat, to: LngLat): FeatureCollection {
  return collection([
    { type: "Feature", properties: { kind: "straight" }, geometry: { type: "LineString", coordinates: [from, to] } },
  ]);
}
