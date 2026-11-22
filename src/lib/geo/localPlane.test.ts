import { describe, expect, it } from "vitest";

import { distanceM } from "./distance";
import { localPlane, projectOnSegment, segmentIntersection } from "./localPlane";
import { JEC_CENTRE, type XY } from "./types";

describe("localPlane", () => {
  const plane = localPlane(JEC_CENTRE);

  it("puts east on x and north on y", () => {
    const [x, y] = plane.toXY([JEC_CENTRE[0] + 0.001, JEC_CENTRE[1]]);

    expect(x).toBeCloseTo(99.3, 0);
    expect(y).toBeCloseTo(0, 6);
  });

  it("round-trips", () => {
    const [lng, lat] = plane.toLngLat(plane.toXY([94.2531, 26.7442]));

    expect(lng).toBeCloseTo(94.2531, 9);
    expect(lat).toBeCloseTo(26.7442, 9);
  });

  it("agrees with the haversine distance to within a centimetre at 300 m", () => {
    const point = plane.toLngLat([180, -240]);

    expect(Math.abs(distanceM(JEC_CENTRE, point) - 300)).toBeLessThan(0.01);
  });
});

describe("projectOnSegment", () => {
  it("projects onto the middle", () => {
    expect(projectOnSegment([5, 3], [0, 0], [10, 0])).toEqual({ point: [5, 0], t: 0.5, distanceM: 3 });
  });

  it("stops at the ends", () => {
    expect(projectOnSegment([-4, 3], [0, 0], [10, 0])).toEqual({ point: [0, 0], t: 0, distanceM: 5 });
    expect(projectOnSegment([14, 3], [0, 0], [10, 0]).t).toBe(1);
  });

  it("survives a segment without length", () => {
    expect(projectOnSegment([3, 4], [0, 0], [0, 0])).toEqual({ point: [0, 0], t: 0, distanceM: 5 });
  });
});

describe("segmentIntersection", () => {
  it("finds a crossing", () => {
    expect(segmentIntersection([0, -5], [0, 5], [-5, 0], [5, 0])).toEqual([0, 0]);
  });

  it("finds a touching end", () => {
    expect(segmentIntersection([0, 0], [0, 5], [-5, 0], [5, 0])).toEqual([0, 0]);
  });

  it.each<[string, XY, XY, XY, XY]>([
    ["apart", [0, 1], [0, 5], [-5, 0], [5, 0]],
    ["parallel", [0, 0], [10, 0], [0, 1], [10, 1]],
    ["on the same line", [0, 0], [10, 0], [5, 0], [15, 0]],
  ])("returns null when %s", (_name, a, b, c, d) => {
    expect(segmentIntersection(a, b, c, d)).toBeNull();
  });
});
