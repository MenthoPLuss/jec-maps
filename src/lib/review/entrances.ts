/**
 * Placing entrances on the review page.
 *
 * An entrance sits on the outline of an approved building and opens onto a junction
 * of the approved paths. The page only proposes: the file it writes goes through
 * `npm run data:approve` like every other candidate.
 */
import { ENTRANCE_TOLERANCE_M } from "../data/constants";
import { isKebabId, toKebabId } from "../data/ids";
import type { BuildingFeature, EntranceFeature, PathFeature } from "../data/schemas";
import { distanceToEdgeM, nearestEdgePoint } from "../geo/area";
import { distanceM } from "../geo/distance";
import { isLngLat, type LngLat } from "../geo/types";

/** A click further than this from every wall is not a door. */
export const DOOR_REACH_M = 15;
/** Junctions further than this from the door are not offered. */
export const JUNCTION_REACH_M = 30;
/** A junction further than this from its door gets a warning from the data checks. */
export const JUNCTION_WARNING_M = ENTRANCE_TOLERANCE_M;

export const ENTRANCES_FILE = "entrances.candidates.geojson";

export interface DoorSpot {
  buildingId: string;
  /** On the outline of the building. */
  position: LngLat;
}

/** The point on the nearest wall, or null when the click is far from every building. */
export function doorSpot(buildings: BuildingFeature[], click: LngLat): DoorSpot | null {
  let best: { building: BuildingFeature; gap: number } | null = null;
  for (const building of buildings) {
    const gap = distanceToEdgeM(building.geometry, click);
    if (gap <= DOOR_REACH_M && (!best || gap < best.gap)) best = { building, gap };
  }
  if (!best) return null;

  const [lng, lat] = nearestEdgePoint(best.building.geometry, click);
  return { buildingId: best.building.properties.id, position: [round(lng), round(lat)] };
}

export interface Junction {
  nodeId: string;
  position: LngLat;
  distanceM: number;
}

/** Junctions of these paths near the door, the closest first. */
export function junctionsNear(paths: PathFeature[], door: LngLat, reach = JUNCTION_REACH_M): Junction[] {
  const found = new Map<string, Junction>();
  for (const { properties, geometry } of paths) {
    const ends: [string, LngLat | undefined][] = [
      [properties.fromNode, geometry.coordinates[0]],
      [properties.toNode, geometry.coordinates.at(-1)],
    ];
    for (const [nodeId, position] of ends) {
      if (!position || found.has(nodeId)) continue;
      const gap = distanceM(door, position);
      if (gap <= reach) found.set(nodeId, { nodeId, position, distanceM: Math.round(gap * 10) / 10 });
    }
  }
  return [...found.values()].sort((a, b) => a.distanceM - b.distanceM || a.nodeId.localeCompare(b.nodeId));
}

export type EntranceAccess = "public" | "restricted" | "closed" | "unknown";
export const ENTRANCE_ACCESS: EntranceAccess[] = ["public", "restricted", "closed", "unknown"];

export interface EntranceDraft {
  id: string;
  buildingId: string;
  name: string;
  level: number;
  access: EntranceAccess;
  outdoorNodeId: string;
  position: LngLat;
}

/** Such as jec-library-front-door. Never one that is taken. Empty without a usable name. */
export function entranceIdFor(buildingId: string, name: string, taken: ReadonlySet<string>): string {
  const own = toKebabId(name);
  if (!own) return "";
  const base = own.startsWith(`${buildingId}-`) ? own : `${buildingId}-${own}`;
  let id = base;
  for (let count = 2; taken.has(id); count++) id = `${base}-${count}`;
  return id;
}

export function entranceFeature(draft: EntranceDraft): EntranceFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: draft.position },
    properties: {
      id: draft.id,
      buildingId: draft.buildingId,
      level: draft.level,
      name: draft.name,
      access: draft.access,
      outdoorNodeId: draft.outdoorNodeId,
      source: "review page",
      placeholder: false,
      reviewStatus: "unreviewed",
    },
  };
}

/** The candidate file for `npm run data:approve`, one entrance per line. */
export function entrancesFileText(drafts: EntranceDraft[]): string {
  const lines = drafts.map((draft) => `    ${JSON.stringify(entranceFeature(draft))}`);
  const features = lines.length > 0 ? `[\n${lines.join(",\n")}\n  ]` : "[]";
  return `{\n  "type": "FeatureCollection",\n  "candidates": true,\n  "kind": "entrances",\n  "origin": "review page",\n  "features": ${features}\n}\n`;
}

/** For drafts kept in the browser: anything else is thrown away. */
export function isEntranceDraft(value: unknown): value is EntranceDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.id === "string" &&
    isKebabId(draft.id) &&
    typeof draft.buildingId === "string" &&
    isKebabId(draft.buildingId) &&
    typeof draft.name === "string" &&
    draft.name.trim() !== "" &&
    Number.isInteger(draft.level) &&
    ENTRANCE_ACCESS.includes(draft.access as EntranceAccess) &&
    typeof draft.outdoorNodeId === "string" &&
    isKebabId(draft.outdoorNodeId) &&
    isLngLat(draft.position)
  );
}

function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
