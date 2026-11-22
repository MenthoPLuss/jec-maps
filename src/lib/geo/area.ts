import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";

import { distanceM } from "./distance";
import { localPlane, projectOnSegment, segmentIntersection } from "./localPlane";
import type { LngLat } from "./types";

/** A polygon or multipolygon, with or without holes. */
export type AreaGeometry =
  | { type: "Polygon"; coordinates: LngLat[][] }
  | { type: "MultiPolygon"; coordinates: LngLat[][][] };

/** Every ring, outlines and holes alike. */
export function ringsOf(area: AreaGeometry): LngLat[][] {
  return area.type === "Polygon" ? area.coordinates : area.coordinates.flat();
}

/** True inside the area. The edge itself counts as inside; holes are outside. */
export function containsPoint(area: AreaGeometry, point: LngLat): boolean {
  return booleanPointInPolygon(point, area);
}

/** The closest point on the outline (or on the edge of a hole). */
export function nearestEdgePoint(area: AreaGeometry, point: LngLat): LngLat {
  const plane = localPlane(point);
  let best: LngLat | null = null;
  let bestM = Infinity;

  for (const ring of ringsOf(area)) {
    for (let i = 1; i < ring.length; i++) {
      const hit = projectOnSegment([0, 0], plane.toXY(ring[i - 1]), plane.toXY(ring[i]));
      if (hit.distanceM < bestM) {
        bestM = hit.distanceM;
        best = plane.toLngLat(hit.point);
      }
    }
  }

  if (!best) throw new Error("An area needs at least one ring");
  return best;
}

/** Metres to the outline, whichever side the point is on. Never negative. */
export function distanceToEdgeM(area: AreaGeometry, point: LngLat): number {
  return distanceM(point, nearestEdgePoint(area, point));
}

/** Metres from the area: 0 anywhere inside it. */
export function distanceToAreaM(area: AreaGeometry, point: LngLat): number {
  return containsPoint(area, point) ? 0 : distanceToEdgeM(area, point);
}

/** True when the straight line a-b touches the area anywhere. */
export function lineTouchesArea(area: AreaGeometry, a: LngLat, b: LngLat): boolean {
  if (containsPoint(area, a) || containsPoint(area, b)) return true;

  const plane = localPlane(a);
  const bx = plane.toXY(b);
  return ringsOf(area).some((ring) =>
    ring.some(
      (corner, i) =>
        i > 0 && segmentIntersection([0, 0], bx, plane.toXY(ring[i - 1]), plane.toXY(corner)) !== null,
    ),
  );
}

/** The smallest box around the points, as `[west, south, east, north]`. */
export function boundsOf(points: LngLat[]): [west: number, south: number, east: number, north: number] {
  if (points.length === 0) throw new Error("Cannot find the bounds of nothing");

  let [west, south] = points[0];
  let [east, north] = points[0];
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

/** The average of the outline's corners: a good place for a label on a simple shape. */
export function centroidOf(area: AreaGeometry): LngLat {
  const corners = ringsOf(area)[0].slice(0, -1);
  return [
    corners.reduce((sum, [lng]) => sum + lng, 0) / corners.length,
    corners.reduce((sum, [, lat]) => sum + lat, 0) / corners.length,
  ];
}
