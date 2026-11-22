/** From "I want to go there" to "you've arrived". */
import { distanceM } from "../geo/distance";
import type { Fix } from "../location/types";
import { offRouteLimitM, progressOn, startOf } from "../routing/progress";
import type { RouteResult } from "../routing/route";
import { destinationInfo } from "./destination";
import { addEvidence, isEnough, type Evidence } from "./evidence";
import { isUsable } from "./fixes";
import { POLICY } from "./policy";
import type { ActiveNavigation, AppState, Navigation, WaitingReason, World } from "./types";

/** Asks for a route, or says what it is waiting for. */
export function begin(state: AppState, world: World, previous: ActiveNavigation | null = null): AppState {
  if (!state.destination) return { ...state, navigation: { status: "idle" } };

  const waiting = whatIsMissing(state, world);
  if (waiting) return { ...state, navigation: { status: "waiting", reason: waiting } };
  return {
    ...state,
    nextRequestId: state.nextRequestId + 1,
    navigation: { status: "computing", requestId: state.nextRequestId, previous },
  };
}

function whatIsMissing(state: AppState, world: World): WaitingReason | null {
  if (state.source && !world.capabilities(state.source).guidance) return "not-allowed";
  // Whoever said where they are needs no GPS: indoors it is useless anyway.
  if (knowsPlace(state) && state.presence.status === "inside") return null;
  if (!state.fix || !isUsable(state.quality)) return "no-position";
  if (state.presence.status === "outside") return "outside";
  return state.presence.status === "inside" ? null : "no-position";
}

/** The user has said which building they are in, and it still holds. */
export function knowsPlace({ confirmed }: Pick<AppState, "confirmed">): boolean {
  return confirmed !== null && !confirmed.needsReconfirm;
}

/** Asks again when there is a route to ask for. */
export function again(state: AppState, world: World): AppState {
  const { navigation } = state;
  switch (navigation.status) {
    case "active":
      return begin(state, world, navigation);
    case "no-route":
    case "computing":
    case "waiting":
      return begin(state, world);
    default:
      return state;
  }
}

export function takeResult(state: AppState, requestId: number, result: RouteResult, now: number): AppState {
  // An answer to an older question: the destination has changed since.
  if (state.navigation.status !== "computing" || state.navigation.requestId !== requestId) return state;

  if (!result.ok) {
    return {
      ...state,
      navigation: {
        status: "no-route",
        reason: result.reason,
        straightLineM: result.straightLineM,
        from: knowsPlace(state) ? null : (state.fix?.position ?? null),
        near: false,
        arrival: null,
      },
    };
  }
  return {
    ...state,
    navigation: {
      status: "active",
      route: result.route,
      progress: startOf(result.route),
      startedAt: now,
      offRoute: null,
      // A new route to the same place keeps what we know about being close to it.
      arrival: state.navigation.previous?.arrival ?? null,
      proximity: state.navigation.previous?.proximity ?? "far",
    },
  };
}

/** Call with every fresh, usable fix. */
export function followFix(state: AppState, fix: Fix, now: number, world: World): AppState {
  const { navigation } = state;

  switch (navigation.status) {
    case "waiting":
      return begin(state, world);

    case "computing":
      // Left the campus meanwhile: the answer will not be needed.
      return state.presence.status === "inside" ? state : begin(state, world);

    case "active":
      if (state.presence.status !== "inside") return begin(state, world);
      // Inside, GPS says nothing about progress: the user moves the steps on.
      if (knowsPlace(state)) return state;
      return followRoute(state, navigation, fix, now, world);

    case "no-route": {
      if (state.presence.status !== "inside") return begin(state, world);
      if (navigation.from === null) return state;
      const moved = distanceM(navigation.from, fix.position) > 10;
      if (moved) return begin(state, world);
      return followStraightLine(state, navigation, fix, world);
    }

    default:
      return state;
  }
}

function followRoute(state: AppState, active: ActiveNavigation, fix: Fix, now: number, world: World): AppState {
  const progress = progressOn(active.route, active.progress, fix.position, fix.accuracyM);

  const isOff = progress.offM > offRouteLimitM(fix.accuracyM);
  const offRoute = isOff ? addEvidence(active.offRoute, fix.timestamp) : null;
  if (isEnough(offRoute, POLICY.route.offRoute) && now - active.startedAt >= POLICY.route.minRerouteMs) {
    return begin(state, world, { ...active, offRoute: null });
  }

  const gapM = distanceM(fix.position, active.route.end);
  const arrival = arrivalEvidence(active.arrival, fix, gapM, progress.remainingM);
  if (isEnough(arrival, POLICY.arrival)) {
    // A door is not a room: upstairs only the user knows when they are there.
    if (state.destination?.kind === "room") {
      return { ...state, navigation: { ...active, progress, offRoute, arrival, proximity: "entrance" } };
    }
    return { ...state, navigation: { status: "arrived", how: "gps" } };
  }

  const proximity = active.proximity === "entrance" && gapM <= POLICY.arrival.nearM ? "entrance" : gapM <= POLICY.arrival.nearM ? "near" : "far";
  return { ...state, navigation: { ...active, progress, offRoute, arrival, proximity } };
}

function followStraightLine(
  state: AppState,
  navigation: Extract<Navigation, { status: "no-route" }>,
  fix: Fix,
  world: World,
): AppState {
  const info = state.destination && destinationInfo(world.dataset, state.destination);
  if (!info) return state;

  const gapM = distanceM(fix.position, info.position);
  // Without a route to a door, the middle of a building is no place to arrive at.
  const arrival = info.buildingId === null ? arrivalEvidence(navigation.arrival, fix, gapM, 0) : null;
  if (isEnough(arrival, POLICY.arrival)) return { ...state, navigation: { status: "arrived", how: "gps" } };
  return {
    ...state,
    navigation: { ...navigation, straightLineM: gapM, near: gapM <= POLICY.arrival.nearM, arrival },
  };
}

/** A rough signal never widens the circle: it just doesn't count. */
function arrivalEvidence(evidence: Evidence | null, fix: Fix, gapM: number, remainingM: number): Evidence | null {
  const { maxAccuracyM, maxRemainingM, radiusM } = POLICY.arrival;
  if (fix.accuracyM > maxAccuracyM) return evidence;
  return gapM <= radiusM && remainingM <= maxRemainingM ? addEvidence(evidence, fix.timestamp) : null;
}
