import { describe, expect, it } from "vitest";

import { published, reviewedFiles } from "../data/testing";
import { approvedMatcher, itemsOf, parseCandidates, positionsOf, type CandidateFile } from "./candidates";

const collection = (kind: string, features: object[]) =>
  JSON.stringify({ type: "FeatureCollection", candidates: true, kind, origin: "test", features });

const building = (id: string, name: string, osmId?: string) => ({
  type: "Feature",
  properties: { id, name, levels: [{ ordinal: 0, name: "Ground floor" }], ...(osmId && { osmId }) },
  geometry: { type: "Polygon", coordinates: [[[94.25, 26.745], [94.251, 26.745], [94.251, 26.746], [94.25, 26.745]]] },
});

describe("parseCandidates", () => {
  it("reads a candidate file, with or without a byte order mark", () => {
    const text = collection("buildings", [building("jec-library", "JEC Library")]);

    for (const version of [text, `﻿${text}`]) {
      const file = parseCandidates(version, "buildings.candidates.geojson");
      expect(file).toMatchObject({ kind: "buildings", provenance: { origin: "test" } });
      expect(file.records).toHaveLength(1);
    }
  });

  it.each([
    ["not JSON", "{", "is not a candidate file: it is not valid JSON"],
    ["approved data", JSON.stringify({ type: "FeatureCollection", features: [] }), "is not a candidate file"],
    ["an unknown kind", collection("spaceships", []), "is not a candidate file"],
    ["a list", "[]", "is not a candidate file"],
  ])("refuses %s", (_, text, message) => {
    expect(() => parseCandidates(text, "x.geojson")).toThrow(`x.geojson ${message}`);
  });
});

describe("itemsOf", () => {
  const items = (kind: CandidateFile["kind"], records: object[]) => itemsOf({ kind, provenance: {}, records });

  it("says when a building has no name yet", () => {
    const [named, unnamed] = items("buildings", [building("a", "JEC Library"), building("b", "Unnamed building")]);

    expect(named).toMatchObject({ id: "a", title: "JEC Library", detail: "building, 1 level", notApprovable: null });
    expect(unnamed.detail).toContain("no name on the map yet");
  });

  it("gives a path its kind and length, and keeps its junctions", () => {
    const [path] = items("paths", [
      {
        type: "Feature",
        properties: { id: "osm-way-1-1", kind: "footway", fromNode: "osm-node-1", toNode: "osm-node-2" },
        geometry: { type: "LineString", coordinates: [[94.25, 26.745], [94.2501, 26.745]] },
      },
    ]);

    expect(path).toMatchObject({ title: "Footway", detail: "footway, 10 m", nodes: ["osm-node-1", "osm-node-2"] });
  });

  it("shows recorded walks and photo positions, but never as something to approve", () => {
    const [walk] = items("paths", [
      {
        type: "Feature",
        properties: { id: "gpx-morning-1", fromNode: "", toNode: "" },
        geometry: { type: "LineString", coordinates: [[94.25, 26.745], [94.2501, 26.745]] },
      },
    ]);
    const [photo] = items("entrance-suggestions", [
      { buildingId: "jec-library", photo: "IMG_1.jpg", coordinates: [94.25, 26.745], claimedAccuracyM: 6 },
    ]);

    expect(walk.notApprovable).toMatch(/recorded walk/);
    expect(photo).toMatchObject({ id: "jec-library/IMG_1.jpg", geometry: { type: "Point" }, detail: "jec-library, the phone said ±6 m" });
    expect(photo.notApprovable).toMatch(/hint/);
  });

  it("lists rooms without a position", () => {
    const [room] = items("rooms", [{ id: "a-102", buildingId: "block-a", level: 1, roomNumber: "A-102", name: "Drawing Hall", type: "classroom" }]);

    expect(room).toMatchObject({ title: "A-102 Drawing Hall", detail: "block-a, level 1, classroom", geometry: null });
  });
});

describe("approvedMatcher", () => {
  const live = published(reviewedFiles()).core;
  const item = (id: string, osmId?: string) => ({ id, osmId, title: "", detail: "", geometry: null, notApprovable: null });

  it("knows nothing is approved while the demo is published", () => {
    expect(approvedMatcher(published().core, "buildings")(item("demo-library"))).toBe(false);
    expect(approvedMatcher(null, "buildings")(item("demo-library"))).toBe(false);
  });

  it("matches by id, and by OpenStreetMap object except for paths, like data:approve", () => {
    const withOsm = structuredClone(live);
    withOsm.buildings[0].properties.osmId = "way/5";
    withOsm.paths[0].properties.osmId = "way/6";

    expect(approvedMatcher(withOsm, "buildings")(item("demo-library"))).toBe(true);
    expect(approvedMatcher(withOsm, "buildings")(item("new-name", "way/5"))).toBe(true);
    expect(approvedMatcher(withOsm, "paths")(item("other-piece", "way/6"))).toBe(false);
    expect(approvedMatcher(withOsm, "rooms")(item(live.rooms[0].id))).toBe(true);
  });
});

describe("positionsOf", () => {
  it("finds every position of a shape", () => {
    expect(positionsOf(building("a", "A").geometry as GeoJSON.Polygon)).toHaveLength(4);
    expect(positionsOf({ type: "Point", coordinates: [94.25, 26.745] })).toEqual([[94.25, 26.745]]);
  });
});
