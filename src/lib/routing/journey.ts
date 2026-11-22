/**
 * Routes that begin or end in a room: corridors, stairs, lifts, doors and the paths
 * outside, in one network.
 *
 * Everything is measured in seconds here, and nothing is guessed: a floor is only
 * connected to another one where the data says so, and a room only where its door is.
 */
import { isTrusted } from "../data/coverage";
import type { IndoorPlans, PublishedDataset } from "../data/published";
import type { CorridorFeature, DoorFeature, VerticalFeature } from "../data/schemas";
import type { AreaGeometry } from "../geo/area";
import { distanceM } from "../geo/distance";
import { polylineLengthM } from "../geo/polyline";
import type { LngLat } from "../geo/types";
import { POLICY } from "../state/policy";
import { findPath } from "./astar";
import { addEdge, type Edge, type Graph } from "./graph";
import {
  alongSamePath,
  describeOutdoor,
  findRoute,
  gapEdge,
  joinPath,
  leavePath,
  type IndoorPath,
  type IndoorPiece,
  type NoRouteReason,
  type RouteResult,
  type RouteTarget,
} from "./route";
import { snapToPaths } from "./snap";

export type JourneyOrigin =
  | { kind: "position"; position: LngLat }
  /** The user said which room they are in. */
  | { kind: "room"; roomId: string }
  /** The user said which building they are in, and nothing more: any of its doors. */
  | { kind: "building"; buildingId: string };

export interface JourneyRequest {
  origin: JourneyOrigin;
  target: RouteTarget;
  /** The room, when the destination is one. */
  targetRoomId: string | null;
  avoidSteps: boolean;
}

export interface JourneyWorld {
  dataset: PublishedDataset;
  graph: Graph;
  obstacles: readonly AreaGeometry[];
  /** The floor plans that are downloaded so far. */
  plans: ReadonlyMap<string, IndoorPlans>;
}

interface JourneyEdge extends Edge {
  inside?: { buildingId: string; level: number };
  climb?: { kind: "stairs" | "lift"; toLevel: number; name: string };
}

const OUTSIDE_S_PER_M = 1 / POLICY.speed.defaultMps;
const INSIDE_S_PER_M = 1 / POLICY.speed.indoorMps;

const ORIGIN = "\u0000origin";
const TARGET = "\u0000target";
const START = "\u0000start";
const END = "\u0000end";
const inBuilding = (buildingId: string, node: string) => `\u0000in ${buildingId} ${node}`;
const roomNode = (roomId: string) => `\u0000room ${roomId}`;

export function findJourney(world: JourneyWorld, request: JourneyRequest): RouteResult {
  const { origin, target, targetRoomId, avoidSteps } = request;
  const room = world.dataset.rooms.find((candidate) => candidate.id === targetRoomId);

  if (room && hasDoor(world, room.id, room.buildingId)) {
    const direct = search(world, request, room.id, avoidSteps);
    if (direct.ok) return direct;

    // Say it plainly when stairs are the only way. Never use them silently.
    const onlySteps = avoidSteps && search(world, request, room.id, false).ok;
    if (onlySteps && origin.kind === "position") {
      // As far as it goes without stairs: to the door of the building.
      const toDoor = search(world, request, null, true);
      if (toDoor.ok) return { ok: true, route: { ...toDoor.route, indoorNote: "only-steps" } };
    }
    if (onlySteps) return { ...direct, reason: "only-steps" };
  }

  const result =
    origin.kind === "position"
      ? findRoute(world.graph, world.obstacles, { origin: origin.position, target, avoidSteps })
      : searchOrExplain(world, request, avoidSteps);
  // The way to the door is known, the way inside is not.
  if (result.ok && room) return { ok: true, route: { ...result.route, indoorNote: "no-plan" } };
  return result;
}

function searchOrExplain(world: JourneyWorld, request: JourneyRequest, avoidSteps: boolean): RouteResult {
  const result = search(world, request, null, avoidSteps);
  if (result.ok || !avoidSteps) return result;
  return search(world, request, null, false).ok ? { ...result, reason: "only-steps" } : result;
}

