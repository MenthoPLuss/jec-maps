/** The network of usable paths. It is built once and never changes. */
import type { PublishedDataset } from "../data/published";
import { polylineLengthM } from "../geo/polyline";
import type { LngLat } from "../geo/types";

export interface RoutePath {
  id: string;
  from: string;
  to: string;
  /** From `from` to `to`. */
  coordinates: LngLat[];
  lengthM: number;
  steps: boolean;
  /** Which way people may walk. */
  forward: boolean;
  backward: boolean;
}

export interface Edge {
  from: string;
  to: string;
  /** What the search adds up. At least as much as the real length. */
  cost: number;
  lengthM: number;
  coordinates: LngLat[];
  pathId: string | null;
  steps: boolean;
  /** False for the gap between a person (or a pin) and the nearest path. */
  verified: boolean;
}

export interface Graph {
  nodes: ReadonlyMap<string, LngLat>;
  paths: readonly RoutePath[];
  /** Edges by the node they start from. */
  edges: ReadonlyMap<string, readonly Edge[]>;
}

/** Only paths that the data checks allow, and only joined at shared junctions. */
export function buildGraph(dataset: Pick<PublishedDataset, "paths" | "routablePathIds">): Graph {
  const usable = new Set(dataset.routablePathIds);
  const nodes = new Map<string, LngLat>();
  const edges = new Map<string, Edge[]>();
  const paths: RoutePath[] = [];

  for (const { properties, geometry } of dataset.paths) {
    if (!usable.has(properties.id)) continue;
    const path: RoutePath = {
      id: properties.id,
      from: properties.fromNode,
      to: properties.toNode,
      coordinates: geometry.coordinates,
      lengthM: polylineLengthM(geometry.coordinates),
      steps: properties.kind === "steps",
      forward: properties.direction !== "backward",
      backward: properties.direction !== "forward",
    };
    paths.push(path);
    nodes.set(path.from, path.coordinates[0]);
    nodes.set(path.to, path.coordinates[path.coordinates.length - 1]);
    if (path.forward) addEdge(edges, pathEdge(path, path.from, path.to, path.coordinates));
    if (path.backward) addEdge(edges, pathEdge(path, path.to, path.from, [...path.coordinates].reverse()));
  }

  return { nodes, paths, edges };
}

export function pathEdge(path: RoutePath, from: string, to: string, coordinates: LngLat[]): Edge {
  const lengthM = polylineLengthM(coordinates);
  return { from, to, cost: lengthM, lengthM, coordinates, pathId: path.id, steps: path.steps, verified: true };
}

export function addEdge(edges: Map<string, Edge[]>, edge: Edge): void {
  const list = edges.get(edge.from);
  if (list) list.push(edge);
  else edges.set(edge.from, [edge]);
}
