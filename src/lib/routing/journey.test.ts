import { describe, expect, it } from "vitest";

import { demoFiles, published, record, reviewedFiles, type Json } from "../data/testing";
import { localPlane } from "../geo/localPlane";
import { JEC_CENTRE, type LngLat } from "../geo/types";
import { routeTarget } from "../state/destination";
import type { Destination } from "../state/types";
import { buildGraph } from "./graph";
import { stepsOf } from "./instructions";
import { findJourney, type JourneyOrigin, type JourneyWorld } from "./journey";
import type { Route } from "./route";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);
const PLAN_0 = "buildings/demo-block-a/level-0.geojson";
const PLAN_1 = "buildings/demo-block-a/level-1.geojson";

function worldOf(files: Record<string, Json> = demoFiles()): JourneyWorld {
  const { core, indoor } = published(files);
  return {
    dataset: core,
    graph: buildGraph(core),
    obstacles: core.buildings.map((building) => building.geometry),
    plans: new Map(indoor.map((plans) => [plans.buildingId, plans])),
  };
}

const gate: JourneyOrigin = { kind: "position", position: at(0, -150) };
const inRoom = (roomId: string): JourneyOrigin => ({ kind: "room", roomId });
const room = (id: string): Destination => ({ kind: "room", id });

function journey(origin: JourneyOrigin, destination: Destination, avoidSteps = false, world = worldOf()) {
  return findJourney(world, {
    origin,
    target: routeTarget(world.dataset, destination)!,
    targetRoomId: destination.kind === "room" ? destination.id : null,
    avoidSteps,
  });
}

function mustFind(...args: Parameters<typeof journey>): Route {
  const result = journey(...args);
  if (!result.ok) throw new Error(result.reason);
  return result.route;
}

const kinds = (route: Route) => route.enter?.pieces.map((piece) => (piece.kind === "walk" ? `walk ${piece.level}` : `${piece.kind} ${piece.level}→${piece.toLevel}`));

describe("from outside to a room", () => {
  it("leads to the door, through it, up the stairs and to the room", () => {
    const route = mustFind(gate, room("demo-a-102"));

    expect(route.totalM).toBeGreaterThan(200);
    expect(kinds(route)).toEqual(["walk 0", "stairs 0→1", "walk 1"]);
    expect(route.indoorNote).toBeNull();
    expect(plane.toXY(route.line.at(-1)!)[0]).toBeCloseTo(-80, 0); // the main entrance
  });

  it("stays on the ground floor when the room is there", () => {
    expect(kinds(mustFind(gate, room("demo-a-001")))).toEqual(["walk 0"]);
  });

  it("takes the lift when stairs are to be avoided", () => {
    const route = mustFind(gate, room("demo-a-102"), true);

    expect(kinds(route)).toEqual(["walk 0", "lift 0→1", "walk 1"]);
    expect(route.enter!.seconds).toBeGreaterThan(mustFind(gate, room("demo-a-102")).enter!.seconds);
  });

  it("never connects floors where the data does not", () => {
    const files = demoFiles();
    for (const plan of [PLAN_0, PLAN_1]) {
      files[plan].features = files[plan].features.filter((feature: Json) => feature.properties.featureType !== "vertical");
    }
    const route = mustFind(gate, room("demo-a-102"), false, worldOf(files));

    expect(route.enter).toBeNull(); // only to the entrance
    expect(route.indoorNote).toBe("no-plan");
  });

  it("never uses a restricted corridor", () => {
    const files = demoFiles();
    record(files, PLAN_0, "demo-a0-corridor-1").access = "restricted";
    expect(mustFind(gate, room("demo-a-001"), false, worldOf(files)).enter).toBeNull();
  });

  it("says no step-free route is known inside, and never uses the stairs anyway", () => {
    const files = demoFiles();
    for (const plan of [PLAN_0, PLAN_1]) {
      files[plan].features = files[plan].features.filter((feature: Json) => feature.properties.kind !== "lift");
    }
    const route = mustFind(gate, room("demo-a-102"), true, worldOf(files));

    expect(route.enter).toBeNull();
    expect(route.indoorNote).toBe("only-steps");
    expect(route.entranceId).toBe("demo-block-a-main");
  });

  it("without a plan it leads to the entrance", () => {
    const route = mustFind(gate, room("demo-b-101"));

    expect(route).toMatchObject({ enter: null, indoorNote: "no-plan" });
    expect(route.entranceId).toMatch(/demo-block-b/);
  });

  it("before the plan is downloaded it leads to the entrance", () => {
    const world = { ...worldOf(), plans: new Map() };
    expect(mustFind(gate, room("demo-a-102"), false, world)).toMatchObject({ enter: null, indoorNote: "no-plan" });
  });

  it("does not add indoor parts to other destinations", () => {
    expect(mustFind(gate, { kind: "building", id: "demo-block-a" })).toMatchObject({ enter: null, exit: null, indoorNote: null });
  });

  it("uses nothing unreviewed in live data", () => {
    const files = reviewedFiles();
    record(files, PLAN_0, "demo-a0-stairs").reviewStatus = "unreviewed";
    expect(kinds(mustFind(gate, room("demo-a-102"), false, worldOf(files)))).toEqual(["walk 0", "lift 0→1", "walk 1"]);

    for (const plan of [PLAN_0, PLAN_1]) {
      for (const { properties } of files[plan].features) properties.reviewStatus = "unreviewed";
    }
    expect(mustFind(gate, room("demo-a-102"), false, worldOf(files)).enter).toBeNull();
  });
});