function search(world: JourneyWorld, request: JourneyRequest, roomId: string | null, avoidSteps: boolean): RouteResult {
  const { dataset, graph } = world;
  const { origin, target } = request;
  const extra = new Map<string, JourneyEdge[]>();
  const add = (edge: JourneyEdge) => addEdge(extra as Map<string, Edge[]>, edge);

  const from = originPosition(world, origin);
  const fail = (reason: NoRouteReason): RouteResult => ({
    ok: false,
    reason,
    straightLineM: from ? distanceM(from, target.position) : 0,
  });
  if (!from) return fail("origin-off-network");

  // --- Where it starts ---
  const snapOptions = { maxM: POLICY.route.snapM, avoidSteps, obstacles: world.obstacles };
  const start = origin.kind === "position" ? snapToPaths(graph, origin.position, snapOptions)[0] : undefined;
  const originBuilding = buildingOfOrigin(world, origin);

  if (origin.kind === "position") {
    if (!start) return fail("origin-off-network");
    add(inSeconds(gapEdge(ORIGIN, START, origin.position, start.point)));
    const outwards = new Map<string, Edge[]>();
    leavePath(outwards, start, START);
    for (const edge of outwards.get(START) ?? []) add(inSeconds(edge));
  } else if (origin.kind === "room" && hasDoor(world, origin.roomId, originBuilding ?? "")) {
    add(link(ORIGIN, roomNode(origin.roomId), from));
  } else {
    // Only the building is known: any of its doors may be the closest one.
    for (const entrance of usableEntrances(dataset, originBuilding)) {
      const position = entrance.geometry.coordinates;
      add(link(ORIGIN, entrance.properties.outdoorNodeId, position));
      const { indoorNodeId } = entrance.properties;
      if (indoorNodeId && originBuilding) add(link(ORIGIN, inBuilding(originBuilding, indoorNodeId), position));
    }
  }

  // --- Where it ends ---
  const targetBuilding = roomId ? dataset.rooms.find((room) => room.id === roomId)?.buildingId : undefined;
  if (roomId) {
    add(link(roomNode(roomId), TARGET, target.position));
  } else if (target.kind === "entrances") {
    if (target.options.length === 0) return fail("no-entrance");
    for (const { nodeId, position } of target.options) {
      const node = graph.nodes.get(nodeId);
      if (node) add({ ...inSeconds(gapEdge(nodeId, TARGET, node, position)), cost: distanceM(node, position) * OUTSIDE_S_PER_M, verified: true });
    }
  } else {
    const [end] = snapToPaths(graph, target.position, snapOptions);
    if (!end) return fail("target-off-network");
    const inwards = new Map<string, Edge[]>();
    joinPath(inwards, end, END);
    if (start && start.path.id === end.path.id) alongSamePath(inwards, start, end, START, END);
    for (const edges of inwards.values()) for (const edge of edges) add(inSeconds(edge));
    add(inSeconds(gapEdge(END, TARGET, end.point, target.position)));
  }

  // --- Inside ---
  for (const buildingId of new Set([originBuilding, targetBuilding])) {
    if (buildingId) addBuilding(world, buildingId, avoidSteps, add);
  }

  const edgesFrom = function* (node: string): Generator<JourneyEdge> {
    for (const edge of graph.edges.get(node) ?? []) if (!(avoidSteps && edge.steps)) yield inSeconds(edge);
    yield* extra.get(node) ?? [];
  };
  // No straight line is a safe bound on stairs and lifts, so there is no heuristic.
  const edges = findPath(ORIGIN, TARGET, edgesFrom, () => 0);
  return edges ? { ok: true, route: describe(edges, target, originBuilding, targetBuilding ?? null) } : fail("not-connected");
}

// --- The inside of a building ------------------------------------------------

