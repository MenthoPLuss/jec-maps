import { describe, expect, it } from "vitest";

import type { PublishedDataset } from "../data/published";
import { published } from "../data/testing";
import type { AreaGeometry } from "../geo/area";
import { distanceM } from "../geo/distance";
import { localPlane } from "../geo/localPlane";
import { JEC_CENTRE, type LngLat, type XY } from "../geo/types";
import { findPath } from "./astar";
import { buildGraph, type Graph } from "./graph";
import { progressOn, startOf } from "./progress";
import { findRoute, type EntranceOption, type Route, type RouteRequest } from "./route";
import { snapToPaths } from "./snap";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);
const xy = (point: LngLat): number[] => plane.toXY(point).map((v) => Math.round(v) + 0);

type PathSpec = { id: string; from: string; to: string; points: XY[]; kind?: string; direction?: string; layer?: number };

function network(...specs: PathSpec[]): Graph {
  return buildGraph({
    routablePathIds: specs.map((spec) => spec.id),
    paths: specs.map(({ id, from, to, points, kind = "footway", direction = "both", layer = 0 }) => ({
      type: "Feature",
      properties: { id, fromNode: from, toNode: to, kind, direction, layer, access: "public", source: "test", placeholder: false, reviewStatus: "reviewed" },
      geometry: { type: "LineString", coordinates: points.map(([x, y]) => at(x, y)) },
    })) as PublishedDataset["paths"],
  });
}

const point = (x: number, y: number) => ({ kind: "point", position: at(x, y) }) as const;
const request = (from: XY, to: RouteRequest["target"], avoidSteps = false): RouteRequest => ({
  origin: at(...from),
  target: to,
  avoidSteps,
});
function mustFind(graph: Graph, req: RouteRequest, obstacles: AreaGeometry[] = []): Route {
  const result = findRoute(graph, obstacles, req);
  if (!result.ok) throw new Error(`no route: ${result.reason}`);
  return result.route;
}
const box = (x1: number, y1: number, x2: number, y2: number): AreaGeometry => ({
  type: "Polygon",
  coordinates: [[at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2), at(x1, y1)]],
});

//   d ---- c
//   |      |      a-b-c-d is a 100 m square, plus a long detour a-e-c
//   a ---- b
const square = network(
  { id: "ab", from: "a", to: "b", points: [[0, 0], [100, 0]] },
  { id: "bc", from: "b", to: "c", points: [[100, 0], [100, 100]] },
  { id: "cd", from: "c", to: "d", points: [[100, 100], [0, 100]] },
  { id: "da", from: "d", to: "a", points: [[0, 100], [0, 0]] },
  { id: "aec", from: "a", to: "c", points: [[0, 0], [-200, -200], [400, 300], [100, 100]] },
);

describe("findPath", () => {
  const edges: Record<string, { to: string; cost: number }[]> = {
    a: [{ to: "b", cost: 4 }, { to: "c", cost: 2 }],
    c: [{ to: "b", cost: 1 }, { to: "d", cost: 7 }],
    b: [{ to: "d", cost: 3 }],
  };
  const from = (node: string) => edges[node] ?? [];
  const nothing = () => 0;

  it("finds the cheapest way", () => {
    expect(findPath("a", "d", from, nothing)?.map((edge) => edge.to)).toEqual(["c", "b", "d"]);
  });

  it("returns an empty path to itself, and null when there is no way", () => {
    expect(findPath("a", "a", from, nothing)).toEqual([]);
    expect(findPath("d", "a", from, nothing)).toBeNull();
    expect(findPath("a", "nowhere", from, nothing)).toBeNull();
  });

  it("ignores edges with a cost that makes no sense", () => {
    const broken = { a: [{ to: "b", cost: NaN }, { to: "b", cost: -5 }, { to: "b", cost: 9 }] };
    expect(findPath("a", "b", (node) => broken[node as "a"] ?? [], nothing)?.[0].cost).toBe(9);
  });

  it("finds the same cost as a search without a heuristic, on many random networks", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 40; round++) {
      const spots = Array.from({ length: 14 }, () => [random() * 300, random() * 300] as XY);
      const links = new Map<string, { to: string; cost: number }[]>();
      for (let i = 0; i < 30; i++) {
        const a = Math.floor(random() * 14);
        const b = Math.floor(random() * 14);
        const cost = Math.hypot(spots[a][0] - spots[b][0], spots[a][1] - spots[b][1]) * (1 + random());
        links.set(`${a}`, [...(links.get(`${a}`) ?? []), { to: `${b}`, cost }]);
        links.set(`${b}`, [...(links.get(`${b}`) ?? []), { to: `${a}`, cost }]);
      }
      const next = (node: string) => links.get(node) ?? [];
      const toGoal = (node: string) => Math.hypot(spots[+node][0] - spots[13][0], spots[+node][1] - spots[13][1]);
      const total = (path: { cost: number }[] | null) => path?.reduce((sum, edge) => sum + edge.cost, 0);

      const guided = total(findPath("0", "13", next, toGoal));
      const blind = total(findPath("0", "13", next, nothing));
      if (blind === undefined) expect(guided).toBeUndefined();
      else expect(guided).toBeCloseTo(blind, 6);
    }
  });
});