describe("from a room", () => {
  it("to another one on the same floor, without going outside", () => {
    const route = mustFind(inRoom("demo-a-001"), room("demo-a-004"));

    expect(route.line).toEqual([]);
    expect(route.exit).toBeNull();
    expect(kinds(route)).toEqual(["walk 0"]);
  });

  it("to another floor", () => {
    expect(kinds(mustFind(inRoom("demo-a-001"), room("demo-a-105")))).toEqual(["walk 0", "stairs 0→1", "walk 1"]);
  });

  it("to a place outside", () => {
    const route = mustFind(inRoom("demo-a-102"), { kind: "place", id: "demo-canteen" });

    expect(route.exit?.pieces.map((piece) => piece.kind)).toEqual(["walk", "stairs", "walk"]);
    expect(route.enter).toBeNull();
    expect(route.totalM).toBeGreaterThan(50);
  });

  it("to a room in another building", () => {
    const route = mustFind(inRoom("demo-a-102"), room("demo-b-101"));

    expect(route.exit).not.toBeNull();
    expect(route.entranceId).toMatch(/demo-block-b/);
    expect(route.indoorNote).toBe("no-plan");
  });

  it("says when the only way has stairs", () => {
    const files = demoFiles();
    for (const plan of [PLAN_0, PLAN_1]) {
      files[plan].features = files[plan].features.filter((feature: Json) => feature.properties.kind !== "lift");
    }
    expect(journey(inRoom("demo-a-102"), room("demo-a-001"), true, worldOf(files))).toMatchObject({ ok: false, reason: "only-steps" });
  });

  it("starts at the doors of the building when only that is known", () => {
    expect(mustFind({ kind: "building", buildingId: "demo-block-b" }, { kind: "place", id: "demo-canteen" }).totalM).toBeGreaterThan(100);
    expect(kinds(mustFind({ kind: "building", buildingId: "demo-block-a" }, room("demo-a-001")))).toEqual(["walk 0"]);
  });

  it("fails clearly from a building without a known door", () => {
    const files = demoFiles();
    record(files, "entrances.geojson", "demo-library-west").access = "closed";
    expect(journey({ kind: "building", buildingId: "demo-library" }, { kind: "place", id: "demo-canteen" }, false, worldOf(files))).toMatchObject({ ok: false });
  });
});

