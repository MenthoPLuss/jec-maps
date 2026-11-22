import { describe, expect, it } from "vitest";

import { published, demoFiles, record, reviewedFiles } from "../data/testing";
import type { Fix } from "../location/types";
import { isDestination, destinationInfo, routeTarget } from "./destination";
import { isPaused, initialSpeed, updateSpeed } from "./speed";
import { SPOT, Simulator, at } from "./testing";
import type { ActiveNavigation, Destination } from "./types";

const canteen: Destination = { kind: "place", id: "demo-canteen" };
const set = (destination: Destination) => ({ type: "destination/set", destination }) as const;
const active = (sim: Simulator): ActiveNavigation => {
  if (sim.nav.status !== "active") throw new Error(`not active but ${sim.nav.status}`);
  return sim.nav;
};

describe("starting", () => {
  it("waits for a position, then for the campus, then begins by itself", () => {
    const sim = new Simulator().send(set(canteen));
    expect(sim.nav).toEqual({ status: "waiting", reason: "no-position" });

    sim.fix(SPOT.farOutside);
    expect(sim.nav).toEqual({ status: "waiting", reason: "outside" });

    sim.unlock().solve();
    expect(sim.nav.status).toBe("active");
  });

  it("does not start from a stale position", () => {
    const sim = new Simulator().unlock().wait(20_000).send(set(canteen));
    expect(sim.nav).toEqual({ status: "waiting", reason: "no-position" });
  });

  it("ignores destinations that don't exist", () => {
    const sim = new Simulator().unlock().send(set({ kind: "place", id: "nope" }));
    expect(sim.state.destination).toBeNull();
  });

  it("drops an answer to an older question", () => {
    const sim = new Simulator().unlock().send(set(canteen));
    const old = sim.nav as { requestId: number };
    sim.send(set({ kind: "place", id: "demo-hostel" }));
    const result = { ok: false, reason: "not-connected", straightLineM: 1 } as const;
    sim.send({ type: "route/computed", requestId: old.requestId, result });
    expect(sim.nav.status).toBe("computing"); // still waiting for the hostel

    sim.solve();
    expect(active(sim).route.end).toEqual(destinationInfo(sim.world.dataset, { kind: "place", id: "demo-hostel" })!.position);
  });

  it("drops an answer that comes after the destination was cleared", () => {
    const sim = new Simulator().unlock().send(set(canteen));
    const { requestId } = sim.nav as { requestId: number };
    sim.send({ type: "destination/cleared" });
    sim.send({ type: "route/computed", requestId, result: { ok: false, reason: "not-connected", straightLineM: 1 } });
    expect(sim.nav).toEqual({ status: "idle" });
  });
});

