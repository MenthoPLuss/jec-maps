import { describe, expect, it } from "vitest";

import { bearingDeg, destinationPoint, distanceM, normaliseDeg, turnDeg } from "./distance";
import { JEC_CENTRE, isLngLat, type LngLat } from "./types";

describe("distanceM", () => {
  it("is zero between a point and itself", () => {
    expect(distanceM(JEC_CENTRE, JEC_CENTRE)).toBe(0);
  });

  it("measures one degree of latitude as about 111.2 km", () => {
    expect(distanceM([94, 26], [94, 27])).toBeCloseTo(111_195, -1);
  });

  it("shrinks a degree of longitude with latitude, so swapped coordinates show up", () => {
    const east = distanceM(JEC_CENTRE, [JEC_CENTRE[0] + 0.001, JEC_CENTRE[1]]);
    const north = distanceM(JEC_CENTRE, [JEC_CENTRE[0], JEC_CENTRE[1] + 0.001]);

    expect(east).toBeCloseTo(99.3, 0);
    expect(north).toBeCloseTo(111.2, 0);
  });
});

describe("bearingDeg", () => {
  it.each<[string, LngLat, number]>([
    ["north", [94.25, 26.76], 0],
    ["east", [94.26, 26.75], 90],
    ["south", [94.25, 26.74], 180],
    ["west", [94.24, 26.75], 270],
  ])("points %s", (_name, to, expected) => {
    expect(Math.abs(turnDeg(expected, bearingDeg([94.25, 26.75], to)))).toBeLessThan(0.1);
  });
});

describe("destinationPoint", () => {
  it.each([0, 45, 137, 271])("travels the right distance at %d degrees", (bearing) => {
    const end = destinationPoint(JEC_CENTRE, bearing, 250);

    expect(distanceM(JEC_CENTRE, end)).toBeCloseTo(250, 3);
    expect(Math.abs(turnDeg(bearing, bearingDeg(JEC_CENTRE, end)))).toBeLessThan(0.01);
  });
});

describe("angles", () => {
  it.each([
    [0, 0],
    [360, 0],
    [-90, 270],
    [725, 5],
  ])("normalises %d to %d", (input, expected) => {
    expect(normaliseDeg(input)).toBe(expected);
  });

  it.each([
    [350, 10, 20],
    [10, 350, -20],
    [0, 180, 180],
    [90, 45, -45],
  ])("turns from %d to %d by %d", (from, to, expected) => {
    expect(turnDeg(from, to)).toBe(expected);
  });
});

describe("isLngLat", () => {
  it("accepts JEC", () => {
    expect(isLngLat(JEC_CENTRE)).toBe(true);
  });

  it.each([
    ["swapped JEC coordinates", [26.7458283, 94.2506399]],
    ["NaN", [NaN, 26]],
    ["infinity", [94, Infinity]],
    ["strings", ["94", "26"]],
    ["three numbers", [94, 26, 80]],
    ["nothing", null],
  ])("rejects %s", (_name, value) => {
    expect(isLngLat(value)).toBe(false);
  });
});
