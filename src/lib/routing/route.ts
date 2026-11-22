/** Walking routes outdoors: snap both ends, search, and describe the result. */
import type { AreaGeometry } from "../geo/area";
import { distanceM } from "../geo/distance";
import { polylineLengthM, slicePolyline } from "../geo/polyline";
import type { LngLat } from "../geo/types";
import { POLICY } from "../state/policy";
import { findPath } from "./astar";
import { addEdge, pathEdge, type Edge, type Graph } from "./graph";
import { snapToPaths, type Snap } from "./snap";

export interface EntranceOption {
  entranceId: string;
  /** The junction of the path network at the door. */
  nodeId: string;
  position: LngLat;
  accessUnknown: boolean;
}

export type RouteTarget =
  | { kind: "point"; position: LngLat }
  /** A building: whichever door is the shortest walk. */
  | { kind: "entrances"; position: LngLat; options: EntranceOption[] };

export interface RouteRequest {
  origin: LngLat;
  target: RouteTarget;
  avoidSteps: boolean;
}

export interface RouteLeg {
  /** False: a direction across unknown ground, not a way that anyone checked. */
  verified: boolean;
  steps: boolean;
  coordinates: LngLat[];
  lengthM: number;
}

export interface Route {
  legs: RouteLeg[];
  /** All legs as one line. */
  line: LngLat[];
  totalM: number;
  unverifiedM: number;
  /** Where the route ends: the pin, or the door. */
  end: LngLat;
  entranceId: string | null;
  accessUnknown: boolean;
}

/**
 * - `no-network`: there are no usable paths at all.
 * - `origin-off-network` / `target-off-network`: too far from any path.
 * - `no-entrance`: no accessible door of that building is known.
 * - `not-connected`: no usable path joins the two.
 * - `only-steps`: there is a way, but not without stairs.
 */
export type NoRouteReason =
  | "no-network"
  | "origin-off-network"
  | "target-off-network"
  | "no-entrance"
  | "not-connected"
  | "only-steps";

export type RouteResult =
  | { ok: true; route: Route }
  | { ok: false; reason: NoRouteReason; straightLineM: number };

const ORIGIN = "\u0000origin";
const TARGET = "\u0000target";

export function findRoute(graph: Graph, obstacles: readonly AreaGeometry[], request: RouteRequest): RouteResult {
  const result = search(graph, obstacles, request);
  if (result.ok || !request.avoidSteps) return result;

  // Say it plainly when stairs are the only way. Never use them silently.
  const withSteps = search(graph, obstacles, { ...request, avoidSteps: false });
  return withSteps.ok ? { ...result, reason: "only-steps" } : result;
}

function search(graph: Graph, obstacles: readonly AreaGeometry[], request: RouteRequest): RouteResult {
  // Join the nearest path. Another one further away would often be shorter, but only
  // by crossing a lawn or a fence that nobody has checked.
  const nearest = searchFrom(graph, obstacles, request, true);
  if (nearest.ok || nearest.reason !== "not-connected") return nearest;
  return searchFrom(graph, obstacles, request, false);
}

function searchFrom(
  graph: Graph,
  obstacles: readonly AreaGeometry[],
  request: RouteRequest,
  nearestOnly: boolean,
): RouteResult {
  const { origin, target, avoidSteps } = request;
  const fail = (reason: NoRouteReason): RouteResult => ({
    ok: false,
    reason,
    straightLineM: distanceM(origin, target.position),
  });
  if (graph.paths.length === 0) return fail("no-network");
  if (target.kind === "entrances" && target.options.length === 0) return fail("no-entrance");

  const options = { maxM: POLICY.route.snapM, avoidSteps, obstacles };
  const snap = (point: LngLat): Snap[] => {
    const snaps = snapToPaths(graph, point, options);
    return nearestOnly ? snaps.filter(({ gapM }) => gapM <= snaps[0].gapM + POLICY.route.sameSpotM) : snaps;
  };
  const starts = snap(origin);
  if (starts.length === 0) return fail("origin-off-network");

  // Everything below lives in its own map: the shared graph is never touched.
  const extra = new Map<string, Edge[]>();
  const startNode = (i: number) => `\u0000start${i}`;
  const endNode = (i: number) => `\u0000end${i}`;

  starts.forEach((start, i) => {
    addEdge(extra, gapEdge(ORIGIN, startNode(i), origin, start.point));
    leavePath(extra, start, startNode(i));
  });

  if (target.kind === "entrances") {
    let reachable = false;
    for (const { nodeId, position } of target.options) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;
      reachable = true;
      // The last step from the junction to the door itself. It was reviewed with the door.
      addEdge(extra, { ...gapEdge(nodeId, TARGET, node, position), cost: distanceM(node, position), verified: true });
    }
    if (!reachable) return fail("no-entrance");
  } else {
    const ends = snap(target.position);
    if (ends.length === 0) return fail("target-off-network");
    ends.forEach((end, i) => {
      joinPath(extra, end, endNode(i));
      addEdge(extra, gapEdge(endNode(i), TARGET, end.point, target.position));
      starts.forEach((start, j) => {
        if (start.path.id === end.path.id) alongSamePath(extra, start, end, startNode(j), endNode(i));
      });
    });
  }

  const positions = new Map<string, LngLat>([[ORIGIN, origin]]);
  const goals = target.kind === "entrances" ? target.options.map((option) => option.position) : [target.position];
  const remaining = (node: string): number => {
    const position = positions.get(node) ?? graph.nodes.get(node);
    if (!position) return 0;
    // A hair less than the straight line, so rounding can't make it too much.
    return Math.min(...goals.map((goal) => distanceM(position, goal))) * 0.999;
  };
  const edgesFrom = function* (node: string): Generator<Edge> {
    for (const edge of graph.edges.get(node) ?? []) if (!(avoidSteps && edge.steps)) yield edge;
    yield* extra.get(node) ?? [];
  };

  const edges = findPath(ORIGIN, TARGET, edgesFrom, remaining);
  if (!edges) return fail("not-connected");
  return { ok: true, route: describe(edges, target) };
}

