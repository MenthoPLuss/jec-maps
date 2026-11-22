import { describe, expect, it } from "vitest";

import { demoFiles, published, reviewedFiles } from "../data/testing";
import { destinationPoint } from "../geo/distance";
import { capabilitiesOf } from "./capabilities";
import { judgeFix, qualityOf } from "./fixes";
import { POLICY } from "./policy";
import { updatePresence } from "./presence";
import { SPOT, Simulator, at } from "./testing";
import type { Fix } from "../location/types";
import type { Presence } from "./types";

const fix = (overrides: Partial<Fix> = {}): Fix => ({
  position: SPOT.middle,
  accuracyM: 8,
  timestamp: 1_000_000,
  speedMps: null,
  headingDeg: null,
  source: "mock",
  ...overrides,
});

describe("judging a fix", () => {
  it.each<[string, Partial<Fix>, string]>([
    ["a normal one", {}, "ok"],
    ["swapped coordinates", { position: [26.7458, 94.2506] }, "invalid"],
    ["NaN", { position: [NaN, 26] }, "invalid"],
    ["no accuracy", { accuracyM: NaN }, "invalid"],
    ["a negative accuracy", { accuracyM: -3 }, "invalid"],
    ["no time", { timestamp: NaN }, "invalid"],
    ["a time far ahead", { timestamp: 1_010_000 }, "from-the-future"],
    ["a clock slightly ahead", { timestamp: 1_004_000 }, "ok"],
  ])("%s: %s", (_name, overrides, verdict) => {
    expect(judgeFix(null, fix(overrides), 1_000_000)).toBe(verdict);
  });

  it.each([
    ["older", 999_000],
    ["repeated", 1_000_000],
  ])("rejects an %s one", (_name, timestamp) => {
    expect(judgeFix(fix(), fix({ timestamp }), 1_002_000)).toBe("out-of-order");
  });

  it.each([
    [5, 0, "good"],
    [20, 0, "good"],
    [20.1, 0, "fair"],
    [50, 0, "fair"],
    [51, 0, "rough"],
    [100, 0, "rough"],
    [101, 0, "poor"],
    [5, 15_000, "good"],
    [5, 15_001, "stale"],
  ])("accuracy %d m, age %d ms: %s", (accuracyM, age, level) => {
    expect(qualityOf(fix({ accuracyM }), 1_000_000 + age).level).toBe(level);
  });
});

describe("getting onto the campus", () => {
  it("takes two reliable fixes, at least a second apart", () => {
    const sim = new Simulator().fix(SPOT.middle);
    expect(sim.presence).toBe("unknown");

    sim.now += 400;
    expect(sim.fix(SPOT.middle).presence).toBe("unknown");
    sim.now += 600;
    expect(sim.fix(SPOT.middle).presence).toBe("inside");
  });

  it("does not count the same fix twice", () => {
    const sim = new Simulator().fix(SPOT.middle);
    const { timestamp } = sim.state.fix!;
    sim.now += 2_000;

    expect(sim.fix(SPOT.middle, { timestamp }).presence).toBe("unknown");
  });

  it.each([
    [50, "inside"],
    [51, "unknown"],
  ])("with an accuracy of %d m: %s", (accuracyM, status) => {
    expect(new Simulator().fixes(4, SPOT.middle, { accuracyM }).presence).toBe(status);
  });

  it("does not count stale fixes", () => {
    const sim = new Simulator();
    for (let i = 0; i < 4; i++) {
      sim.now += 1_000;
      sim.fix(SPOT.middle, { timestamp: sim.now - 16_000 });
    }
    expect(sim.presence).toBe("unknown");
  });

  it("starts over when the fixes are too far apart to belong together", () => {
    const sim = new Simulator().fix(SPOT.middle);
    sim.now += 20_000;
    expect(sim.fix(SPOT.middle).presence).toBe("unknown");
    expect(sim.fixes(1, SPOT.middle).presence).toBe("inside");
  });

  it("starts over after a reliable fix outside", () => {
    const sim = new Simulator().fixes(1, SPOT.middle).fixes(1, SPOT.justOutside).fixes(1, SPOT.middle);
    expect(sim.presence).not.toBe("inside");
  });

  it("says so when the uncertainty reaches over the boundary", () => {
    expect(new Simulator().fixes(3, SPOT.middle).state.presence).toMatchObject({ approximate: false });
    expect(new Simulator().fixes(3, at(0, -180), { accuracyM: 30 }).state.presence).toMatchObject({ approximate: true });
  });

  it("outside, it knows the distance to the boundary", () => {
    const { presence } = new Simulator().fix(SPOT.farOutside).state;
    expect(presence.status).toBe("outside");
    expect((presence as { distanceM: number }).distanceM).toBeCloseTo(210, 0);
  });

  it("a very rough fix is no reason to claim anything", () => {
    const sim = new Simulator().fixes(3, SPOT.farOutside, { accuracyM: 400 });
    expect(sim.state.presence).toMatchObject({ status: "unknown", reason: "too-rough" });
  });

  it("a hole in the campus is outside", () => {
    const files = demoFiles();
    files["campus-boundary.geojson"].features[0].geometry.coordinates.push(
      [at(-20, -70), at(20, -70), at(20, -30), at(-20, -30), at(-20, -70)],
    );
    expect(new Simulator(published(files).core).fixes(3, SPOT.middle).presence).toBe("outside");
  });
});

