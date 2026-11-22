import type { LngLat, XY } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Converts between degrees and a flat metre grid. */
export interface LocalPlane {
  toXY(point: LngLat): XY;
  toLngLat(point: XY): LngLat;
}

/**
 * A flat metre grid around `origin`: x points east, y points north.
 * Across a campus the error is a few millimetres, far below GPS accuracy.
 */
export function localPlane([lng0, lat0]: LngLat): LocalPlane {
  const metresPerDegLat = EARTH_RADIUS_M * RAD;
  const metresPerDegLng = metresPerDegLat * Math.cos(lat0 * RAD);

  return {
    toXY: ([lng, lat]) => [(lng - lng0) * metresPerDegLng, (lat - lat0) * metresPerDegLat],
    toLngLat: ([x, y]) => [lng0 + x / metresPerDegLng, lat0 + y / metresPerDegLat],
  };
}

export interface SegmentProjection {
  /** The closest point on the segment. */
  point: XY;
  /** 0 at the start of the segment, 1 at the end. */
  t: number;
  distanceM: number;
}

/** The point on segment a-b that is closest to p. */
export function projectOnSegment(p: XY, a: XY, b: XY): SegmentProjection {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  const point: XY = [a[0] + t * dx, a[1] + t * dy];

  return { point, t, distanceM: Math.hypot(p[0] - point[0], p[1] - point[1]) };
}

/**
 * Where segments a-b and c-d cross, or null when they don't. Segments that only
 * run along each other (parallel) count as not crossing.
 */
export function segmentIntersection(a: XY, b: XY, c: XY, d: XY): XY | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return null;

  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return [a[0] + t * rx, a[1] + t * ry];
}