// --- Temporary edges ---------------------------------------------------------

function gapEdge(from: string, to: string, a: LngLat, b: LngLat): Edge {
  const lengthM = distanceM(a, b);
  return {
    from,
    to,
    cost: lengthM * POLICY.route.approachPenalty,
    lengthM,
    coordinates: [a, b],
    pathId: null,
    steps: false,
    verified: false,
  };
}

/** From a spot on a path to its two ends. */
function leavePath(extra: Map<string, Edge[]>, { path, alongM }: Snap, node: string): void {
  if (path.forward) addEdge(extra, pathEdge(path, node, path.to, slicePolyline(path.coordinates, alongM, path.lengthM)));
  if (path.backward) addEdge(extra, pathEdge(path, node, path.from, slicePolyline(path.coordinates, 0, alongM).reverse()));
}

/** From the two ends of a path to a spot on it. */
function joinPath(extra: Map<string, Edge[]>, { path, alongM }: Snap, node: string): void {
  if (path.forward) addEdge(extra, pathEdge(path, path.from, node, slicePolyline(path.coordinates, 0, alongM)));
  if (path.backward) {
    addEdge(extra, pathEdge(path, path.to, node, slicePolyline(path.coordinates, alongM, path.lengthM).reverse()));
  }
}

/** Both ends on one path: straight along it, if that direction is allowed. */
function alongSamePath(extra: Map<string, Edge[]>, start: Snap, end: Snap, from: string, to: string): void {
  const { path } = start;
  if (end.alongM >= start.alongM && path.forward) {
    addEdge(extra, pathEdge(path, from, to, slicePolyline(path.coordinates, start.alongM, end.alongM)));
  } else if (end.alongM < start.alongM && path.backward) {
    addEdge(extra, pathEdge(path, from, to, slicePolyline(path.coordinates, end.alongM, start.alongM).reverse()));
  }
}

// --- The result --------------------------------------------------------------

function describe(edges: Edge[], target: RouteTarget): Route {
  const legs: RouteLeg[] = [];
  for (const edge of edges) {
    if (edge.lengthM < 0.01) continue;
    const last = legs.at(-1);
    if (last && last.verified === edge.verified && last.steps === edge.steps) {
      last.coordinates = joinLines(last.coordinates, edge.coordinates);
      last.lengthM += edge.lengthM;
    } else {
      legs.push({ verified: edge.verified, steps: edge.steps, coordinates: [...edge.coordinates], lengthM: edge.lengthM });
    }
  }

  const line = legs.reduce<LngLat[]>((all, leg) => joinLines(all, leg.coordinates), []);
  const lastEdge = edges[edges.length - 1];
  const entrance =
    target.kind === "entrances" ? target.options.find((option) => option.nodeId === lastEdge.from) : undefined;

  return {
    legs,
    line,
    totalM: line.length > 1 ? polylineLengthM(line) : 0,
    unverifiedM: legs.reduce((sum, leg) => sum + (leg.verified ? 0 : leg.lengthM), 0),
    end: entrance?.position ?? target.position,
    entranceId: entrance?.entranceId ?? null,
    accessUnknown: entrance?.accessUnknown ?? false,
  };
}

function joinLines(a: LngLat[], b: LngLat[]): LngLat[] {
  if (a.length === 0) return [...b];
  return distanceM(a[a.length - 1], b[0]) < 0.01 ? [...a, ...b.slice(1)] : [...a, ...b];
}