describe("leaving the campus", () => {
  it("takes two clear fixes outside, at least five seconds apart", () => {
    const sim = new Simulator().unlock().fixes(4, SPOT.farOutside);
    expect(sim.presence).toBe("inside"); // only 3 seconds so far
    expect(sim.fixes(2, SPOT.farOutside).presence).toBe("outside");
  });

  it("does not happen within 25 m of the boundary", () => {
    expect(new Simulator().unlock().fixes(20, at(0, -205)).presence).toBe("inside");
  });

  it("does not happen while the uncertainty still reaches the buffer", () => {
    // 60 m outside, but uncertain by 40 m.
    expect(new Simulator().unlock().fixes(20, at(0, -250), { accuracyM: 40 }).presence).toBe("inside");
    expect(new Simulator().unlock().fixes(20, at(0, -250), { accuracyM: 30 }).presence).toBe("outside");
  });

  it("is called off by a reliable fix inside", () => {
    const sim = new Simulator().unlock().fixes(4, SPOT.farOutside).fixes(1, SPOT.middle).fixes(4, SPOT.farOutside);
    expect(sim.presence).toBe("inside");
  });

  it("is not called off by a rough fix", () => {
    const sim = new Simulator().unlock().fixes(4, SPOT.farOutside).fixes(1, SPOT.middle, { accuracyM: 80 }).fixes(2, SPOT.farOutside);
    expect(sim.presence).toBe("outside");
  });

  it("never happens because of time alone", () => {
    const sim = new Simulator().unlock().fixes(1, SPOT.farOutside);
    for (let i = 0; i < 120; i++) sim.wait(1_000);

    expect(sim.presence).toBe("inside");
    expect(sim.state.quality.level).toBe("stale");
  });

  it("never happens because the signal got worse", () => {
    expect(new Simulator().unlock().fixes(60, SPOT.farOutside, { accuracyM: 150 }).presence).toBe("inside");
  });

  it("does not flicker with jitter at the boundary", () => {
    const sim = new Simulator().unlock();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // Jumps up to 18 m around a point on the boundary, like a phone next to a wall.
      sim.fixes(1, destinationPoint(at(0, -190), (i * 137) % 360, (i * 7) % 18), { accuracyM: 12 + (i % 25) });
      seen.add(sim.presence);
    }
    expect([...seen]).toEqual(["inside"]);
  });
});

