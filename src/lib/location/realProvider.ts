import type { LngLat } from "../geo/types";
import type { Fix, LocationProvider, ProviderEvent, ProviderProblem } from "./types";

/** The parts of the browser that this provider needs. Tests pass their own. */
export interface RealProviderEnvironment {
  geolocation: Pick<Geolocation, "watchPosition" | "clearWatch"> | null;
  isSecureContext: boolean;
  isHidden: () => boolean;
  onVisibilityChange: (listener: () => void) => () => void;
}

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 };

const PROBLEMS: Record<number, ProviderProblem> = { 1: "denied", 2: "unavailable", 3: "timeout" };

/** The position of this device, from the browser. */
export class RealLocationProvider implements LocationProvider {
  readonly source = "real";

  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private watch: number | null = null;
  private running = false;
  private stopListening: (() => void) | null = null;

  constructor(private readonly environment: RealProviderEnvironment) {}

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.stop();
    if (!this.environment.isSecureContext) return this.emit({ type: "problem", problem: "insecure" });
    if (!this.environment.geolocation) return this.emit({ type: "problem", problem: "unsupported" });

    this.running = true;
    this.stopListening = this.environment.onVisibilityChange(() => this.followVisibility());
    if (this.environment.isHidden()) this.emit({ type: "paused" });
    else this.beginWatch();
  }

  stop(): void {
    this.running = false;
    this.endWatch();
    this.stopListening?.();
    this.stopListening = null;
  }

  private followVisibility(): void {
    if (!this.running) return;
    if (this.environment.isHidden()) {
      this.endWatch();
      this.emit({ type: "paused" });
    } else if (this.watch === null) {
      this.emit({ type: "resumed" });
      this.beginWatch();
    }
  }

  private beginWatch(): void {
    const { geolocation } = this.environment;
    if (!geolocation) return;

    // A callback that was already on its way when the watch ended is dropped.
    const token = Symbol();
    this.current = token;
    this.watch = geolocation.watchPosition(
      (position) => {
        if (this.current === token) this.emit({ type: "fix", fix: toFix(position) });
      },
      (error) => {
        if (this.current !== token) return;
        const problem = PROBLEMS[error.code] ?? "unavailable";
        // After a "no" the browser never calls again: a new start has to ask.
        if (problem === "denied") this.stop();
        this.emit({ type: "problem", problem });
      },
      OPTIONS,
    );
  }

  private current: symbol | null = null;

  private endWatch(): void {
    this.current = null;
    if (this.watch !== null) this.environment.geolocation?.clearWatch(this.watch);
    this.watch = null;
  }

  private emit(event: ProviderEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** One of the few places where "latitude, longitude" becomes [lng, lat]. */
export function toFix({ coords, timestamp }: Pick<GeolocationPosition, "timestamp"> & { coords: Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy" | "speed" | "heading"> }): Fix {
  const position: LngLat = [coords.longitude, coords.latitude];
  return {
    position,
    accuracyM: coords.accuracy,
    timestamp,
    speedMps: usable(coords.speed),
    headingDeg: usable(coords.heading),
    source: "real",
  };
}

/** Browsers send null or NaN when they don't know. */
function usable(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function browserEnvironment(): RealProviderEnvironment {
  return {
    geolocation: "geolocation" in navigator ? navigator.geolocation : null,
    isSecureContext: window.isSecureContext,
    isHidden: () => document.hidden,
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}