describe("walking", () => {
  it("counts down without computing a new route for every fix", () => {
    const sim = new Simulator().unlock(SPOT.insideByGate).send(set(canteen)).solve();
    const { route } = active(sim);
    const total = active(sim).progress.remainingM;
    sim.walk(at(0, -150), at(0, -100));

    expect(active(sim).route).toBe(route);
    expect(active(sim).progress.remainingM).toBeCloseTo(total - 50, 0);
  });

  it("freezes when the signal is lost", () => {
    const sim = new Simulator().unlock(SPOT.insideByGate).send(set(canteen)).solve().walk(at(0, -150), at(0, -120));
    const before = active(sim).progress;
    sim.wait(60_000);

    expect(active(sim).progress).toEqual(before);
  });

  it("finds a new route after really leaving this one", () => {
    const sim = new Simulator().unlock(SPOT.insideByGate).send(set(canteen)).solve();
    const { route } = active(sim);
    // Past the turn to the canteen, north along the avenue.
    sim.walk(at(0, -150), at(0, -20));

    expect(active(sim).route).not.toBe(route);
    expect(active(sim).progress.remainingM).toBeGreaterThan(100);
  });

  it("drops a route that is still being computed on leaving the campus", () => {
    const sim = new Simulator().unlock().send(set(canteen)).fixes(10, SPOT.farOutside);
    expect(sim.nav).toEqual({ status: "waiting", reason: "outside" });
  });

  it("is not fooled by one stray fix", () => {
    const sim = new Simulator().unlock(SPOT.insideByGate).send(set(canteen)).solve();
    const { route } = active(sim);
    sim.fixes(2, at(70, -130)).fixes(1, SPOT.insideByGate).fixes(2, at(70, -130)).fixes(1, SPOT.insideByGate);

    expect(active(sim).route).toBe(route);
  });

  it("does not reroute while the signal is too rough to tell", () => {
    const sim = new Simulator().unlock(SPOT.insideByGate).send(set(canteen)).solve();
    const { route } = active(sim);
    sim.fixes(20, at(40, -140), { accuracyM: 60 });

    expect(active(sim).route).toBe(route);
  });

  it("pauses on leaving the campus and goes on after coming back", () => {
    const sim = new Simulator().unlock(SPOT.insideByGate).send(set(canteen)).solve().fixes(10, SPOT.farOutside);
    expect(sim.nav).toEqual({ status: "waiting", reason: "outside" });

    sim.unlock(SPOT.insideByGate).solve();
    expect(sim.nav.status).toBe("active");
  });
});

describe("arriving", () => {
  const nearCanteen = () => new Simulator().unlock(at(-40, -96)).send(set(canteen)).solve();
  const atCanteen = at(-90, -96);

  it("takes two accurate fixes, three seconds apart", () => {
    const sim = nearCanteen().fixes(3, atCanteen);
    expect(sim.nav.status).toBe("active");
    expect(sim.fixes(1, atCanteen).nav).toEqual({ status: "arrived", how: "gps" });
  });

  it("never happens with a rough signal: then it says near", () => {
    const sim = nearCanteen().fixes(30, atCanteen, { accuracyM: 25 });
    expect(active(sim).proximity).toBe("near");
  });

  it("can always be confirmed by the user", () => {
    const sim = nearCanteen().fixes(3, atCanteen, { accuracyM: 40 }).send({ type: "arrival/confirmed" });
    expect(sim.nav).toEqual({ status: "arrived", how: "manual" });
  });

  it("does not happen by running past", () => {
    const sim = nearCanteen().fixes(2, atCanteen).fixes(1, at(-40, -96)).fixes(2, atCanteen);
    expect(sim.nav.status).toBe("active");
  });

  it("does not happen while a long way round is left", () => {
    // Next to the pin in a straight line, but the path there is long.
    const sim = new Simulator().unlock(at(0, 108)).send(set({ kind: "pin", position: at(0, 108) })).solve();
    const nav = active(sim);
    sim.state = { ...sim.state, navigation: { ...nav, route: { ...nav.route, line: [at(0, 108), at(200, 108), at(0, 109)], totalM: 400 }, progress: { alongM: 0, remainingM: 400, offM: 0 } } };
    sim.fixes(6, at(0, 108));

    expect(sim.nav.status).toBe("active");
  });

  it("happens once, and the position is still followed", () => {
    const sim = nearCanteen().fixes(6, atCanteen);
    const arrived = sim.nav;
    sim.fixes(10, at(-60, -96));

    expect(sim.nav).toBe(arrived);
    expect(sim.state.fix?.position).toEqual(at(-60, -96));
    expect(sim.presence).toBe("inside");
  });

  it("at the door of a building is an arrival at the building", () => {
    const sim = new Simulator().unlock(at(-80, -10)).send(set({ kind: "building", id: "demo-block-a" })).solve();
    expect(active(sim).route.entranceId).toBe("demo-block-a-main");
    expect(sim.fixes(5, at(-80, 18)).nav).toEqual({ status: "arrived", how: "gps" });
  });

  it("at the door is not an arrival in a room upstairs", () => {
    const sim = new Simulator().unlock(at(-80, -10)).send(set({ kind: "room", id: "demo-a-101" })).solve();
    sim.fixes(30, at(-80, 18));
    expect(active(sim).proximity).toBe("entrance");

    sim.send({ type: "room/confirmed", roomId: "demo-a-101" });
    expect(sim.nav).toEqual({ status: "arrived", how: "manual" });
  });

  it("another room is no arrival", () => {
    const sim = new Simulator().unlock(at(-80, -10)).send(set({ kind: "room", id: "demo-a-101" })).solve();
    sim.send({ type: "room/confirmed", roomId: "demo-a-102" });
    expect(sim.nav.status).toBe("active");
  });
});

