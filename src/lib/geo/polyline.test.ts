import { describe, expect, it } from "vitest";

import { distanceM } from "./distance";
import { localPlane } from "./localPlane";
import { nearestOnPolyline, pointAlong, polylineCrossings, polylineLengthM, slicePolyline } from "./polyline";
import { JEC_CENTRE, type LngLat } from "./types";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);
// Back to metres, rounded to 10 cm. (`+ 0` turns -0 into 0.)
const xy = (point: LngLat): number[] => plane.toXY(point).map((v) => Math.round(v * 10) / 10 + 0);

// 100 m east, then 50 m north.
const corner = [at(0, 0), at(100, 0), at(100, 50)];

describe("polylineLengthM", () => {
  it("adds the segments", () => {
    expect(polylineLengthM(corner)).toBeCloseTo(150, 1);
  });

  it("is zero for a single point", () => {
    expect(polylineLengthM([at(0, 0)])).toBe(0);
  });
});

describe("nearestOnPolyline", () => {
  it("projects onto the closest segment", () => {
    const hit = nearestOnPolyline(corner, at(40, -8));

    expect(xy(hit!.point)).toEqual([40, 0]);
    expect(hit!.alongM).toBeCloseTo(40, 1);
    expect(hit!.distanceM).toBeCloseTo(8, 1);
    expect(hit!.segment).toBe(0);
  });

  it("measures along the whole line", () => {
    expect(nearestOnPolyline(corner, at(110, 30))!.alongM).toBeCloseTo(130, 1);
  });

  it("keeps to the requested stretch of a line that crosses itself", () => {
    const loop = [at(0, 0), at(100, 0), at(100, 100), at(50, 100), at(50, -50)];
    const nearCrossing = at(50, 0.5);

    expect(nearestOnPolyline(loop, nearCrossing, { fromM: 0, toM: 120 })!.alongM).toBeCloseTo(50, 0);
    expect(nearestOnPolyline(loop, nearCrossing, { fromM: 200, toM: 400 })!.alongM).toBeCloseTo(349.5, 0);
  });

  it("returns null for something that isn't a line", () => {
    expect(nearestOnPolyline([at(0, 0)], at(1, 1))).toBeNull();
  });
});

describe("pointAlong", () => {
  it("walks the line and reports the direction", () => {
    const { point, bearing } = pointAlong(corner, 120);

    expect(xy(point)).toEqual([100, 20]);
    expect(bearing).toBeCloseTo(0, 1);
  });

  it("stops at both ends", () => {
    expect(xy(pointAlong(corner, -5).point)).toEqual([0, 0]);
    expect(xy(pointAlong(corner, 999).point)).toEqual([100, 50]);
  });
});

describe("slicePolyline", () => {
  it("keeps the corners in between", () => {
    expect(slicePolyline(corner, 90, 110).map(xy)).toEqual([
      [90, 0],
      [100, 0],
      [100, 10],
    ]);
  });

  it("has the length that was asked for", () => {
    expect(polylineLengthM(slicePolyline(corner, 35, 140))).toBeCloseTo(105, 1);
  });

  it("clamps to the line", () => {
    const all = slicePolyline(corner, -50, 900);

    expect(distanceM(all[0], corner[0])).toBeLessThan(0.01);
    expect(distanceM(all.at(-1)!, corner[2])).toBeLessThan(0.01);
  });
});

describe("polylineCrossings", () => {
  it("finds a crossing in the middle of two lines", () => {
    const crossings = polylineCrossings(corner, [at(30, -20), at(30, 20)]);

    expect(crossings.map(xy)).toEqual([[30, 0]]);
  });

  it("finds nothing when they miss", () => {
    expect(polylineCrossings(corner, [at(30, 5), at(30, 20)])).toEqual([]);
  });
});
