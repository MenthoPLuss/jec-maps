/**
 * Turns an Overpass answer into review candidates.
 *
 * Everything that comes out is unreviewed. Paths keep their OpenStreetMap junctions
 * and access tags, so a person can judge them; none is ever used as it is.
 */
import type { Issue } from "../../src/lib/data/parse";
import { toKebabId } from "../../src/lib/data/ids";
import type { AreaGeometry } from "../../src/lib/geo/area";
import { distanceM } from "../../src/lib/geo/distance";
import type { LngLat } from "../../src/lib/geo/types";

interface OsmPoint {
  lat: number;
  lon: number;
}

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: (OsmPoint | null)[];
  members?: { type: string; ref: number; role: string; geometry?: (OsmPoint | null)[] }[];
}

export interface Candidate<Properties = Record<string, unknown>> {
  type: "Feature";
  properties: Properties & { id: string; osmId: string };
  geometry: AreaGeometry | { type: "LineString"; coordinates: LngLat[] };
}

export interface OsmCandidates {
  boundaries: Candidate[];
  buildings: Candidate[];
  paths: Candidate[];
  issues: Issue[];
}

const META = { source: "osm", placeholder: false, reviewStatus: "unreviewed" } as const;

/** Never walkable, or not there yet. */
const NOT_WALKABLE = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "raceway",
  "busway",
  "bus_guideway",
  "construction",
  "proposed",
  "abandoned",
  "razed",
]);
const FOOTWAYS = new Set(["footway", "path", "pedestrian", "cycleway", "track", "bridleway", "corridor"]);

export function osmToCandidates(answer: unknown): OsmCandidates {
  const elements = elementsOf(answer);
  const issues: Issue[] = [];

  const ways = byId(elements.filter((element) => element.type === "way"));
  const relations = byId(elements.filter((element) => element.type === "relation"));
  const barriers = new Map(
    elements
      .filter((element) => element.type === "node" && element.tags?.barrier)
      .map((element) => [element.id, element.tags as Record<string, string>]),
  );
  const areas = [...ways, ...relations];

  return {
    boundaries: toAreas(
      areas.filter((element) => /^(college|university)$/.test(element.tags?.amenity ?? "")),
      "boundary",
      issues,
      (element) => ({ name: element.tags?.name ?? "Unnamed campus" }),
    ),
    buildings: toAreas(
      areas.filter((element) => element.tags?.building && element.tags.building !== "no"),
      "building",
      issues,
      buildingProperties,
    ),
    paths: toPaths(
      ways.filter((way) => way.tags?.highway && !NOT_WALKABLE.has(way.tags.highway) && way.tags.area !== "yes"),
      barriers,
      issues,
    ),
    issues,
  };
}

// --- Areas -------------------------------------------------------------------