function addBuilding(world: JourneyWorld, buildingId: string, avoidSteps: boolean, add: (edge: JourneyEdge) => void): void {
  const { dataset } = world;
  const plans = world.plans.get(buildingId);
  if (!plans) return;
  const usable = (record: { placeholder: boolean; reviewStatus: string }) => dataset.mode === "demo" || isTrusted(record);
  const nodes = new Map<string, LngLat>();

  for (const { features, level } of plans.levels) {
    const inside = { buildingId, level };
    for (const feature of features) {
      if (feature.properties.featureType !== "corridor" || !usable(feature.properties)) continue;
      const { access, fromNode, toNode } = feature.properties;
      const { coordinates } = (feature as CorridorFeature).geometry;
      nodes.set(fromNode, coordinates[0]);
      nodes.set(toNode, coordinates[coordinates.length - 1]);
      if (access === "restricted") continue;
      add(walk(inBuilding(buildingId, fromNode), inBuilding(buildingId, toNode), coordinates, inside));
      add(walk(inBuilding(buildingId, toNode), inBuilding(buildingId, fromNode), [...coordinates].reverse(), inside));
    }
  }

  for (const { features, level } of plans.levels) {
    const inside = { buildingId, level };
    for (const feature of features) {
      if (feature.properties.featureType === "door" && usable(feature.properties)) {
        const { nodeId, roomId } = feature.properties;
        const node = nodes.get(nodeId);
        const door = (feature as DoorFeature).geometry.coordinates;
        if (!node) continue;
        add(walk(inBuilding(buildingId, nodeId), roomNode(roomId), [node, door], inside));
        add(walk(roomNode(roomId), inBuilding(buildingId, nodeId), [door, node], inside));
      }
      if (feature.properties.featureType === "vertical" && usable(feature.properties)) {
        const { connects, kind, name, nodeId } = feature.properties;
        if (avoidSteps && kind === "stairs") continue;
        const position = (feature as VerticalFeature).geometry.coordinates;
        for (const { level: toLevel, nodeId: toNode } of connects) {
          const floors = Math.abs(toLevel - level);
          add({
            ...link(inBuilding(buildingId, nodeId), inBuilding(buildingId, toNode), position),
            cost: kind === "stairs" ? floors * POLICY.indoor.stairsPerFloorS : POLICY.indoor.liftWaitS + floors * POLICY.indoor.liftPerFloorS,
            inside,
            climb: { kind, toLevel, name: name ?? (kind === "stairs" ? "the stairs" : "the lift") },
          });
        }
      }
    }
  }

  for (const { geometry, properties } of usableEntrances(dataset, buildingId)) {
    const inner = properties.indoorNodeId;
    const outer = world.graph.nodes.get(properties.outdoorNodeId);
    if (!inner || !outer || !nodes.has(inner)) continue;
    const coordinates = [outer, geometry.coordinates, nodes.get(inner) as LngLat];
    const inside = { buildingId, level: properties.level };
    add(walk(properties.outdoorNodeId, inBuilding(buildingId, inner), coordinates, inside));
    add(walk(inBuilding(buildingId, inner), properties.outdoorNodeId, [...coordinates].reverse(), inside));
  }
}

function usableEntrances(dataset: PublishedDataset, buildingId: string | null): PublishedDataset["entrances"] {
  return dataset.entrances.filter(
    ({ properties }) =>
      properties.buildingId === buildingId &&
      properties.access === "public" &&
      (dataset.mode === "demo" || isTrusted(properties)),
  );
}

function hasDoor(world: JourneyWorld, roomId: string, buildingId: string): boolean {
  return (
    world.plans
      .get(buildingId)
      ?.levels.some(({ features }) =>
        features.some(({ properties }) => properties.featureType === "door" && properties.roomId === roomId),
      ) ?? false
  );
}

// --- Edges -------------------------------------------------------------------

const inSeconds = (edge: Edge): JourneyEdge => ({ ...edge, cost: edge.cost * OUTSIDE_S_PER_M });

