import { describe, expect, it, vi } from "vitest";

import { buildingSchema, boundarySchema, pathSchema } from "../../src/lib/data/schemas";
import { localPlane } from "../../src/lib/geo/localPlane";
import { JEC_CENTRE, type LngLat } from "../../src/lib/geo/types";
import { linkEntrances, mergeApproved } from "./merge";
import { joinRings, osmToCandidates } from "./osmImport";
import { OverpassError, askOverpass, overpassQuery } from "./overpass";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);
const point = (x: number, y: number) => {
  const [lon, lat] = at(x, y);
  return { lat, lon };
};
const box = (x: number, y: number, size: number) =>
  [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]].map(([a, b]) => point(x + a * size, y + b * size));

const building = (id: number, name: string | undefined, x: number, tags: object = {}) => ({
  type: "way",
  id,
  tags: { building: "yes", ...(name && { name }), ...tags },
  nodes: [id, id + 1, id + 2, id + 3, id],
  geometry: box(x, 20, 30),
});
const road = (id: number, nodes: number[], points: [number, number][], tags: object = {}) => ({
  type: "way",
  id,
  tags: { highway: "footway", ...tags },
  nodes,
  geometry: points.map(([x, y]) => point(x, y)),
});
const convert = (...elements: object[]) => osmToCandidates({ elements });

describe("buildings", () => {
  it("become valid, unreviewed records with their OpenStreetMap id kept apart", () => {
    const { buildings } = convert(building(1198321049, "JEC Library", 0, { "building:levels": "2" }));

    expect(buildingSchema.safeParse(buildings[0]).success).toBe(true);
    expect(buildings[0].properties).toMatchObject({
      id: "jec-library",
      osmId: "way/1198321049",
      source: "osm",
      placeholder: false,
      reviewStatus: "unreviewed",
    });
    expect((buildings[0].properties as { levels?: unknown[] }).levels).toHaveLength(2);
    const [lng, lat] = (buildings[0].geometry.coordinates as LngLat[][])[0][0];
    expect([Math.round(lng), Math.round(lat)]).toEqual([94, 27]);
  });

  it("get different ids when they share a name, the same ones every time", () => {
    const answer = [building(20, "JEC Workshop", 0), building(10, "JEC Workshop", 100), building(30, undefined, 200)];
    const ids = (elements: object[]) => convert(...elements).buildings.map((b) => `${b.properties.osmId} ${b.properties.id}`);

    expect(ids(answer)).toEqual(["way/10 jec-workshop", "way/20 jec-workshop-2", "way/30 osm-building-30"]);
    expect(ids([...answer].reverse())).toEqual(ids(answer));
  });

  it("support outlines with holes, made of several pieces", () => {
    const outer = box(0, 0, 100);
    const { buildings, issues } = convert({
      type: "relation",
      id: 7,
      tags: { type: "multipolygon", building: "yes", name: "Courtyard" },
      members: [
        { type: "way", ref: 1, role: "outer", geometry: outer.slice(0, 3) },
        { type: "way", ref: 2, role: "outer", geometry: outer.slice(2).reverse() },
        { type: "way", ref: 3, role: "inner", geometry: box(40, 40, 20) },
      ],
    });

    expect(issues).toEqual([]);
    expect(buildings[0].geometry.type).toBe("Polygon");
    expect(buildings[0].geometry.coordinates).toHaveLength(2);
    expect(buildingSchema.safeParse(buildings[0]).success).toBe(true);
  });

  it("are left out, with a message, when the outline does not close", () => {
    const broken = { ...building(5, "Broken", 0), geometry: box(0, 0, 10).slice(0, 4) };
    const { buildings, issues } = convert(broken);

    expect(buildings).toEqual([]);
    expect(issues[0]).toMatchObject({ severity: "warning", record: "way/5" });
  });
});

describe("campus outlines", () => {
  it("are all kept when there are several: a person has to choose", () => {
    const campus = (id: number, name: string, x: number) => ({
      type: "way",
      id,
      tags: { amenity: "college", name },
      geometry: box(x, 0, 200),
    });
    const { boundaries } = convert(campus(1, "JEC", 0), campus(2, "Other College", 400));

    expect(boundaries.map((b) => b.properties.id)).toEqual(["jec", "other-college"]);
    expect(boundarySchema.safeParse(boundaries[0]).success).toBe(true);
    expect(boundaries.every((b) => b.properties.reviewStatus === "unreviewed")).toBe(true);
  });
});

