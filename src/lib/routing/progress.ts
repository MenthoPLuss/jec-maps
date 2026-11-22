/** Where a walker is on a route. Cheap: it never searches for a new one. */
import { nearestOnPolyline } from "../geo/polyline";
import type { LngLat } from "../geo/types";
import { POLICY } from "../state/policy";
import type { Route } from "./route";

export interface Progress {
  /** Metres from the start of the route. */
  alongM: number;
  remainingM: number;
  /** Metres between the walker and the route. */
  offM: number;
}

export const startOf = (route: Route): Progress => ({ alongM: 0, remainingM: route.totalM, offM: 0 });

/**
 * Looks near the last progress first. A route can pass close to itself, and the
 * walker must not jump to a much later part of it.
 */
export function progressOn(route: Route, last: Progress, position: LngLat, accuracyM: number): Progress {
  const { behindM, aheadM } = POLICY.route.window;
  const near = nearestOnPolyline(route.line, position, { fromM: last.alongM - behindM, toM: last.alongM + aheadM });
  const limit = offRouteLimitM(accuracyM);

  let hit = near;
  if (!near || near.distanceM > limit) {
    // Far from where we expected: maybe further along, after a gap in the fixes.
    const anywhere = nearestOnPolyline(route.line, position);
    if (anywhere && anywhere.distanceM <= limit) hit = anywhere;
  }
  if (!hit) return last;

  return { alongM: hit.alongM, remainingM: Math.max(0, route.totalM - hit.alongM), offM: hit.distanceM };
}

/** With a rough signal a walker may seem further from the route than they are. */
export function offRouteLimitM(accuracyM: number): number {
  return Math.max(POLICY.route.offRoute.minM, accuracyM);
}
