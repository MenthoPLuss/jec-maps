/** Turns a checked dataset into the files that the app downloads. */
import { boundsOf, ringsOf } from "../geo/area";
import { JEC_CENTRE, type LngLat } from "../geo/types";
import { SCHEMA_VERSION } from "./constants";
import { coverageOf, isTrusted } from "./coverage";
import type { Dataset } from "./parse";
import type { IndoorPlans, PublishedDataset } from "./published";

/** A little room around the campus when there is nothing else to frame. */
const EMPTY_FRAME_DEG = 0.004;

const keep = (record: { reviewStatus: string }) => record.reviewStatus !== "rejected";

export function publishDataset(dataset: Dataset): { core: PublishedDataset; indoor: IndoorPlans[] } {
  const coverage = coverageOf(dataset);
  const buildings = dataset.buildings.filter((building) => keep(building.properties));
  const buildingIds = new Set(buildings.map((building) => building.properties.id));
  const boundary = dataset.boundary && keep(dataset.boundary.properties) ? dataset.boundary : null;

  const indoor: IndoorPlans[] = [...buildingIds].sort().flatMap((buildingId) => {
    const levels = dataset.levels
      .filter((plan) => plan.buildingId === buildingId)
      .map(({ level, features }) => ({ level, features: features.filter((feature) => keep(feature.properties)) }))
      .sort((a, b) => a.level - b.level);
    return levels.length > 0 ? [{ buildingId, levels }] : [];
  });

  const core: PublishedDataset = {
    schemaVersion: SCHEMA_VERSION,
    datasetVersion: dataset.manifest.datasetVersion,
    mode: dataset.manifest.mode,
    title: dataset.manifest.title,
    attribution: dataset.manifest.attribution,
    bounds: frame(dataset),
    boundary,
    boundaryTrusted: boundary !== null && isTrusted(boundary.properties),
    buildings,
    entrances: dataset.entrances.filter(
      (entrance) => keep(entrance.properties) && buildingIds.has(entrance.properties.buildingId),
    ),
    places: dataset.places.filter((place) => keep(place.properties)),
    paths: dataset.paths.filter((path) => keep(path.properties)),
    routablePathIds: coverage.routablePathIds,
    rooms: dataset.rooms.filter((room) => keep(room) && buildingIds.has(room.buildingId)),
    indoorLevels: Object.fromEntries(indoor.map((plans) => [plans.buildingId, plans.levels.map((plan) => plan.level)])),
    live: coverage.live,
  };

  return { core, indoor };
}

function frame(dataset: Dataset): PublishedDataset["bounds"] {
  const points: LngLat[] = dataset.boundary
    ? ringsOf(dataset.boundary.geometry).flat()
    : dataset.buildings.flatMap((building) => ringsOf(building.geometry).flat());

  if (points.length > 0) return boundsOf(points);
  const [lng, lat] = JEC_CENTRE;
  return [lng - EMPTY_FRAME_DEG, lat - EMPTY_FRAME_DEG, lng + EMPTY_FRAME_DEG, lat + EMPTY_FRAME_DEG];
}
