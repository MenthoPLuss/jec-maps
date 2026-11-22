import { beforeEach, describe, expect, it } from "vitest";

import { published } from "../data/testing";
import { containsPoint } from "../geo/area";
import { distanceM } from "../geo/distance";
import { localPlane } from "../geo/localPlane";
import { JEC_CENTRE, type LngLat } from "../geo/types";
import { mockPresets } from "./mockPresets";
import { MockLocationProvider, type Clock } from "./mockProvider";
import type { Fix, ProviderEvent } from "./types";

const plane = localPlane(JEC_CENTRE);
const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);

/** Time that only moves when the test says so. */
class FakeClock implements Clock {
  time = 1_000_000;
  private timers = new Map<number, { callback: () => void; ms: number; next: number }>();
  private nextId = 1;

  now = () => this.time;
  setInterval = (callback: () => void, ms: number) => {
    this.timers.set(this.nextId, { callback, ms, next: this.time + ms });
    return this.nextId++;
  };
  clearInterval = (id: unknown) => void this.timers.delete(id as number);
  get running() {
    return this.timers.size;
  }

  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers.values()].filter((timer) => timer.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      this.time = due.next;
      due.next += due.ms;
      due.callback();
    }
    this.time = end;
  }
}

let clock: FakeClock;
let gps: MockLocationProvider;
let events: ProviderEvent[];
const fixes = (): Fix[] => events.flatMap((event) => (event.type === "fix" ? [event.fix] : []));

beforeEach(() => {
  clock = new FakeClock();
  gps = new MockLocationProvider(JEC_CENTRE, clock);
  events = [];
  gps.subscribe((event) => events.push(event));
});

describe("MockLocationProvider", () => {
  it("sends about one fix per second, marked as mock", () => {
    gps.start();
    clock.advance(5_000);

    expect(fixes()).toHaveLength(6); // one at once, then one per second
    expect(fixes().every((fix) => fix.source === "mock")).toBe(true);
  });

  it("never sends two fixes with the same time", () => {
    gps.start();
    gps.teleport(at(10, 0));
    gps.teleport(at(20, 0));
    const times = fixes().map((fix) => fix.timestamp);

    expect(new Set(times).size).toBe(times.length);
  });

  it("walks at the chosen speed and reports speed and heading", () => {
    gps.start();
    gps.setWalkSpeed(2);
    gps.walk([at(0, 0), at(100, 0)]);
    clock.advance(10_000);
    const last = fixes().at(-1)!;

    expect(distanceM(last.position, at(20, 0))).toBeLessThan(0.1);
    expect(last.speedMps).toBe(2);
    expect(last.headingDeg).toBeCloseTo(90, 0);
  });

  it("stops at the end of the walk", () => {
    gps.start();
    gps.setWalkSpeed(10);
    gps.walk([at(0, 0), at(30, 0)]);
    clock.advance(10_000);

    expect(gps.getState().walking).toBe(false);
    expect(distanceM(fixes().at(-1)!.position, at(30, 0))).toBeLessThan(0.1);
    expect(fixes().at(-1)).toMatchObject({ speedMps: 0, headingDeg: null });
  });

  it("can pause and go on", () => {
    gps.start();
    gps.walk([at(0, 0), at(100, 0)]);
    clock.advance(2_000);
    gps.pauseWalk();
    const paused = gps.getState().position;
    clock.advance(20_000);
    expect(gps.getState().position).toEqual(paused);

    gps.resumeWalk();
    clock.advance(1_000);
    expect(distanceM(paused, gps.getState().position)).toBeCloseTo(1.4, 1);
  });

  it("goes silent without a signal, and comes back", () => {
    gps.start();
    gps.setSignal(false);
    clock.advance(5_000);
    expect(fixes()).toHaveLength(1);

    gps.setSignal(true);
    clock.advance(1_000);
    expect(fixes()).toHaveLength(2);
  });

  it("repeats the same jitter after a reset", () => {
    const record = () => {
      events = [];
      gps.reset();
      gps.setJitter(15);
      clock.advance(6_000);
      return fixes()
        .slice(1)
        .map((fix) => fix.position);
    };
    gps.start();
    const first = record();

    expect(new Set(first.map(String)).size).toBe(first.length); // it does jitter
    for (const position of first) expect(distanceM(position, JEC_CENTRE)).toBeLessThanOrEqual(15.01);
    expect(record()).toEqual(first);
  });

  it("can pretend every problem", () => {
    gps.start();
    for (const problem of ["denied", "unavailable", "timeout", "insecure", "unsupported"] as const) gps.fail(problem);

    expect(events.slice(1).map((event) => event.type === "problem" && event.problem)).toEqual([
      "denied",
      "unavailable",
      "timeout",
      "insecure",
      "unsupported",
    ]);
  });

  it("leaves no timer behind", () => {
    gps.start();
    gps.start();
    expect(clock.running).toBe(1);
    gps.stop();
    expect(clock.running).toBe(0);

    gps.teleport(at(5, 5));
    expect(fixes()).toHaveLength(2); // none after stop
  });
});

describe("mockPresets", () => {
  const { core } = published();
  const run = (id: string) => {
    gps.start();
    gps.run(mockPresets(core).find((preset) => preset.id === id)!.steps);
  };
  const inside = (fix: Fix) => containsPoint(core.boundary!.geometry, fix.position);

  it("walk from outside into the campus", () => {
    run("walk-in");
    clock.advance(1_000);
    expect(inside(fixes().at(-1)!)).toBe(false);
    clock.advance(40_000);
    expect(inside(fixes().at(-1)!)).toBe(true);
    expect(gps.getState().walkSpeedMps).toBe(1.4);
  });

  it("walk out again", () => {
    run("walk-out");
    clock.advance(60_000);
    expect(inside(fixes().at(-1)!)).toBe(false);
  });

  it("stand far away", () => {
    run("far-away");
    expect(distanceM(fixes().at(-1)!.position, JEC_CENTRE)).toBeGreaterThan(2_000);
  });

  it("flip over the boundary", () => {
    run("boundary-jitter");
    clock.advance(40_000);
    const sides = new Set(fixes().slice(3).map(inside));
    expect(sides.size).toBe(2);
  });

  it("lose the signal at a door", () => {
    run("entrance-lost");
    clock.advance(20_000);
    const last = fixes().at(-1)!;
    const door = core.entrances.find((entrance) => entrance.properties.indoorNodeId)!;

    expect(distanceM(last.position, door.geometry.coordinates)).toBeLessThan(1);
    expect(clock.time - last.timestamp).toBeGreaterThan(5_000);
  });

  it("stand between two buildings", () => {
    run("two-buildings");
    const near = core.entrances.filter(
      (entrance) => distanceM(entrance.geometry.coordinates, fixes().at(-1)!.position) < 12,
    );
    expect(new Set(near.map((entrance) => entrance.properties.buildingId)).size).toBe(2);
  });

  it("need a boundary", () => {
    expect(mockPresets({ ...core, boundary: null })).toEqual([]);
  });
});