describe("cancelling and restarting", () => {
  it("keeps the destination", () => {
    const sim = new Simulator().unlock().send(set(canteen)).solve().send({ type: "route/cancelled" });
    expect(sim.nav).toEqual({ status: "cancelled" });
    expect(sim.state.destination).toEqual(canteen);

    sim.fixes(10, SPOT.insideByGate);
    expect(sim.nav).toEqual({ status: "cancelled" }); // stays cancelled

    sim.send({ type: "route/restarted" }).solve();
    expect(sim.nav.status).toBe("active");
  });

  it("starts again after an arrival", () => {
    const sim = new Simulator().unlock().send(set(canteen)).solve().send({ type: "arrival/confirmed" });
    sim.send({ type: "route/restarted" }).solve();
    expect(sim.nav.status).toBe("active");
  });

  it("clearing removes everything", () => {
    const sim = new Simulator().unlock().send(set(canteen)).solve().send({ type: "destination/cleared" });
    expect(sim.state).toMatchObject({ destination: null, navigation: { status: "idle" } });
  });
});

describe("no route", () => {
  const pin = (x: number, y: number): Destination => ({ kind: "pin", position: at(x, y) });

  it("gives a straight line and the reason", () => {
    const sim = new Simulator().unlock().send(set(pin(-180, 150))).solve();
    expect(sim.nav).toMatchObject({ status: "no-route", reason: "target-off-network" });
  });

  it("tries again after moving on, but not for every fix", () => {
    const sim = new Simulator().unlock().send(set(pin(-180, 150))).solve();
    sim.fixes(5, at(0, -52));
    expect(sim.nav.status).toBe("no-route");
    expect(sim.fixes(1, at(0, -80)).nav.status).toBe("computing");
  });

  it("still notices an arrival at a pin", () => {
    const sim = new Simulator().unlock(at(40, -50)).send(set(pin(45, -50))).solve();
    expect(sim.nav.status).toBe("no-route"); // 40 m from the nearest path
    expect(sim.fixes(5, at(44, -50)).nav).toEqual({ status: "arrived", how: "gps" });
  });

  it("never arrives in the middle of a building without a door", () => {
    const files = demoFiles();
    for (const id of ["demo-block-a-main", "demo-block-a-rear"]) record(files, "entrances.geojson", id).access = "closed";
    const sim = new Simulator(published(files).core).unlock(at(-80, -10)).send(set({ kind: "building", id: "demo-block-a" })).solve();
    expect(sim.nav).toMatchObject({ status: "no-route", reason: "no-entrance" });

    sim.fixes(20, at(-80, 39));
    expect(sim.nav.status).not.toBe("arrived");
  });
});

describe("avoiding stairs", () => {
  it("asks for another route at once", () => {
    const sim = new Simulator().unlock(at(88, 38)).send(set({ kind: "place", id: "demo-parking" })).solve();
    expect(active(sim).route.legs.some((leg) => leg.steps)).toBe(true);

    sim.send({ type: "settings/avoidStairs", value: true }).solve();
    expect(active(sim).route.legs.some((leg) => leg.steps)).toBe(false);
    expect(active(sim).route.totalM).toBeGreaterThan(200);
  });
});

