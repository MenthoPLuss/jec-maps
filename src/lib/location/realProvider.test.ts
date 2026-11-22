import { beforeEach, describe, expect, it } from "vitest";

import { RealLocationProvider, toFix, type RealProviderEnvironment } from "./realProvider";
import type { ProviderEvent } from "./types";

/** A browser whose GPS does what the test says. */
class FakeBrowser implements RealProviderEnvironment {
  watches = new Map<number, { success: PositionCallback; error: PositionErrorCallback; options?: PositionOptions }>();
  history: number[] = [];
  isSecureContext = true;
  hidden = false;
  private nextId = 1;
  private visibilityListeners = new Set<() => void>();

  geolocation: RealProviderEnvironment["geolocation"] = {
    watchPosition: (success, error, options) => {
      const id = this.nextId++;
      this.watches.set(id, { success, error: error as PositionErrorCallback, options });
      this.history.push(id);
      return id;
    },
    clearWatch: (id) => void this.watches.delete(id),
  };

  isHidden = () => this.hidden;
  onVisibilityChange = (listener: () => void) => {
    this.visibilityListeners.add(listener);
    return () => this.visibilityListeners.delete(listener);
  };

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    for (const listener of [...this.visibilityListeners]) listener();
  }
  get visibilityListenerCount() {
    return this.visibilityListeners.size;
  }
  get only() {
    if (this.watches.size !== 1) throw new Error(`${this.watches.size} watches`);
    return [...this.watches.values()][0];
  }
}

const position = (overrides: object = {}, timestamp = 1000) =>
  ({
    timestamp,
    coords: { latitude: 26.7458, longitude: 94.2506, accuracy: 8, speed: 1.2, heading: 90, ...overrides },
  }) as GeolocationPosition;

let browser: FakeBrowser;
let provider: RealLocationProvider;
let events: ProviderEvent[];

beforeEach(() => {
  browser = new FakeBrowser();
  provider = new RealLocationProvider(browser);
  events = [];
  provider.subscribe((event) => events.push(event));
});

describe("RealLocationProvider", () => {
  it("asks for nothing before it is started", () => {
    expect(browser.history).toEqual([]);
  });

  it("watches with high accuracy", () => {
    provider.start();
    expect(browser.only.options).toEqual({ enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  });

  it("turns latitude, longitude into [lng, lat]", () => {
    provider.start();
    browser.only.success(position());

    expect(events).toEqual([
      {
        type: "fix",
        fix: {
          position: [94.2506, 26.7458],
          accuracyM: 8,
          timestamp: 1000,
          speedMps: 1.2,
          headingDeg: 90,
          source: "real",
        },
      },
    ]);
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
    [99, "unavailable"],
  ])("reports error %d as %s", (code, problem) => {
    provider.start();
    browser.only.error({ code } as GeolocationPositionError);

    expect(events).toEqual([{ type: "problem", problem }]);
  });

  it("stops after a no, and can be started again", () => {
    provider.start();
    browser.only.error({ code: 1 } as GeolocationPositionError);
    expect(browser.watches.size).toBe(0);

    provider.start();
    expect(browser.watches.size).toBe(1);
  });

  it("keeps trying after a timeout", () => {
    provider.start();
    browser.only.error({ code: 3 } as GeolocationPositionError);
    browser.only.success(position());

    expect(events.map((event) => event.type)).toEqual(["problem", "fix"]);
  });

  it("explains an insecure page before touching the GPS", () => {
    browser.isSecureContext = false;
    provider.start();

    expect(events).toEqual([{ type: "problem", problem: "insecure" }]);
    expect(browser.history).toEqual([]);
  });

  it("explains a browser without geolocation", () => {
    browser.geolocation = null;
    provider.start();
    expect(events).toEqual([{ type: "problem", problem: "unsupported" }]);
  });

  it("pauses while the page is hidden and starts again when it is back", () => {
    provider.start();
    browser.setHidden(true);
    expect(browser.watches.size).toBe(0);

    browser.setHidden(false);
    expect(browser.watches.size).toBe(1);
    expect(events).toEqual([{ type: "paused" }, { type: "resumed" }]);
  });

  it("does not start in the background", () => {
    browser.hidden = true;
    provider.start();
    expect(browser.watches.size).toBe(0);

    browser.setHidden(false);
    expect(browser.watches.size).toBe(1);
  });

  it("never has two watches", () => {
    provider.start();
    provider.start();
    browser.setHidden(false);

    expect(browser.watches.size).toBe(1);
  });

  it("drops a fix that arrives after it was stopped", () => {
    provider.start();
    const late = browser.only;
    provider.stop();
    late.success(position());

    expect(events).toEqual([]);
  });

  it("cleans up everything when it is stopped", () => {
    provider.start();
    provider.stop();
    expect(browser.watches.size).toBe(0);
    expect(browser.visibilityListenerCount).toBe(0);

    browser.setHidden(true);
    browser.setHidden(false);
    expect(browser.watches.size).toBe(0);
  });
});

describe("toFix", () => {
  it.each([null, NaN, -1, Infinity])("treats a speed or heading of %s as unknown", (value) => {
    expect(toFix(position({ speed: value, heading: value }))).toMatchObject({ speedMps: null, headingDeg: null });
  });

  it("keeps zero: standing still and facing north are real values", () => {
    expect(toFix(position({ speed: 0, heading: 0 }))).toMatchObject({ speedMps: 0, headingDeg: 0 });
  });
});