describe("findRoute", () => {
  it("takes the short way round", () => {
    const route = mustFind(square, request([0, 0], point(100, 100)));

    expect(route.totalM).toBeCloseTo(200, 0);
    expect(route.unverifiedM).toBeLessThan(0.1);
    expect(route.legs).toHaveLength(1);
  });

  it("starts and ends in the middle of a path", () => {
    const route = mustFind(square, request([50, 0], point(100, 50)));

    expect(route.totalM).toBeCloseTo(100, 0);
    expect(route.line.map(xy)).toEqual([[50, 0], [100, 0], [100, 50]]);
  });

  it("goes straight along one path when both ends are on it, in either direction", () => {
    expect(mustFind(square, request([20, 0], point(70, 0))).line.map(xy)).toEqual([[20, 0], [70, 0]]);
    expect(mustFind(square, request([70, 0], point(20, 0))).line.map(xy)).toEqual([[70, 0], [20, 0]]);
  });

  it("goes the long way round on a one-way path", () => {
    const oneWay = network(
      { id: "ab", from: "a", to: "b", points: [[0, 0], [100, 0]], direction: "forward" },
      { id: "ba", from: "b", to: "a", points: [[100, 0], [50, 80], [0, 0]], direction: "forward" },
    );
    expect(mustFind(oneWay, request([20, 0], point(70, 0))).totalM).toBeCloseTo(50, 0);

    const back = mustFind(oneWay, request([70, 0], point(20, 0)));
    expect(back.line.map(xy)).toContainEqual([50, 80]);
  });

  it("respects a path that is only open backwards", () => {
    const backwards = network({ id: "ab", from: "a", to: "b", points: [[0, 0], [100, 0]], direction: "backward" });

    expect(findRoute(backwards, [], request([20, 0], point(70, 0)))).toMatchObject({ ok: false, reason: "not-connected" });
    expect(mustFind(backwards, request([70, 0], point(20, 0))).totalM).toBeCloseTo(50, 0);
  });

  it("shows the gap to the path as unverified", () => {
    const route = mustFind(square, request([50, -10], point(100, 50)));

    expect(route.legs.map((leg) => leg.verified)).toEqual([false, true]);
    expect(route.unverifiedM).toBeCloseTo(10, 0);
  });

  it("never cuts across a lawn to save a few metres", () => {
    // Two parallel paths 18 m apart, joined only at the far end.
    const parallel = network(
      { id: "south", from: "a", to: "b", points: [[0, 0], [60, 0]] },
      { id: "end", from: "b", to: "c", points: [[60, 0], [60, 18]] },
      { id: "north", from: "c", to: "d", points: [[60, 18], [0, 18]] },
    );
    const route = mustFind(parallel, request([30, 1], point(30, 17)));

    expect(route.totalM).toBeGreaterThan(70);
    expect(route.unverifiedM).toBeLessThan(3);
  });

  it("does not walk through a building to reach a path", () => {
    const wall = box(40, -14, 60, -4);
    const result = findRoute(square, [wall], request([50, -16], point(100, 50)));

    expect(result).toMatchObject({ ok: false, reason: "origin-off-network" });
    expect(findRoute(square, [], request([50, -16], point(100, 50))).ok).toBe(true);
  });

  it("still starts from inside a building, where GPS may have put someone", () => {
    expect(findRoute(square, [box(40, -14, 60, -4)], request([50, -8], point(100, 50))).ok).toBe(true);
  });

  it.each<[string, XY, XY, string]>([
    ["the start is too far from any path", [50, -25], [100, 50], "origin-off-network"],
    ["the end is too far from any path", [50, 0], [50, -25], "target-off-network"],
  ])("offers no walk when %s", (_name, from, to, reason) => {
    const result = findRoute(square, [], request(from, point(...to)));

    expect(result).toMatchObject({ ok: false, reason });
    expect((result as { straightLineM: number }).straightLineM).toBeCloseTo(Math.hypot(from[0] - to[0], from[1] - to[1]), 0);
  });

  it("says so when the two ends are not connected", () => {
    const islands = network(
      { id: "ab", from: "a", to: "b", points: [[0, 0], [100, 0]] },
      { id: "cd", from: "c", to: "d", points: [[0, 60], [100, 60]] },
    );
    expect(findRoute(islands, [], request([50, 0], point(50, 60)))).toMatchObject({ ok: false, reason: "not-connected" });
  });

  it("does not turn at a crossing without a junction, such as a bridge", () => {
    const bridge = network(
      { id: "road", from: "a", to: "b", points: [[-50, 0], [50, 0]] },
      { id: "bridge", from: "c", to: "d", points: [[0, -50], [0, 50]], layer: 1 },
    );
    expect(findRoute(bridge, [], request([-50, 0], point(0, 50)))).toMatchObject({ ok: false, reason: "not-connected" });
  });

  it("says so when there is no network", () => {
    expect(findRoute(network(), [], request([0, 0], point(1, 1)))).toMatchObject({ ok: false, reason: "no-network" });
  });

  it("never changes the shared network", () => {
    const before = JSON.stringify([...square.edges]);
    findRoute(square, [], request([50, -3], point(100, 52)));

    expect(JSON.stringify([...square.edges])).toBe(before);
  });

  it("gives the same route every time", () => {
    const once = findRoute(square, [], request([50, 4], point(60, 96)));
    expect(findRoute(square, [], request([50, 4], point(60, 96)))).toEqual(once);
  });
});