describe("paths", () => {
  it("are split where they share a junction", () => {
    const { paths } = convert(
      road(1, [1, 2, 3], [[0, 0], [50, 0], [100, 0]]),
      road(2, [2, 4], [[50, 0], [50, 40]]),
    );

    expect(paths.map((p) => [p.properties.id, p.properties.fromNode, p.properties.toNode])).toEqual([
      ["osm-way-1-1", "osm-node-1", "osm-node-2"],
      ["osm-way-1-2", "osm-node-2", "osm-node-3"],
      ["osm-way-2-1", "osm-node-2", "osm-node-4"],
    ]);
    for (const path of paths) expect(pathSchema.safeParse(path).success).toBe(true);
  });

  it("stay apart when they only cross on the map", () => {
    const { paths } = convert(
      road(1, [1, 2], [[-50, 0], [50, 0]]),
      road(2, [3, 4], [[0, -50], [0, 50]], { bridge: "yes" }),
    );

    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.properties.layer)).toEqual([0, 1]);
    expect(new Set(paths.flatMap((p) => [p.properties.fromNode, p.properties.toNode])).size).toBe(4);
  });

  it.each<[object, string]>([
    [{}, "unknown"],
    [{ access: "private" }, "private"],
    [{ access: "private", foot: "yes" }, "public"],
    [{ foot: "no" }, "private"],
    [{ access: "customers" }, "restricted"],
    [{ access: "yes" }, "public"],
  ])("with the tags %j have %s access", (tags, access) => {
    expect(convert(road(1, [1, 2], [[0, 0], [50, 0]], tags)).paths[0].properties.access).toBe(access);
  });

  it("mention gates on the way", () => {
    const { paths } = convert(road(1, [1, 2], [[0, 0], [50, 0]]), { type: "node", id: 2, tags: { barrier: "gate" } });
    expect(paths[0].properties.evidence).toContain("barrier=gate");
  });

  it("do not include motorways or roads that don't exist yet", () => {
    expect(convert(road(1, [1, 2], [[0, 0], [9, 0]], { highway: "motorway" }), road(2, [3, 4], [[0, 0], [9, 0]], { highway: "proposed" })).paths).toEqual([]);
  });

  it("cut a loop in two, because a path joins two junctions", () => {
    const { paths } = convert(road(1, [1, 2, 3, 4, 1], [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]));

    expect(paths).toHaveLength(2);
    for (const path of paths) expect(pathSchema.safeParse(path).success).toBe(true);
  });
});

describe("a strange answer", () => {
  it.each([null, {}, [], "x", { elements: "x" }])("%j is refused", (answer) => {
    expect(() => osmToCandidates(answer)).toThrow("not an Overpass answer");
  });

  it("can be empty", () => {
    expect(osmToCandidates({ elements: [] })).toEqual({ boundaries: [], buildings: [], paths: [], issues: [] });
  });
});

describe("joinRings", () => {
  it("gives up on pieces that don't meet", () => {
    expect(joinRings([[at(0, 0), at(1, 0)], [at(5, 5), at(6, 6)]])).toBeNull();
    expect(joinRings([null])).toBeNull();
    expect(joinRings([])).toEqual([]);
  });
});