describe("doors", () => {
  it("restricted doors are never offered", () => {
    const { core } = published();
    const target = routeTarget(core, { kind: "building", id: "demo-block-a" });
    expect(target?.kind === "entrances" && target.options.map((option) => option.entranceId)).toEqual(["demo-block-a-main"]);
  });

  it("doors with unknown access are a last resort, and say so", () => {
    const files = demoFiles();
    record(files, "entrances.geojson", "demo-library-west").access = "unknown";
    const target = routeTarget(published(files).core, { kind: "building", id: "demo-library" });
    expect(target?.kind === "entrances" && target.options).toMatchObject([{ entranceId: "demo-library-west", accessUnknown: true }]);
  });

  it("in live data only reviewed doors count", () => {
    const files = reviewedFiles();
    record(files, "entrances.geojson", "demo-block-b-main").reviewStatus = "unreviewed";
    const target = routeTarget(published(files).core, { kind: "building", id: "demo-block-b" });
    expect(target?.kind === "entrances" && target.options.map((option) => option.entranceId)).toEqual(["demo-block-b-east"]);
  });
});

describe("walking speed", () => {
  const fix = (seconds: number, x: number, overrides: Partial<Fix> = {}): Fix => ({
    position: at(x, 0),
    accuracyM: 6,
    timestamp: 1_000_000 + seconds * 1_000,
    speedMps: null,
    headingDeg: null,
    source: "mock",
    ...overrides,
  });
  const learn = (fixes: Fix[]) => fixes.reduce(updateSpeed, initialSpeed);

  it("starts at 1.35 m/s", () => {
    expect(initialSpeed.mps).toBe(1.35);
  });

  it("learns a faster pace, within limits", () => {
    const fast = learn(Array.from({ length: 60 }, (_, i) => fix(i, i * 1.8)));
    expect(fast.mps).toBeCloseTo(1.8, 1);

    const run = learn(Array.from({ length: 60 }, (_, i) => fix(i, i * 2.9)));
    expect(run.mps).toBe(2);
  });

  it("prefers what the phone says", () => {
    expect(learn(Array.from({ length: 60 }, (_, i) => fix(i, 0, { speedMps: 1 }))).mps).toBeCloseTo(1, 1);
  });

  it("learns nothing from standing, jitter, teleports or a rough signal", () => {
    expect(learn([fix(0, 0), fix(1, 0.4), fix(2, 0.1), fix(3, 0.5)]).mps).toBe(1.35);
    expect(learn([fix(0, 0), fix(1, 400), fix(2, 900)]).mps).toBe(1.35);
    expect(learn([fix(0, 0, { accuracyM: 40 }), fix(1, 1.9, { accuracyM: 40 })]).mps).toBe(1.35);
    expect(learn([fix(0, 0), fix(1, 8, { speedMps: 8 })]).mps).toBe(1.35);
  });

  it("notices a pause", () => {
    const walking = learn([fix(0, 0), fix(1, 1.4), fix(2, 2.8)]);
    expect(isPaused(walking, 1_000_000 + 5_000)).toBe(false);

    const standing = [fix(5, 2.8), fix(13, 2.8)].reduce(updateSpeed, walking);
    expect(isPaused(standing, 1_000_000 + 13_000)).toBe(true);
  });
});

describe("isDestination", () => {
  it.each<[unknown, boolean]>([
    [{ kind: "place", id: "x" }, true],
    [{ kind: "pin", position: [94.25, 26.74] }, true],
    [{ kind: "pin", position: [26.74, 94.25] }, false],
    [{ kind: "pin" }, false],
    [{ kind: "place" }, false],
    [{ kind: "planet", id: "x" }, false],
    [null, false],
    ["place", false],
  ])("%j: %s", (value, expected) => {
    expect(isDestination(value)).toBe(expected);
  });
});