describe("the time inside", () => {
  it("is an estimate from distance, stairs and lifts", () => {
    const stairs = mustFind(gate, room("demo-a-103")).enter!;
    const lift = mustFind(gate, room("demo-a-103"), true).enter!;

    expect(stairs.seconds).toBeCloseTo(stairs.lengthM / 1.1 + 15, 1);
    expect(lift.seconds).toBeCloseTo(lift.lengthM / 1.1 + 35, 1);
  });
});

describe("steps in words", () => {
  const world = worldOf();
  const steps = (route: Route, roomId: string) => {
    const found = world.dataset.rooms.find((candidate) => candidate.id === roomId)!;
    return stepsOf(route, world.dataset, found, world.plans.get(found.buildingId) ?? null).map((step) => step.text);
  };

  it("lead from the gate to a room upstairs", () => {
    expect(steps(mustFind(gate, room("demo-a-102")), "demo-a-102")).toEqual([
      expect.stringMatching(/^Walk \d+ m to Main entrance of Block A$/),
      "Walk 20 m",
      "Turn right and walk 10 m",
      "Take the stairs up to Floor 1",
      "Walk 20 m",
      "A-102 Demo Drawing Hall is the 1st door on the left",
    ]);
  });

  it("count doors only where a person has counted them", () => {
    expect(steps(mustFind(gate, room("demo-a-101")), "demo-a-101").at(-1)).toBe("A-101 Demo Classroom 3 is the 2nd door on the left");
    expect(steps(mustFind(gate, room("demo-a-106")), "demo-a-106").at(-1)).toBe("A-106 Demo Faculty Room is the 1st door on the right");

    // Nobody counted this one: only the side, which the drawing does show.
    expect(steps(mustFind(gate, room("demo-a-104")), "demo-a-104").at(-1)).toBe("A-104 Demo Store is on the right (at the east end)");
  });

  it("don't repeat a count that was made from somewhere else", () => {
    // Coming from the east end, "2nd door" as seen from the stairs would be wrong.
    const fromEast = mustFind(inRoom("demo-a-104"), room("demo-a-102"));
    const last = steps(fromEast, "demo-a-102").at(-1)!;
    expect(last).toBe("A-102 Demo Drawing Hall is the 1st door on the left"); // it does pass the stairs

    const fromWest = mustFind(inRoom("demo-a-101"), room("demo-a-102"));
    expect(steps(fromWest, "demo-a-102").at(-1)).toBe("A-102 Demo Drawing Hall is on the right");
  });

  it("say which floor each step is on", () => {
    const found = world.dataset.rooms.find((candidate) => candidate.id === "demo-a-102")!;
    const levels = stepsOf(mustFind(gate, room("demo-a-102")), world.dataset, found, world.plans.get("demo-block-a")!).map((step) => step.level);
    expect(levels).toEqual([null, 0, 0, 0, 1, 1]);
  });

  it("fall back to the hint where there is no plan", () => {
    expect(steps(mustFind(gate, room("demo-b-101")), "demo-b-101").at(-1)).toBe(
      "101 Demo Lecture Hall is on: Floor 1. The way inside is not drawn yet. Hint: top of the main stairs.",
    );
  });

  it("explain a missing step-free way", () => {
    const route: Route = { ...mustFind(gate, room("demo-b-101")), indoorNote: "only-steps" };
    expect(steps(route, "demo-b-101").at(-1)).toContain("The only known way to the room has stairs");
  });

  it("lead out of a building", () => {
    const route = mustFind(inRoom("demo-a-102"), { kind: "place", id: "demo-canteen" });
    const texts = stepsOf(route, world.dataset, null, null).map((step) => step.text);

    expect(texts).toContain("Take the stairs down to Ground floor");
    expect(texts).toContain("Go outside");
    expect(texts.at(-1)).toMatch(/to the destination$/);
  });
});
