import { bearingDeg, destinationPoint, distanceM } from "../geo/distance";
import { pointAlong, polylineLengthM } from "../geo/polyline";
import type { LngLat } from "../geo/types";
import type { Fix, LocationProvider, ProviderEvent, ProviderProblem } from "./types";

/** Time, so that tests can control it. */
export interface Clock {
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export const browserClock: Clock = {
  now: () => Date.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

export interface MockState {
  position: LngLat;
  accuracyM: number;
  /** How fast `walk` moves. */
  walkSpeedMps: number;
  /** Random error added to every fix. */
  jitterM: number;
  /** False: the signal is lost and no fixes come. */
  signal: boolean;
  walking: boolean;
}

/** One step of a script: what to do, and how long to wait before the next one. */
export interface MockStep {
  do: (provider: MockLocationProvider) => void;
  thenWaitMs?: number;
  /** Wait until the walk is over instead. */
  thenWaitForWalk?: boolean;
}

const INTERVAL_MS = 500;

/** A fake GPS. It never touches the real one. */
export class MockLocationProvider implements LocationProvider {
  readonly source = "mock";

  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private readonly stateListeners = new Set<() => void>();
  private state: MockState;
  private timer: unknown = null;
  private path: LngLat[] = [];
  private alongM = 0;
  private lastTick = 0;
  private lastTimestamp = 0;
  private ticks = 0;
  private random = seededRandom(1);
  private script: MockStep[] = [];
  private waitUntil = 0;
  private waitForWalk = false;

  constructor(
    private readonly start_: LngLat,
    private readonly clock: Clock = browserClock,
  ) {
    this.state = this.initial();
  }

  // --- LocationProvider ---

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.stop();
    this.lastTick = this.clock.now();
    this.timer = this.clock.setInterval(() => this.tick(), INTERVAL_MS);
    this.emitFix();
  }

  stop(): void {
    if (this.timer !== null) this.clock.clearInterval(this.timer);
    this.timer = null;
  }

  // --- Controls ---

  getState = (): MockState => this.state;

  onStateChange = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  /** Moves the fake user at once, and ends any walk. */
  teleport(position: LngLat): void {
    this.path = [];
    this.update({ position, walking: false });
    this.emitFix();
  }

  /** Walks along a line from its start. */
  walk(path: LngLat[]): void {
    if (path.length < 2) return;
    this.path = path;
    this.alongM = 0;
    this.lastTick = this.clock.now();
    this.update({ position: path[0], walking: true });
  }

  pauseWalk(): void {
    this.update({ walking: false });
  }

  resumeWalk(): void {
    if (this.path.length > 0 && this.alongM < polylineLengthM(this.path)) {
      this.lastTick = this.clock.now();
      this.update({ walking: true });
    }
  }

  setAccuracy(accuracyM: number): void {
    this.update({ accuracyM });
  }

  setWalkSpeed(walkSpeedMps: number): void {
    this.update({ walkSpeedMps });
  }

  setJitter(jitterM: number): void {
    this.update({ jitterM });
  }

  setSignal(signal: boolean): void {
    this.update({ signal });
  }

  /** Pretends that the browser reports a problem. */
  fail(problem: ProviderProblem): void {
    // After these the real GPS is silent too.
    if (problem === "denied" || problem === "insecure" || problem === "unsupported") this.stop();
    this.emit({ type: "problem", problem });
  }

  /** Runs a preset. A new one replaces the old one. */
  run(steps: MockStep[]): void {
    this.script = [...steps];
    this.waitUntil = 0;
    this.waitForWalk = false;
    this.advanceScript();
  }

  /** Back to the beginning, exactly as after `new`. */
  reset(): void {
    this.script = [];
    this.path = [];
    this.alongM = 0;
    this.ticks = 0;
    this.random = seededRandom(1);
    this.update(this.initial());
    if (this.timer !== null) this.emitFix();
  }

  // --- Inside ---

  private initial(): MockState {
    return {
      position: this.start_,
      accuracyM: 8,
      walkSpeedMps: 1.4,
      jitterM: 0,
      signal: true,
      walking: false,
    };
  }

  private tick(): void {
    const now = this.clock.now();
    const seconds = Math.max(0, now - this.lastTick) / 1000;
    this.lastTick = now;
    this.ticks++;

    if (this.state.walking) {
      const total = polylineLengthM(this.path);
      this.alongM = Math.min(total, this.alongM + this.state.walkSpeedMps * seconds);
      this.update({ position: pointAlong(this.path, this.alongM).point, walking: this.alongM < total });
    }

    this.advanceScript();
    // Real phones send about one fix per second.
    if (this.ticks % 2 === 0) this.emitFix();
  }

  private advanceScript(): void {
    while (this.script.length > 0) {
      if (this.waitForWalk && this.state.walking) return;
      if (this.clock.now() < this.waitUntil) return;

      const step = this.script.shift() as MockStep;
      step.do(this);
      this.waitForWalk = step.thenWaitForWalk ?? false;
      this.waitUntil = this.clock.now() + (step.thenWaitMs ?? 0);
    }
  }

  private emitFix(): void {
    if (!this.state.signal || this.timer === null) return;

    // Two fixes never share a time, even when the clock stands still.
    const timestamp = Math.max(this.clock.now(), this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    const { position, accuracyM, walking, walkSpeedMps } = this.state;
    const fix: Fix = {
      position: this.jittered(position),
      accuracyM,
      timestamp,
      speedMps: walking ? walkSpeedMps : 0,
      headingDeg: walking ? this.walkHeading() : null,
      source: "mock",
    };
    this.emit({ type: "fix", fix });
  }

  private walkHeading(): number {
    const ahead = pointAlong(this.path, this.alongM + 1);
    const here = this.state.position;
    return distanceM(here, ahead.point) > 0.01 ? bearingDeg(here, ahead.point) : ahead.bearing;
  }

  private jittered(position: LngLat): LngLat {
    const { jitterM } = this.state;
    return jitterM > 0 ? destinationPoint(position, this.random() * 360, this.random() * jitterM) : position;
  }

  private update(change: Partial<MockState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.stateListeners]) listener();
  }

  private emit(event: ProviderEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** The same numbers every time (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