describe("avoiding stairs", () => {
  const withSteps = network(
    { id: "ab", from: "a", to: "b", points: [[0, 0], [100, 0]] },
    { id: "steps", from: "b", to: "c", points: [[100, 0], [100, 40]], kind: "steps" },
    { id: "ramp-1", from: "b", to: "r", points: [[100, 0], [200, 20]] },
    { id: "ramp-2", from: "r", to: "c", points: [[200, 20], [100, 40]] },
  );

  it("takes the stairs by default and marks them", () => {
    const route = mustFind(withSteps, request([0, 0], point(100, 40)));
    expect(route.legs.map((leg) => leg.steps)).toEqual([false, true]);
  });

  it("goes round when asked to", () => {
    const route = mustFind(withSteps, request([0, 0], point(100, 40), true));

    expect(route.legs.some((leg) => leg.steps)).toBe(false);
    expect(route.totalM).toBeGreaterThan(250);
  });

  it("does not fall back to stairs silently", () => {
    const onlySteps = network(
      { id: "ab", from: "a", to: "b", points: [[0, 0], [100, 0]] },
      { id: "steps", from: "b", to: "c", points: [[100, 0], [100, 40]], kind: "steps" },
      { id: "cd", from: "c", to: "d", points: [[100, 40], [0, 40]] },
    );
    expect(findRoute(onlySteps, [], request([0, 0], point(0, 40), true))).toMatchObject({ ok: false, reason: "only-steps" });
  });
});

