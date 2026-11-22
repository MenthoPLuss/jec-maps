/** Finds where a point can join the path network. */
import { containsPoint, lineTouchesArea, type AreaGeometry } from "../geo/area";
import { nearestOnPolyline } from "../geo/polyline";
import type { LngLat } from "../geo/types";
import type { Graph, RoutePath } from "./graph";

export interface Snap {
  path: RoutePath;
  /** The spot on the path. */
  point: LngLat;
  /** Metres from the start of the path. */
  alongM: number;
  /** Metres between the point and the path: unverified ground. */
  gapM: number;
}

export interface SnapOptions {
  maxM: number;
  avoidSteps: boolean;
  /** Buildings: the way to the path must not lead through one. */
  obstacles: readonly AreaGeometry[];
  limit?: number;
}

/** The nearest paths, closest first. Empty when none is close enough. */
export function snapToPaths(graph: Graph, point: LngLat, options: SnapOptions): Snap[] {
  // Inside a building (or with GPS a little off) its own wall can't be an obstacle.
  const obstacles = options.obstacles.filter((area) => !containsPoint(area, point));

  return graph.paths
    .filter((path) => !(options.avoidSteps && path.steps))
    .flatMap((path): Snap[] => {
      const hit = nearestOnPolyline(path.coordinates, point);
      if (!hit || hit.distanceM > options.maxM) return [];
      if (obstacles.some((area) => lineTouchesArea(area, point, hit.point))) return [];
      return [{ path, point: hit.point, alongM: hit.alongM, gapM: hit.distanceM }];
    })
    .sort((a, b) => a.gapM - b.gapM || (a.path.id < b.path.id ? -1 : 1))
    .slice(0, options.limit ?? 4);
}
