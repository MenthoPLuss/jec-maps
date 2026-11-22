import type { LngLat } from "../geo/types";

/** Where the device believes it is. An estimate, never a proof. */
export interface Fix {
  position: LngLat;
  accuracyM: number;
  /** When it was measured: milliseconds since 1970. */
  timestamp: number;
  speedMps: number | null;
  /** The direction of movement. It is not a compass. */
  headingDeg: number | null;
  source: LocationSource;
}

export type LocationSource = "real" | "mock";

/**
 * - `denied`: the user or the browser said no.
 * - `unsupported`: this browser has no geolocation.
 * - `insecure`: the page is not on https.
 * - `unavailable`: the device can't find its position right now.
 * - `timeout`: it takes too long. It may still work later.
 */
export type ProviderProblem = "denied" | "unsupported" | "insecure" | "unavailable" | "timeout";

export type ProviderEvent =
  | { type: "fix"; fix: Fix }
  | { type: "problem"; problem: ProviderProblem }
  /** The page is hidden: nothing is measured. */
  | { type: "paused" }
  | { type: "resumed" };

export interface LocationProvider {
  readonly source: LocationSource;
  /** Begins to measure. Only after the user asked for it. */
  start(): void;
  stop(): void;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
}
