import { describe, expect, it } from "vitest";

import { formatBearing, formatDistance, formatDuration, ordinal } from "./format";

describe("formatDistance", () => {
  it.each([
    [-3, "0 m"],
    [0, "0 m"],
    [7.6, "8 m"],
    [43, "45 m"],
    [98, "100 m"],
    [104, "100 m"],
    [849, "850 m"],
    [994, "990 m"],
    [996, "1.0 km"],
    [1234, "1.2 km"],
    [9_940, "9.9 km"],
    [9_960, "10 km"],
    [23_400, "23 km"],
  ])("%d m: %s", (metres, text) => {
    expect(formatDistance(metres)).toBe(text);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "< 1 min"],
    [29, "< 1 min"],
    [31, "~1 min"],
    [239, "~4 min"],
    [3_600, "~1 h 0 min"],
    [4_200, "~1 h 10 min"],
  ])("%d s: %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("formatBearing", () => {
  it.each([
    [0, "north"],
    [44, "north-east"],
    [180, "south"],
    [350, "north"],
    [-90, "west"],
  ])("%d°: %s", (deg, text) => {
    expect(formatBearing(deg)).toBe(text);
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [112, "112th"],
  ])("%d: %s", (n, text) => {
    expect(ordinal(n)).toBe(text);
  });
});