function walk(from: string, to: string, coordinates: LngLat[], inside: JourneyEdge["inside"]): JourneyEdge {
  const lengthM = polylineLengthM(coordinates);
  return { from, to, cost: lengthM * INSIDE_S_PER_M, lengthM, coordinates, pathId: null, steps: false, verified: true, inside };
}

/** Costs nothing: two names for the same spot. */
function link(from: string, to: string, position: LngLat): JourneyEdge {
  return { from, to, cost: 0, lengthM: 0, coordinates: [position, position], pathId: null, steps: false, verified: true };
}

// --- Origins -----------------------------------------------------------------

function buildingOfOrigin({ dataset }: JourneyWorld, origin: JourneyOrigin): string | null {
  if (origin.kind === "building") return origin.buildingId;
  if (origin.kind === "room") return dataset.rooms.find((room) => room.id === origin.roomId)?.buildingId ?? null;
  return null;
}

function originPosition(world: JourneyWorld, origin: JourneyOrigin): LngLat | null {
  if (origin.kind === "position") return origin.position;
  const buildingId = buildingOfOrigin(world, origin);
  const entrance = usableEntrances(world.dataset, buildingId)[0];
  if (entrance) return entrance.geometry.coordinates;
  const building = world.dataset.buildings.find(({ properties }) => properties.id === buildingId);
  if (!building) return null;
  return building.geometry.type === "Polygon" ? building.geometry.coordinates[0][0] : building.geometry.coordinates[0][0][0];
}

// --- The result --------------------------------------------------------------

function describe(edges: JourneyEdge[], target: RouteTarget, originBuilding: string | null, targetBuilding: string | null) {
  const firstOutside = edges.findIndex((edge) => !edge.inside && edge.lengthM > 0);
  const outside = edges.filter((edge) => !edge.inside && edge.lengthM > 0);
  const before = firstOutside === -1 ? [] : edges.slice(0, firstOutside).filter((edge) => edge.inside);
  const after = edges.slice(Math.max(0, firstOutside)).filter((edge) => edge.inside);

  const route = describeOutdoor(outside, target);
  const enter = targetBuilding && after.length > 0 ? indoorPath(after, targetBuilding) : null;
  const exit = originBuilding && before.length > 0 ? indoorPath(before, originBuilding) : null;
  const door = enter?.pieces.find((piece) => piece.kind === "walk");

  return {
    ...route,
    // The outdoor part of a journey to a room ends where the indoor part begins.
    end: enter ? (route.line.at(-1) ?? (door?.kind === "walk" ? door.coordinates[0] : route.end)) : route.end,
    exit,
    enter,
  };
}

function indoorPath(edges: JourneyEdge[], buildingId: string): IndoorPath {
  const pieces: IndoorPiece[] = [];
  let seconds = 0;
  let lengthM = 0;

  for (const edge of edges) {
    const inside = edge.inside as { buildingId: string; level: number };
    seconds += edge.cost;
    lengthM += edge.lengthM;
    if (edge.climb) {
      const { kind, name, toLevel } = edge.climb;
      pieces.push({ kind, level: inside.level, toLevel, name, position: edge.coordinates[0], seconds: edge.cost });
      continue;
    }
    const last = pieces.at(-1);
    const nodes = [plainNode(edge.from), plainNode(edge.to)];
    if (last?.kind === "walk" && last.level === inside.level) {
      last.coordinates.push(...edge.coordinates.slice(1));
      last.lengthM += edge.lengthM;
      last.nodes.push(nodes[1]);
    } else {
      pieces.push({ kind: "walk", level: inside.level, coordinates: [...edge.coordinates], lengthM: edge.lengthM, nodes });
    }
  }
  return { buildingId, pieces, lengthM, seconds };
}

/** The id of a junction as it is in the data. */
const plainNode = (node: string) => node.slice(node.lastIndexOf(" ") + 1).replaceAll("\u0000", "");