describe("entrances", () => {
  const door = (entranceId: string, nodeId: string, x: number, y: number, accessUnknown = false): EntranceOption => ({
    entranceId,
    nodeId,
    position: at(x, y),
    accessUnknown,
  });
  const to = (...options: EntranceOption[]) => ({ kind: "entrances", position: at(50, 50), options }) as const;

  it("chooses the door with the shortest walk, not the closest one", () => {
    // The door at d is closer in a straight line, but the way there is longer.
    const graph = network(
      { id: "ab", from: "a", to: "b", points: [[0, 0], [60, 0]] },
      { id: "a-far-d", from: "a", to: "d", points: [[0, 0], [-150, 0], [-150, 40], [0, 40]] },
    );
    const route = mustFind(graph, request([0, 0], to(door("near", "d", 0, 42), door("easy", "b", 62, 0))));

    expect(route.entranceId).toBe("easy");
    expect(xy(route.end)).toEqual([62, 0]);
  });

  it("uses the other door when one can't be reached", () => {
    const route = mustFind(square, request([0, 0], to(door("gone", "nowhere", 1, 1), door("real", "c", 100, 102))));
    expect(route.entranceId).toBe("real");
  });

  it("says so when no door is known", () => {
    expect(findRoute(square, [], request([0, 0], to()))).toMatchObject({ ok: false, reason: "no-entrance" });
    expect(findRoute(square, [], request([0, 0], to(door("gone", "nowhere", 1, 1))))).toMatchObject({ reason: "no-entrance" });
  });

  it("passes on that the access is unknown", () => {
    expect(mustFind(square, request([0, 0], to(door("maybe", "c", 100, 102, true)))).accessUnknown).toBe(true);
  });
});

describe("the demo campus", () => {
  const { core } = published();
  const graph = buildGraph(core);

  it("leads from the main gate to every place that stands in the open", () => {
    const gate = core.places.find((place) => place.properties.id === "demo-main-gate")!.geometry.coordinates;
    for (const place of core.places.filter((candidate) => !candidate.properties.buildingId)) {
      const result = findRoute(graph, core.buildings.map((building) => building.geometry), {
        origin: gate,
        target: { kind: "point", position: place.geometry.coordinates },
        avoidSteps: true,
      });
      expect(result.ok, place.properties.id).toBe(true);
    }
  });

  it("never uses the restricted road", () => {
    expect(graph.paths.map((path) => path.id)).not.toContain("demo-service-road");
  });
});

describe("snapToPaths", () => {
  it("lists the nearest paths first and leaves out far ones", () => {
    const snaps = snapToPaths(square, at(95, 4), { maxM: 20, avoidSteps: false, obstacles: [] });

    expect(snaps.map((snap) => snap.path.id)).toEqual(["ab", "bc"]);
    expect(snaps[0].gapM).toBeCloseTo(4, 1);
  });
});

describe("progressOn", () => {
  const route = mustFind(square, request([0, 0], point(100, 100)));
  const first = route.line.map(xy)[1];

  it("counts down as the walker moves", () => {
    const along = first[0] === 100 ? at(60, 2) : at(2, 60);
    const progress = progressOn(route, startOf(route), along, 8);

    expect(progress.alongM).toBeCloseTo(60, 0);
    expect(progress.remainingM).toBeCloseTo(140, 0);
    expect(progress.offM).toBeCloseTo(2, 0);
  });

  it("does not jump ahead where the route passes close to itself", () => {
    const line = [at(0, 0), at(100, 0), at(100, 10), at(0, 10)];
    const there: Route = { ...route, line, totalM: 210 };
    const progress = progressOn(there, { alongM: 20, remainingM: 190, offM: 0 }, at(30, 6), 8);

    expect(progress.alongM).toBeCloseTo(30, 0); // not 180, although that part is closer
  });

  it("catches up after a gap in the fixes", () => {
    const line = [at(0, 0), at(300, 0)];
    const there: Route = { ...route, line, totalM: 300 };

    expect(progressOn(there, { alongM: 10, remainingM: 290, offM: 0 }, at(220, 3), 8).alongM).toBeCloseTo(220, 0);
  });

  it("reports how far off the walker is", () => {
    const line = [at(0, 0), at(100, 0)];
    const progress = progressOn({ ...route, line, totalM: 100 }, { alongM: 40, remainingM: 60, offM: 0 }, at(50, -45), 8);

    expect(progress.offM).toBeCloseTo(45, 0);
    expect(progress.alongM).toBeCloseTo(50, 0);
  });

  it("never goes below zero", () => {
    expect(progressOn(route, startOf(route), at(100, 105), 8).remainingM).toBeGreaterThanOrEqual(0);
  });
});

it("distances along a route match its line", () => {
  const route = mustFind(square, request([10, 5], point(95, 60)));
  const sum = route.legs.reduce((total, leg) => total + leg.lengthM, 0);

  expect(route.totalM).toBeCloseTo(sum, 3);
  expect(distanceM(route.line[0], at(10, 5))).toBeLessThan(0.1);
  expect(distanceM(route.line.at(-1)!, at(95, 60))).toBeLessThan(0.1);
});
