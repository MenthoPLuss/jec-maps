import { describe, expect, it } from "vitest";

import {
  boundsOf,
  centroidOf,
  containsPoint,
  distanceToAreaM,
  distanceToEdgeM,
  lineTouchesArea,
  type AreaGeometry,
} from "./area";
import { localPlane } from "./localPlane";
import { JEC_CENTRE, type LngLat } from "./types";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);
const box = (x1: number, y1: number, x2: number, y2: number): LngLat[] => [
  at(x1, y1),
  at(x2, y1),
  at(x2, y2),
  at(x1, y2),
  at(x1, y1),
];

const outline = box(0, 0, 100, 100);
const square: AreaGeometry = { type: "Polygon", coordinates: [outline] };
const withHole: AreaGeometry = { type: "Polygon", coordinates: [outline, box(40, 40, 60, 60)] };
const twoParts: AreaGeometry = {
  type: "MultiPolygon",
  coordinates: [[box(0, 0, 10, 10)], [box(50, 0, 60, 10)]],
};

describe("containsPoint", () => {
  it("knows inside from outside", () => {
    expect(containsPoint(square, at(50, 50))).toBe(true);
    expect(containsPoint(square, at(-1, 50))).toBe(false);
  });

  it("counts the edge as inside", () => {
    expect(containsPoint(square, outline[0])).toBe(true);
  });

  it("treats a hole as outside", () => {
    expect(containsPoint(withHole, at(50, 50))).toBe(false);
    expect(containsPoint(withHole, at(30, 50))).toBe(true);
  });

  it("handles several parts", () => {
    expect(containsPoint(twoParts, at(55, 5))).toBe(true);
    expect(containsPoint(twoParts, at(30, 5))).toBe(false);
  });
});

describe("distances", () => {
  it("measures to the outline from both sides", () => {
    expect(distanceToEdgeM(square, at(50, -30))).toBeCloseTo(30, 1);
    expect(distanceToEdgeM(square, at(50, 30))).toBeCloseTo(30, 1);
  });

  it("measures to a corner", () => {
    expect(distanceToEdgeM(square, at(-30, -40))).toBeCloseTo(50, 1);
  });

  it("measures to the edge of a hole", () => {
    expect(distanceToEdgeM(withHole, at(50, 50))).toBeCloseTo(10, 1);
    expect(distanceToAreaM(withHole, at(50, 50))).toBeCloseTo(10, 1);
  });

  it("is zero anywhere inside the area", () => {
    expect(distanceToAreaM(square, at(50, 30))).toBe(0);
  });

  it("stays sensible kilometres away", () => {
    expect(distanceToAreaM(square, at(2300, 50))).toBeCloseTo(2200, -1);
  });
});

describe("lineTouchesArea", () => {
  it.each([
    ["crosses it", -10, 110, 50, true],
    ["ends in it", -10, 50, 50, true],
    ["passes by", -10, 110, -10, false],
  ])("a horizontal line that %s", (_name, fromX, toX, y, expected) => {
    expect(lineTouchesArea(square, at(fromX, y), at(toX, y))).toBe(expected);
  });
});

describe("boundsOf and centroidOf", () => {
  it("finds the box and the middle", () => {
    const [west, south, east, north] = boundsOf(outline);
    expect([west, south]).toEqual(outline[0]);
    expect([east, north]).toEqual(outline[2]);

    const [x, y] = plane.toXY(centroidOf(square));
    expect(x).toBeCloseTo(50, 3);
    expect(y).toBeCloseTo(50, 3);
  });

  it("refuses an empty list", () => {
    expect(() => boundsOf([])).toThrow();
  });
});