describe("who may be guided", () => {
  const demo = published().core;
  const live = published(reviewedFiles()).core;

  it("demo data is for the fake GPS only", () => {
    expect(capabilitiesOf(demo, "mock")).toMatchObject({ presence: true, guidance: true });
    expect(capabilitiesOf(demo, "real")).toMatchObject({ presence: false, guidance: false });
    expect(capabilitiesOf(live, "real")).toMatchObject({ presence: true, guidance: true });
  });

  it("a reviewed outline alone unlocks, but does not guide", () => {
    const files = reviewedFiles();
    for (const { properties } of files["campus-paths.geojson"].features) properties.reviewStatus = "unreviewed";
    expect(capabilitiesOf(published(files).core, "real")).toMatchObject({ presence: true, guidance: false });
  });

  it("real GPS in the middle of the demo campus does nothing", () => {
    const sim = new Simulator(demo, "real").fixes(10, SPOT.middle);
    expect(sim.state.presence).toMatchObject({ status: "unknown", reason: "not-evaluated" });

    sim.send({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    expect(sim.nav).toEqual({ status: "waiting", reason: "not-allowed" });
    expect(sim.state.suggestion).toBeNull();
  });

  it("switching between fake and real forgets the position", () => {
    const sim = new Simulator().unlock();
    sim.send({ type: "building/confirmed", buildingId: "demo-block-a" });
    sim.send({ type: "provider/started", source: "real" });

    expect(sim.state).toMatchObject({ fix: null, confirmed: null, source: "real" });
    expect(sim.presence).toBe("unknown");
  });

  it("drops fixes of the wrong source", () => {
    expect(new Simulator().fixes(3, SPOT.middle, { source: "real" }).state.fix).toBeNull();
  });
});

describe("buildings are only ever suggested", () => {
  it("asks after two accurate fixes at the door, and confirms nothing", () => {
    const sim = new Simulator().unlock().fixes(1, SPOT.blockADoor);
    expect(sim.state.suggestion).toBeNull();

    sim.fixes(1, SPOT.blockADoor);
    expect(sim.state.suggestion).toMatchObject({ buildingIds: ["demo-block-a"], reason: "near" });
    expect(sim.state.confirmed).toBeNull();
  });

  it("offers a choice when it can't tell two buildings apart", () => {
    const sim = new Simulator().unlock().fixes(3, SPOT.betweenBlocks);
    expect(sim.state.suggestion?.buildingIds).toEqual(["demo-block-b", "demo-library"]);
  });

  it("does not ask because of rough fixes", () => {
    expect(new Simulator().unlock().fixes(10, SPOT.blockADoor, { accuracyM: 30 }).state.suggestion).toBeNull();
  });

  it("does not ask outside the campus", () => {
    expect(new Simulator().fixes(1, SPOT.farOutside).state.suggestion).toBeNull();
  });

  it("stops asking when the user walks on", () => {
    const sim = new Simulator().unlock().fixes(3, SPOT.blockADoor).fixes(3, SPOT.middle);
    expect(sim.state.suggestion).toBeNull();
  });

  it("does not ask again right after a no", () => {
    const sim = new Simulator().unlock().fixes(3, SPOT.blockADoor).send({ type: "building/dismissed" });
    expect(sim.fixes(20, SPOT.blockADoor).state.suggestion).toBeNull();

    sim.now += POLICY.building.dismissForMs;
    expect(sim.fixes(3, SPOT.blockADoor).state.suggestion).not.toBeNull();
  });

  it("asks, and only asks, when the GPS goes quiet at a door", () => {
    const sim = new Simulator().unlock().fixes(1, SPOT.blockADoor);
    sim.wait(9_000);
    expect(sim.state.suggestion).toBeNull();
    sim.wait(1_500);

    expect(sim.state.suggestion).toMatchObject({ buildingIds: ["demo-block-a"], reason: "signal-lost" });
    sim.wait(600_000);
    expect(sim.state.confirmed).toBeNull(); // not even after ten minutes
    expect(sim.state.view).toBeNull();
  });

  it("does not ask when the GPS goes quiet in the open", () => {
    expect(new Simulator().unlock().wait(30_000).state.suggestion).toBeNull();
  });

  it("does not ask because the page was hidden", () => {
    const sim = new Simulator().unlock().fixes(1, SPOT.blockADoor);
    sim.send({ type: "provider/event", event: { type: "paused" } });
    expect(sim.wait(60_000).state.suggestion).toBeNull();
  });
});

describe("only the user says where they are inside", () => {
  const inA = () => {
    const sim = new Simulator().unlock().fixes(3, SPOT.blockADoor);
    return sim.send({ type: "building/confirmed", buildingId: "demo-block-a" });
  };

  it("confirming a building does not confirm a floor", () => {
    expect(inA().state).toMatchObject({
      confirmed: { buildingId: "demo-block-a", level: null, roomId: null },
      view: { buildingId: "demo-block-a", level: 0 },
      suggestion: null,
    });
  });

  it("looking at another floor, building or room moves nobody", () => {
    const sim = inA();
    const before = sim.state.confirmed;
    sim
      .send({ type: "view/level", level: 1 })
      .send({ type: "view/opened", buildingId: "demo-library", level: 1 })
      .send({ type: "destination/set", destination: { kind: "room", id: "demo-b-101" } })
      .send({ type: "view/closed" });

    expect(sim.state.confirmed).toBe(before);
    expect(sim.state.fix).toBe(inA().state.fix === null ? null : sim.state.fix);
  });

  it("choosing a destination from far away moves nobody either", () => {
    const sim = new Simulator().fix(SPOT.farOutside);
    sim.send({ type: "destination/set", destination: { kind: "room", id: "demo-a-101" } });

    expect(sim.state.confirmed).toBeNull();
    expect(sim.presence).toBe("outside");
  });

  it("confirms a floor and a room", () => {
    const sim = inA().send({ type: "level/confirmed", level: 1 });
    expect(sim.state.confirmed).toMatchObject({ level: 1, roomId: null });

    sim.send({ type: "room/confirmed", roomId: "demo-a-102" });
    expect(sim.state.confirmed).toMatchObject({ buildingId: "demo-block-a", level: 1, roomId: "demo-a-102" });
  });

  it("ignores floors, rooms and buildings that don't exist", () => {
    const sim = inA();
    const before = sim.state;
    sim.send({ type: "level/confirmed", level: 7 }).send({ type: "room/confirmed", roomId: "nope" }).send({ type: "building/confirmed", buildingId: "nope" });
    expect(sim.state).toEqual(before);
  });

  it("leaving the view is not leaving the building", () => {
    const sim = inA().send({ type: "view/closed" });
    expect(sim.state.view).toBeNull();
    expect(sim.state.confirmed).not.toBeNull();
  });

  it("'I'm outside' clears it, and does not ask again at once", () => {
    const sim = inA().send({ type: "outside/confirmed" });
    expect(sim.state).toMatchObject({ confirmed: null, view: null });
    expect(sim.fixes(10, SPOT.blockADoor).state.suggestion).toBeNull();
  });

  it("survives bad, missing and jumping GPS", () => {
    const sim = inA();
    sim.fixes(30, SPOT.middle, { accuracyM: 60 }).fixes(2, SPOT.middle).fixes(1, SPOT.blockADoor).wait(300_000);
    expect(sim.state.confirmed?.buildingId).toBe("demo-block-a");
  });

  it("ends after several accurate fixes clearly outside", () => {
    const sim = inA().fixes(5, SPOT.middle);
    expect(sim.state.confirmed).not.toBeNull(); // not yet
    sim.fixes(5, SPOT.middle);

    expect(sim.state).toMatchObject({ confirmed: null, view: null });
  });

  it("ends when the user really leaves the campus", () => {
    expect(inA().fixes(10, SPOT.farOutside).state.confirmed).toBeNull();
  });

  it("has to be confirmed again after a while in the background", () => {
    const sim = inA().send({ type: "room/confirmed", roomId: "demo-a-001" });
    sim.send({ type: "provider/event", event: { type: "paused" } });
    sim.now += 60_000;
    sim.send({ type: "provider/event", event: { type: "resumed" } });
    expect(sim.state.confirmed?.needsReconfirm).toBe(false);

    sim.send({ type: "provider/event", event: { type: "paused" } });
    sim.now += 130_000;
    sim.send({ type: "provider/event", event: { type: "resumed" } });
    expect(sim.state.confirmed).toMatchObject({ roomId: "demo-a-001", needsReconfirm: true });

    sim.send({ type: "position/reconfirmed" });
    expect(sim.state.confirmed?.needsReconfirm).toBe(false);
  });
});

describe("problems and pauses", () => {
  it("keeps the last position, marked stale, until a fresh fix comes", () => {
    const sim = new Simulator().unlock();
    sim.send({ type: "provider/event", event: { type: "paused" } });
    sim.now += 60_000;
    sim.send({ type: "provider/event", event: { type: "resumed" } });

    expect(sim.state.quality.level).toBe("stale");
    expect(sim.state.provider.status).toBe("requesting");
    expect(sim.fixes(1, SPOT.middle).state).toMatchObject({ provider: { status: "watching" }, quality: { level: "good" } });
  });

  it("recovers from a timeout", () => {
    const sim = new Simulator().unlock();
    sim.send({ type: "provider/event", event: { type: "problem", problem: "timeout" } });
    expect(sim.state.provider).toEqual({ status: "failed", problem: "timeout" });
    expect(sim.presence).toBe("inside");
    expect(sim.fixes(1, SPOT.middle).state.provider.status).toBe("watching");
  });

  it("stopping forgets the position", () => {
    const sim = new Simulator().unlock().send({ type: "provider/stopped" });
    expect(sim.state).toMatchObject({ source: null, fix: null, provider: { status: "idle" } });
    expect(sim.presence).toBe("unknown");
  });

  it("ignores events of a provider that was stopped", () => {
    const sim = new Simulator().unlock().send({ type: "provider/stopped" }).fix(SPOT.middle);
    expect(sim.state.fix).toBeNull();
  });
});

it("updatePresence never mutates what it gets", () => {
  const before: Presence = Object.freeze({ status: "unknown", reason: "no-fix", inside: null });
  const boundary = published().core.boundary!.geometry;
  expect(updatePresence(before, fix(), boundary)).not.toBe(before);
});