function toAreas(
  elements: OsmElement[],
  what: string,
  issues: Issue[],
  describe: (element: OsmElement) => Record<string, unknown>,
): Candidate[] {
  const used = new Map<string, number>();

  return elements.flatMap((element): Candidate[] => {
    const osmId = `${element.type}/${element.id}`;
    const geometry = areaOf(element);
    if (!geometry) {
      issues.push({ severity: "warning", file: "osm", record: osmId, field: "geometry", message: `this ${what} has a broken outline, so it was left out` });
      return [];
    }
    // Two buildings may share a name: the second one becomes "jec-workshop-2".
    const base = toKebabId(element.tags?.name ?? "") || `osm-${what}-${element.id}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return [
      {
        type: "Feature",
        properties: { id: count === 1 ? base : `${base}-${count}`, ...describe(element), ...META, osmId },
        geometry,
      },
    ];
  });
}

function buildingProperties({ tags = {} }: OsmElement): Record<string, unknown> {
  const name = tags.name ?? "Unnamed building";
  const floors = Number(tags["building:levels"]);
  const count = Number.isInteger(floors) && floors >= 1 && floors <= 40 ? floors : 1;

  return {
    name,
    shortName: tags.short_name ?? name,
    departments: [],
    levels: Array.from({ length: count }, (_, ordinal) => ({
      ordinal,
      name: ordinal === 0 ? "Ground floor" : `Floor ${ordinal}`,
    })),
    entranceIds: [],
  };
}

function areaOf(element: OsmElement): AreaGeometry | null {
  if (element.type === "way") {
    const ring = toLine(element.geometry);
    return ring && isRing(ring) ? { type: "Polygon", coordinates: [ring] } : null;
  }

  const lines = (role: string) =>
    (element.members ?? [])
      .filter((member) => member.type === "way" && (member.role || "outer") === role)
      .map((member) => toLine(member.geometry));
  const outer = joinRings(lines("outer"));
  const inner = joinRings(lines("inner"));
  if (!outer || outer.length === 0 || !inner) return null;

  if (outer.length === 1) return { type: "Polygon", coordinates: [outer[0], ...inner] };
  // With several outlines each hole goes to the one that contains it.
  const polygons = outer.map((ring) => [ring]);
  for (const hole of inner) {
    const home = polygons.find(([ring]) => ringContains(ring, hole[0]));
    if (!home) return null;
    home.push(hole);
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

/** Joins pieces of an outline end to end. Null when they don't close. */
export function joinRings(pieces: (LngLat[] | null)[]): LngLat[][] | null {
  if (pieces.some((piece) => piece === null)) return null;
  const open = (pieces as LngLat[][]).map((piece) => [...piece]);
  const rings: LngLat[][] = [];

  while (open.length > 0) {
    const ring = open.shift() as LngLat[];
    while (!isRing(ring)) {
      const end = ring[ring.length - 1];
      const next = open.findIndex((piece) => same(piece[0], end) || same(piece[piece.length - 1], end));
      if (next === -1) return null;
      const [piece] = open.splice(next, 1);
      if (!same(piece[0], end)) piece.reverse();
      ring.push(...piece.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

// --- Paths -------------------------------------------------------------------

function toPaths(ways: OsmElement[], barriers: Map<number, Record<string, string>>, issues: Issue[]): Candidate[] {
  // A node used by two ways is a junction in OpenStreetMap. Lines that merely
  // cross on the map, such as a bridge over a road, share no node.
  const uses = new Map<number, number>();
  for (const way of ways) {
    for (const node of new Set(way.nodes ?? [])) uses.set(node, (uses.get(node) ?? 0) + 1);
  }

  return ways.flatMap((way): Candidate[] => {
    const osmId = `way/${way.id}`;
    const line = toLine(way.geometry);
    const nodes = way.nodes ?? [];
    if (!line || line.length < 2 || nodes.length !== line.length) {
      issues.push({ severity: "warning", file: "osm", record: osmId, field: "geometry", message: "this path has a broken line, so it was left out" });
      return [];
    }

    const tags = way.tags ?? {};
    const repeated = new Set(nodes.filter((node, i) => nodes.indexOf(node) !== i));
    const cuts = nodes.flatMap((node, i) =>
      i === 0 || i === nodes.length - 1 || (uses.get(node) ?? 0) > 1 || repeated.has(node) ? [i] : [],
    );

    const pieces = cuts.slice(1).flatMap((to, i) => splitLoop(cuts[i], to, nodes));
    return pieces.flatMap(([from, to], index): Candidate[] => {
      const coordinates = line.slice(from, to + 1);
      if (coordinates.every((point) => distanceM(point, coordinates[0]) < 0.5)) return [];
      const gates = nodes.slice(from, to + 1).filter((node) => barriers.has(node));

      return [
        {
          type: "Feature",
          properties: {
            id: `osm-way-${way.id}-${index + 1}`,
            ...(tags.name && { name: tags.name }),
            fromNode: `osm-node-${nodes[from]}`,
            toNode: `osm-node-${nodes[to]}`,
            kind: tags.highway === "steps" ? "steps" : FOOTWAYS.has(tags.highway) ? "footway" : "road",
            access: accessOf(tags),
            direction: tags["oneway:foot"] === "yes" ? "forward" : tags["oneway:foot"] === "-1" ? "backward" : "both",
            layer: layerOf(tags),
            evidence: [
              `OpenStreetMap highway=${tags.highway}`,
              ...["access", "foot", "surface"].flatMap((key) => (tags[key] ? [`${key}=${tags[key]}`] : [])),
              ...gates.map((node) => `barrier=${barriers.get(node)?.barrier}`),
            ].join(", "),
            ...META,
            osmId,
          },
          geometry: { type: "LineString", coordinates },
        },
      ];
    });
  });
}

/** A piece that starts and ends at the same junction is cut in two: a path joins two junctions. */
function splitLoop(from: number, to: number, nodes: number[]): [number, number][] {
  if (nodes[from] !== nodes[to] || to - from < 2) return [[from, to]];
  const middle = from + Math.floor((to - from) / 2);
  return [
    [from, middle],
    [middle, to],
  ];
}

/** Says "public" only when a tag says so. Most paths have no such tag. */
function accessOf(tags: Record<string, string>): string {
  if (/^(yes|designated|permissive)$/.test(tags.foot ?? "")) return "public";
  if (/^(no|private)$/.test(tags.foot ?? "")) return "private";
  if (/^(no|private)$/.test(tags.access ?? "")) return "private";
  if (/^(customers|permit|destination|delivery)$/.test(tags.access ?? "")) return "restricted";
  if (/^(yes|permissive|public)$/.test(tags.access ?? "")) return "public";
  return "unknown";
}

function layerOf(tags: Record<string, string>): number {
  const layer = Number(tags.layer);
  if (tags.layer !== undefined && Number.isInteger(layer) && Math.abs(layer) <= 5) return layer;
  if (tags.bridge && tags.bridge !== "no") return 1;
  if (tags.tunnel && tags.tunnel !== "no") return -1;
  return 0;
}

// --- Helpers -----------------------------------------------------------------

function elementsOf(answer: unknown): OsmElement[] {
  const elements = (answer as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error("This is not an Overpass answer: it has no list of elements.");
  return elements as OsmElement[];
}

/** Sorted, and each object once, so the same answer always gives the same files. */
function byId(elements: OsmElement[]): OsmElement[] {
  return [...new Map(elements.map((element) => [element.id, element])).values()].sort((a, b) => a.id - b.id);
}

function toLine(geometry: (OsmPoint | null)[] | undefined): LngLat[] | null {
  if (!geometry || geometry.some((point) => point === null)) return null;
  return (geometry as OsmPoint[]).map(({ lon, lat }) => [lon, lat]);
}

const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];
const isRing = (line: LngLat[]) => line.length >= 4 && same(line[0], line[line.length - 1]);

function ringContains(ring: LngLat[], [x, y]: LngLat): boolean {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1];
    const [x2, y2] = ring[i];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
