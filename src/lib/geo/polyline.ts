import { bearingDeg, distanceM } from "./distance";
import { localPlane, projectOnSegment, segmentIntersection } from "./localPlane";
import type { LngLat } from "./types";

/** Total length in metres. */
export function polylineLengthM(line: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += distanceM(line[i - 1], line[i]);
  return total;
}

export interface PolylinePoint {
  /** The closest point on the line. */
  point: LngLat;
  /** Metres from the start of the line to that point. */
  alongM: number;
  /** Metres from the query point to the line. */
  distanceM: number;
  /** Index of the segment the point is on. */
  segment: number;
}

/**
 * The point on the line that is closest to `point`.
 *
 * `range` limits the search to a stretch of the line. A walker on a route that
 * crosses itself must not jump to a much later part of it.
 */
export function nearestOnPolyline(
  line: LngLat[],
  point: LngLat,
  range: { fromM: number; toM: number } = { fromM: 0, toM: Infinity },
): PolylinePoint | null {
  if (line.length < 2) return null;

  const plane = localPlane(point);
  let best: PolylinePoint | null = null;
  let startM = 0;

  for (let i = 1; i < line.length; i++) {
    const lengthM = distanceM(line[i - 1], line[i]);
    const endM = startM + lengthM;

    if (endM >= range.fromM && startM <= range.toM) {
      const a = plane.toXY(line[i - 1]);
      const b = plane.toXY(line[i]);
      let { point: xy, t, distanceM: d } = projectOnSegment([0, 0], a, b);

      // Keep the answer inside the requested stretch.
      if (lengthM > 0) {
        const tMin = Math.max(0, (range.fromM - startM) / lengthM);
        const tMax = Math.min(1, (range.toM - startM) / lengthM);
        const clamped = Math.min(tMax, Math.max(tMin, t));
        if (clamped !== t) {
          t = clamped;
          xy = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
          d = Math.hypot(xy[0], xy[1]);
        }
      }

      if (!best || d < best.distanceM - 1e-9) {
        best = {
          point: plane.toLngLat(xy),
          alongM: startM + t * lengthM,
          distanceM: d,
          segment: i - 1,
        };
      }
    }
    startM = endM;
  }

  return best;
}

/** The point `alongM` metres from the start, and the direction of travel there. */
export function pointAlong(line: LngLat[], alongM: number): { point: LngLat; bearing: number } {
  let startM = 0;
  for (let i = 1; i < line.length; i++) {
    const lengthM = distanceM(line[i - 1], line[i]);
    if (lengthM > 0 && (startM + lengthM >= alongM || i === line.length - 1)) {
      const t = Math.min(1, Math.max(0, (alongM - startM) / lengthM));
      return { point: mix(line[i - 1], line[i], t), bearing: bearingDeg(line[i - 1], line[i]) };
    }
    startM += lengthM;
  }
  return { point: line[line.length - 1], bearing: 0 };
}

/** The part of the line between two distances from its start. */
export function slicePolyline(line: LngLat[], fromM: number, toM: number): LngLat[] {
  const total = polylineLengthM(line);
  const from = Math.max(0, Math.min(fromM, total));
  const to = Math.max(from, Math.min(toM, total));
  const result: LngLat[] = [pointAlong(line, from).point];

  let alongM = 0;
  for (let i = 1; i < line.length; i++) {
    alongM += distanceM(line[i - 1], line[i]);
    if (alongM > from + 1e-9 && alongM < to - 1e-9) result.push(line[i]);
  }

  result.push(pointAlong(line, to).point);
  return result;
}

/** Every point where two lines cross each other. */
export function polylineCrossings(a: LngLat[], b: LngLat[]): LngLat[] {
  if (a.length === 0 || b.length === 0) return [];

  const plane = localPlane(a[0]);
  const ax = a.map(plane.toXY);
  const bx = b.map(plane.toXY);
  const crossings: LngLat[] = [];

  for (let i = 1; i < ax.length; i++) {
    for (let j = 1; j < bx.length; j++) {
      const hit = segmentIntersection(ax[i - 1], ax[i], bx[j - 1], bx[j]);
      if (hit) crossings.push(plane.toLngLat(hit));
    }
  }
  return crossings;
}

function mix(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
