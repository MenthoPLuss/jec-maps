import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampusController } from "./controller";
import { published } from "./data/testing";
import type { IndoorPlans } from "./data/published";
import type { LocationProvider, ProviderEvent } from "./location/types";
import type { KeyValueStore } from "./storage";
import { SPOT, at } from "./state/testing";

class FakeProvider implements LocationProvider {
  readonly source = "mock";
  started = 0;
  stopped = 0;
  listeners = new Set<(event: ProviderEvent) => void>();
  start = () => void this.started++;
  stop = () => void this.stopped++;
  subscribe = (listener: (event: ProviderEvent) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  emit(event: ProviderEvent) {
    for (const listener of [...this.listeners]) listener(event);
  }
}

let provider: FakeProvider;
let items: Map<string, string>;
let store: KeyValueStore;
let time: number;
let controller: CampusController;
let loadPlans: ReturnType<typeof vi.fn<(buildingId: string) => Promise<IndoorPlans | null>>>;
const tasks: (() => void)[] = [];

const create = () =>
  new CampusController({
    dataset: published().core,
    provider,
    now: () => time,
    defer: (task) => tasks.push(task),
    store: () => store,
    loadPlans,
  });

const runTasks = () => {
  while (tasks.length > 0) tasks.shift()?.();
};
const fix = (position: [number, number]) => {
  time += 1_000;
  provider.emit({
    type: "fix",
    fix: { position, accuracyM: 8, timestamp: time, speedMps: null, headingDeg: null, source: "mock" },
  });
};
const unlock = () => {
  controller.enableLocation();
  for (let i = 0; i < 3; i++) fix(SPOT.middle);
};

beforeEach(() => {
  vi.useFakeTimers();
  provider = new FakeProvider();
  items = new Map();
  store = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  time = 1_000_000;
  loadPlans = vi.fn(async (buildingId) => published().indoor.find((plans) => plans.buildingId === buildingId) ?? null);
  tasks.length = 0;
  controller = create();
  controller.connect();
});

afterEach(() => {
  controller.disconnect();
  vi.useRealTimers();
});

describe("CampusController", () => {
  it("never starts the GPS by itself", () => {
    controller.restore();
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    vi.advanceTimersByTime(10_000);

    expect(provider.started).toBe(0);
  });

  it("computes a route when one is asked for", () => {
    unlock();
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    expect(controller.getState().navigation.status).toBe("computing");

    runTasks();
    expect(controller.getState().navigation.status).toBe("active");
  });

  it("answers only the latest of two quick changes", () => {
    unlock();
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-hostel" } });
    runTasks();

    const { navigation, destination } = controller.getState();
    expect(destination).toEqual({ kind: "place", id: "demo-hostel" });
    expect(navigation.status === "active" && navigation.route.end).toEqual(
      controller.dataset.places.find((place) => place.properties.id === "demo-hostel")?.geometry.coordinates,
    );
  });

  it("does not compute again for every fix", () => {
    unlock();
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    runTasks();
    fix(at(0, -52));
    fix(at(0, -54));

    expect(tasks).toHaveLength(0);
  });

  it("tells listeners only when something changed", () => {
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.dispatch({ type: "view/closed" });
    const calls = listener.mock.calls.length;
    controller.dispatch({ type: "room/confirmed", roomId: "nope" });

    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("keeps the destination for the next visit, and nothing about the position", () => {
    unlock();
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    controller.dispatch({ type: "settings/avoidStairs", value: true });
    controller.dispatch({ type: "room/confirmed", roomId: "demo-a-101" });

    const saved = [...items.values()].join();
    expect(saved).toContain("demo-canteen");
    expect(saved).not.toContain("demo-a-101");
    expect(saved).not.toContain("94.25");
    expect([...items.keys()].sort()).toEqual(["jec-maps:avoid-stairs", "jec-maps:destination"]);
  });

  it("restores the destination, but never a room", () => {
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    controller.dispatch({ type: "room/confirmed", roomId: "demo-a-101" });

    const next = create();
    next.restore();
    expect(next.getState()).toMatchObject({
      destination: { kind: "place", id: "demo-canteen" },
      confirmed: null,
      fix: null,
    });
  });

  it("forgets the destination when it is cleared", () => {
    controller.dispatch({ type: "destination/set", destination: { kind: "pin", position: at(5, 5) } });
    expect(items.size).toBe(1);
    controller.dispatch({ type: "destination/cleared" });
    expect(items.size).toBe(0);
  });

  it.each(["rubbish", '{"v":1,"value":{"kind":"place","id":"gone"}}', '{"v":1,"value":{"kind":"pin","position":[1,200]}}'])(
    "ignores a stored destination it can't use: %s",
    (text) => {
      items.set("jec-maps:destination", text);
      controller.restore();
      expect(controller.getState().destination).toBeNull();
    },
  );

  it("works without storage", () => {
    store = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    controller.restore();
    controller.dispatch({ type: "destination/set", destination: { kind: "place", id: "demo-canteen" } });
    expect(controller.getState().destination).not.toBeNull();
  });

  it("notices that the signal went quiet", () => {
    unlock();
    fix(SPOT.blockADoor);
    time += 12_000;
    vi.advanceTimersByTime(1_000);

    expect(controller.getState().suggestion?.reason).toBe("signal-lost");
  });

  it("leaves nothing running", () => {
    controller.disconnect();
    expect(provider.stopped).toBe(1);
    expect(provider.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("can be connected again, as React does in development", () => {
    controller.disconnect();
    controller.connect();
    controller.connect();
    expect(provider.listeners.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("floor plans", () => {
  const route = () => {
    const { navigation } = controller.getState();
    return navigation.status === "active" ? navigation.route : null;
  };
  const goTo = (id: string) => {
    controller.dispatch({ type: "destination/set", destination: { kind: "room", id } });
    runTasks();
  };

  it("are downloaded once, and only for buildings that have them", async () => {
    await Promise.all([controller.ensurePlans("demo-block-a"), controller.ensurePlans("demo-block-a")]);
    await controller.ensurePlans("demo-block-a");
    await controller.ensurePlans("demo-library");
    await controller.ensurePlans("../secret");

    expect(loadPlans.mock.calls).toEqual([["demo-block-a"]]);
    expect(controller.getPlans("demo-block-a")?.levels).toHaveLength(2);
    expect(controller.getPlans("demo-library")).toBeNull();
  });

  it("are all downloaded in the same order for everyone", async () => {
    await controller.preloadPlans();
    expect(loadPlans.mock.calls).toEqual([["demo-block-a"]]);
  });

  it("improve a route that ended at the door", async () => {
    unlock();
    goTo("demo-a-102");
    expect(route()).toMatchObject({ enter: null, indoorNote: "no-plan" });

    await controller.ensurePlans("demo-block-a");
    runTasks();
    expect(route()?.enter?.pieces.map((piece) => piece.kind)).toEqual(["walk", "stairs", "walk"]);
  });

  it("that can't be downloaded leave the route to the door, and can be tried again", async () => {
    loadPlans.mockRejectedValueOnce(new Error("offline"));
    unlock();
    goTo("demo-a-102");
    await controller.ensurePlans("demo-block-a");
    expect(route()?.enter).toBeNull();

    await controller.ensurePlans("demo-block-a");
    runTasks();
    expect(route()?.enter).not.toBeNull();
  });

  it("let a route start in the room that the user confirmed", async () => {
    await controller.ensurePlans("demo-block-a");
    unlock();
    controller.dispatch({ type: "room/confirmed", roomId: "demo-a-001" });
    goTo("demo-a-105");

    expect(route()).toMatchObject({ line: [], exit: null });
    expect(route()?.enter?.pieces.map((piece) => piece.kind)).toEqual(["walk", "stairs", "walk"]);
  });
});
