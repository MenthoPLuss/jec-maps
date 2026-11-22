/**
 * Everything the app knows, in separate pieces. They never stand in for each other:
 *
 * - where the device believes it is (`fix`, `quality`)
 * - whether that is on campus (`presence`)
 * - a question about a building (`suggestion`)
 * - what the user said about where they are (`confirmed`)
 * - what they are looking at (`view`)
 * - where they want to go (`destination`, `navigation`)
 */
import type { LngLat } from "../geo/types";
import type { PublishedDataset } from "../data/published";
import type { Fix, LocationSource, ProviderEvent, ProviderProblem } from "../location/types";
import type { Progress } from "../routing/progress";
import type { NoRouteReason, Route, RouteResult } from "../routing/route";
import type { Capabilities } from "./capabilities";
import type { Evidence } from "./evidence";

export type ProviderState =
  | { status: "idle" }
  /** Started, but nothing has come yet. */
  | { status: "requesting" }
  | { status: "watching" }
  | { status: "paused" }
  | { status: "failed"; problem: ProviderProblem };

export interface Quality {
  /** `poor` is too rough to use, `stale` is too old. */
  level: "none" | "good" | "fair" | "rough" | "poor" | "stale";
  accuracyM: number | null;
  ageMs: number | null;
}

export type Presence =
  | { status: "unknown"; reason: "not-evaluated" | "no-fix" | "too-rough"; inside: Evidence | null }
  | { status: "outside"; distanceM: number; inside: Evidence | null }
  /** `approximate`: the uncertainty reaches over the boundary. */
  | { status: "inside"; approximate: boolean; outside: Evidence | null };

export interface Suggestion {
  /** Several when it can't tell them apart: the user chooses. */
  buildingIds: string[];
  reason: "near" | "signal-lost";
  away: Evidence | null;
}

/** Only ever set by the user. */
export interface Confirmed {
  buildingId: string;
  level: number | null;
  roomId: string | null;
  /** After a while in the background it has to be confirmed again. */
  needsReconfirm: boolean;
  away: Evidence | null;
}

export interface View {
  buildingId: string;
  level: number;
}

export type Destination =
  | { kind: "pin"; position: LngLat }
  | { kind: "place"; id: string }
  | { kind: "building"; id: string }
  | { kind: "room"; id: string };

export type WaitingReason = "no-position" | "outside" | "not-allowed";

export type Navigation =
  | { status: "idle" }
  /** There is a destination, but no route can be offered yet. */
  | { status: "waiting"; reason: WaitingReason }
  | { status: "computing"; requestId: number; previous: ActiveNavigation | null }
  | ActiveNavigation
  | {
      status: "no-route";
      reason: NoRouteReason;
      straightLineM: number;
      /** Where it was tried from: it is tried again after moving on. Null indoors. */
      from: LngLat | null;
      near: boolean;
      arrival: Evidence | null;
    }
  | { status: "arrived"; how: "gps" | "manual" }
  | { status: "cancelled" };

export interface ActiveNavigation {
  status: "active";
  route: Route;
  progress: Progress;
  startedAt: number;
  offRoute: Evidence | null;
  arrival: Evidence | null;
  /** `entrance`: at the door of a building whose room is the destination. */
  proximity: "far" | "near" | "entrance";
}

export interface SpeedState {
  /** The smoothed walking speed. */
  mps: number;
  previous: Fix | null;
  lastMovedAt: number | null;
}

export interface AppState {
  source: LocationSource | null;
  provider: ProviderState;
  fix: Fix | null;
  quality: Quality;
  presence: Presence;
  suggestion: Suggestion | null;
  /** Buildings that recent fixes agree with. */
  nearby: { buildingIds: string[]; evidence: Evidence } | null;
  /** Buildings the user said no to, and until when. */
  dismissed: Record<string, number>;
  confirmed: Confirmed | null;
  view: View | null;
  destination: Destination | null;
  navigation: Navigation;
  speed: SpeedState;
  avoidStairs: boolean;
  hiddenSince: number | null;
  nextRequestId: number;
}

export type AppEvent =
  | { type: "provider/started"; source: LocationSource }
  | { type: "provider/stopped" }
  | { type: "provider/event"; event: ProviderEvent }
  | { type: "tick" }
  | { type: "building/confirmed"; buildingId: string }
  | { type: "building/dismissed" }
  | { type: "level/confirmed"; level: number }
  | { type: "room/confirmed"; roomId: string }
  | { type: "position/reconfirmed" }
  | { type: "outside/confirmed" }
  | { type: "view/opened"; buildingId: string; level?: number }
  | { type: "view/level"; level: number }
  | { type: "view/closed" }
  | { type: "destination/set"; destination: Destination }
  | { type: "destination/cleared" }
  | { type: "route/computed"; requestId: number; result: RouteResult }
  /** More is known now, such as a floor plan. */
  | { type: "route/refresh" }
  | { type: "route/cancelled" }
  | { type: "route/restarted" }
  | { type: "arrival/confirmed" }
  | { type: "settings/avoidStairs"; value: boolean };

/** What doesn't change while the app runs. */
export interface World {
  dataset: PublishedDataset;
  capabilities: (source: LocationSource) => Capabilities;
}