describe("askOverpass", () => {
  const options = { sleep: async () => {}, attempts: 3 };
  const reply = (status: number, body = "{}") => async () => new Response(body, { status });

  it("returns the answer", async () => {
    expect(await askOverpass("q", { ...options, fetcher: reply(200, '{"elements":[]}') })).toEqual({ elements: [] });
  });

  it.each<[string, () => Promise<Response>]>([
    ["is busy", reply(429)],
    ["breaks", reply(504)],
    ["sends a web page", reply(200, "<html>")],
    ["can't be reached", () => Promise.reject(new TypeError("fetch failed"))],
  ])("tries three times when the server %s, then explains", async (_name, answer) => {
    const fetcher = vi.fn(answer);

    await expect(askOverpass("q", { ...options, fetcher })).rejects.toThrow("Nothing was changed");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("recovers when a later attempt works", async () => {
    let calls = 0;
    const fetcher = async () => (++calls < 3 ? new Response("", { status: 504 }) : new Response('{"elements":[]}'));

    expect(await askOverpass("q", { ...options, fetcher })).toEqual({ elements: [] });
  });

  it("does not repeat a request that is wrong", async () => {
    const fetcher = vi.fn(reply(400));

    await expect(askOverpass("q", { ...options, fetcher })).rejects.toBeInstanceOf(OverpassError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sets a time limit on every attempt", async () => {
    const fetcher = vi.fn(reply(200, "{}"));
    await askOverpass("q", { ...options, fetcher });
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("overpassQuery", () => {
  it("asks for a bounded area, latitude first as Overpass expects", () => {
    expect(overpassQuery(JEC_CENTRE, 700)).toContain("(around:700,26.7458283,94.2506399)");
  });

  it.each([0, 49, 2001, 100.5, NaN])("refuses a radius of %s", (radius) => {
    expect(() => overpassQuery(JEC_CENTRE, radius)).toThrow("radius");
  });
});

describe("mergeApproved", () => {
  const record = (id: string, osmId: string, extra: object = {}) => ({
    type: "Feature",
    properties: { id, osmId, name: id, reviewStatus: "unreviewed", ...extra },
    geometry: { type: "Polygon", coordinates: [] },
  });

  it("adds what is new", () => {
    expect(mergeApproved([], [record("a", "way/1")])).toMatchObject({ added: ["a"], conflicts: [] });
  });

  it("never changes an approved name, id or shape, and says what differs", () => {
    const approved = [record("main-block", "way/1", { name: "Main Block", entranceIds: ["front"] })];
    const { merged, added, conflicts } = mergeApproved(approved, [record("jec-main-building", "way/1", { entranceIds: [] })]);

    expect(merged).toEqual(approved);
    expect(added).toEqual([]);
    expect(conflicts).toEqual([{ id: "main-block", fields: ["id", "name"] }]);
  });

  it("counts a different list of entrances, but not an empty one from OpenStreetMap", () => {
    const approved = [record("a", "way/1", { entranceIds: ["a-front"] })];

    expect(mergeApproved(approved, [record("a", "way/1", { entranceIds: [] })])).toMatchObject({ unchanged: ["a"] });
    expect(mergeApproved(approved, [record("a", "way/1", { entranceIds: ["a-back"] })]).conflicts).toEqual([
      { id: "a", fields: ["entranceIds"] },
    ]);
  });

  it("does not call a review stamp a difference", () => {
    const approved = [record("a", "way/1", { reviewStatus: "reviewed", reviewedBy: "Someone", reviewedOn: "2026-11-30" })];
    expect(mergeApproved(approved, [record("a", "way/1")])).toMatchObject({ unchanged: ["a"], conflicts: [] });
  });

  it("keeps the several paths of one OpenStreetMap way apart", () => {
    const path = (id: string) => ({ ...record(id, "way/9"), geometry: { type: "LineString", coordinates: [] } });
    expect(mergeApproved([path("osm-way-9-1")], [path("osm-way-9-2")]).added).toEqual(["osm-way-9-2"]);
  });

  it("gives the same result when it runs twice", () => {
    const first = mergeApproved([], [record("a", "way/1"), record("b", "way/2")]);
    const second = mergeApproved(first.merged, [record("a", "way/1"), record("b", "way/2")]);

    expect(second.merged).toEqual(first.merged);
    expect(second.added).toEqual([]);
  });
});

describe("linkEntrances", () => {
  const building = (id: string, entranceIds: string[]) => ({ type: "Feature", properties: { id, entranceIds } });
  const entrance = (id: string, buildingId: string) => ({ type: "Feature", properties: { id, buildingId } });

  it("only ever adds an entrance to the list of its own building", () => {
    const before = [building("library", ["library-front"]), building("canteen", [])];
    const { buildings, linked } = linkEntrances(before, [
      entrance("library-side", "library"),
      entrance("library-front", "library"),
      entrance("gym-door", "gym"),
    ]);

    expect(buildings).toEqual([building("library", ["library-front", "library-side"]), building("canteen", [])]);
    expect(buildings[1]).toBe(before[1]);
    expect(before[0].properties.entranceIds).toEqual(["library-front"]);
    expect(linked).toEqual(["library now lists library-side"]);
  });
});
