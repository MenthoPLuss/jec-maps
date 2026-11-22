/**
 * The one place where the state changes. Pure: it gets the time and never reads a
 * clock, a sensor or the page.
 *
 * All of this shapes the user interface. It proves nothing and protects nothing.
 */
import type { Fix, ProviderEvent } from "../location/types";
import { dismiss, suggestWhenLost, updateBuildings } from "./building";
import { buildingOf, destinationInfo } from "./destination";
import { isUsable, judgeFix, qualityOf } from "./fixes";
import { begin, followFix, takeResult } from "./navigation";
import { POLICY } from "./policy";
import { updatePresence } from "./presence";
import { initialSpeed, updateSpeed } from "./speed";
import type { AppEvent, AppState, Confirmed, Presence, World } from "./types";

const UNKNOWN: Presence = { status: "unknown", reason: "no-fix", inside: null };

export const initialState: AppState = {
  source: null,
  provider: { status: "idle" },
  fix: null,
  quality: { level: "none", accuracyM: null, ageMs: null },
  presence: UNKNOWN,
  suggestion: null,
  nearby: null,
  dismissed: {},
  confirmed: null,
  view: null,
  destination: null,
  navigation: { status: "idle" },
  speed: initialSpeed,
  avoidStairs: false,
  hiddenSince: null,
  nextRequestId: 1,
};

export function reduce(state: AppState, event: AppEvent, now: number, world: World): AppState {
  switch (event.type) {
    case "provider/started":
      return startProvider(state, event.source, world);

    case "provider/stopped":
      return restartNavigation({ ...withoutPosition(state), source: null, provider: { status: "idle" } }, world);

    case "provider/event":
      return handleProvider(state, event.event, now, world);

    case "tick": {
      const next = { ...state, quality: qualityOf(state.fix, now) };
      // While the page is hidden nothing is measured, so silence means nothing.
      if (state.provider.status === "paused" || state.provider.status === "idle") return next;
      return state.presence.status === "inside" ? { ...next, ...suggestWhenLost(next, next.fix, now, world.dataset) } : next;
    }

    case "building/confirmed":
      return confirmBuilding(state, event.buildingId, world);

    case "building/dismissed":
      return { ...state, ...dismiss(state, now) };

    case "level/confirmed": {
      if (!state.confirmed || !hasLevel(world, state.confirmed.buildingId, event.level)) return state;
      return { ...state, confirmed: { ...state.confirmed, level: event.level, roomId: null, needsReconfirm: false } };
    }

    case "room/confirmed": {
      const room = world.dataset.rooms.find((candidate) => candidate.id === event.roomId);
      if (!room) return state;
      const next = {
        ...state,
        suggestion: null,
        nearby: null,
        confirmed: { buildingId: room.buildingId, level: room.level, roomId: room.id, needsReconfirm: false, away: null },
        view: { buildingId: room.buildingId, level: room.level },
      };
      // Being in the room you were looking for is an arrival.
      const there = state.destination?.kind === "room" && state.destination.id === room.id;
      return there ? { ...next, navigation: { status: "arrived", how: "manual" } } : next;
    }

    case "position/reconfirmed":
      return state.confirmed ? { ...state, confirmed: { ...state.confirmed, needsReconfirm: false } } : state;

    case "outside/confirmed": {
      if (!state.confirmed) return { ...state, ...dismiss(state, now) };
      const until = now + POLICY.building.dismissForMs;
      return {
        ...state,
        confirmed: null,
        view: null,
        suggestion: null,
        nearby: null,
        // Don't ask again right away.
        dismissed: { ...state.dismissed, [state.confirmed.buildingId]: until },
      };
    }

    case "view/opened": {
      const building = buildingOf(world.dataset, event.buildingId);
      if (!building) return state;
      const { levels, defaultLevel } = building.properties;
      const wanted = event.level ?? defaultLevel ?? 0;
      const level = levels.some((entry) => entry.ordinal === wanted) ? wanted : levels[0].ordinal;
      return { ...state, view: { buildingId: event.buildingId, level } };
    }

    case "view/level":
      if (!state.view || !hasLevel(world, state.view.buildingId, event.level)) return state;
      return { ...state, view: { ...state.view, level: event.level } };

    case "view/closed":
      return { ...state, view: null };

    case "destination/set":
      if (!destinationInfo(world.dataset, event.destination)) return state;
      return begin({ ...state, destination: event.destination }, world);

    case "destination/cleared":
      return { ...state, destination: null, navigation: { status: "idle" } };

    case "route/computed":
      return takeResult(state, event.requestId, event.result, now);

    case "route/cancelled":
      return state.destination ? { ...state, navigation: { status: "cancelled" } } : state;

    case "route/restarted":
      return begin(state, world);

    case "arrival/confirmed":
      return state.destination ? { ...state, navigation: { status: "arrived", how: "manual" } } : state;

    case "settings/avoidStairs": {
      const next = { ...state, avoidStairs: event.value };
      const { status } = state.navigation;
      return status === "active" || status === "no-route" || status === "computing" ? begin(next, world) : next;
    }
  }
}

// --- Provider ----------------------------------------------------------------

function startProvider(state: AppState, source: "real" | "mock", world: World): AppState {
  // A fake position must never live on as a real one, or the other way round.
  const kept = state.source === source ? state : withoutPosition(state);
  const presence: Presence = world.capabilities(source).presence
    ? kept.presence.status === "unknown"
      ? UNKNOWN
      : kept.presence
    : { status: "unknown", reason: "not-evaluated", inside: null };
  return { ...kept, source, presence, provider: { status: "requesting" } };
}

function handleProvider(state: AppState, event: ProviderEvent, now: number, world: World): AppState {
  if (!state.source) return state;

  switch (event.type) {
    case "fix":
      return takeFix(state, event.fix, now, world);

    case "problem":
      return { ...state, provider: { status: "failed", problem: event.problem }, quality: qualityOf(state.fix, now) };

    case "paused":
      return { ...state, provider: { status: "paused" }, hiddenSince: now };

    case "resumed": {
      const away = state.hiddenSince === null ? 0 : now - state.hiddenSince;
      const confirmed: Confirmed | null =
        state.confirmed && away > POLICY.building.reconfirmAfterMs
          ? { ...state.confirmed, needsReconfirm: true }
          : state.confirmed;
      return {
        ...state,
        provider: { status: "requesting" },
        hiddenSince: null,
        confirmed,
        quality: qualityOf(state.fix, now),
      };
    }
  }
}

function takeFix(state: AppState, fix: Fix, now: number, world: World): AppState {
  if (fix.source !== state.source) return state;
  if (judgeFix(state.fix, fix, now) !== "ok") return state;

  const quality = qualityOf(fix, now);
  let next: AppState = { ...state, fix, quality, provider: { status: "watching" } };
  // Too old or too rough: shown, but it decides nothing.
  if (quality.level === "stale") return next;

  const { boundary } = world.dataset;
  if (boundary && world.capabilities(fix.source).presence) {
    next = { ...next, presence: updatePresence(state.presence, fix, boundary.geometry) };
  }
  if (!isUsable(quality)) return next;

  if (next.presence.status === "inside") {
    next = { ...next, ...updateBuildings(next, fix, now, world.dataset) };
    if (state.confirmed && !next.confirmed) next = { ...next, view: null };
  } else if (state.presence.status === "inside" && next.presence.status === "outside") {
    // Really off campus: whatever was said about a room is no longer true.
    next = { ...next, confirmed: null, suggestion: null, nearby: null, view: null };
  }

  next = { ...next, speed: updateSpeed(next.speed, fix) };
  return followFix(next, fix, now, world);
}

// --- Helpers -----------------------------------------------------------------

function withoutPosition(state: AppState): AppState {
  return {
    ...state,
    fix: null,
    quality: initialState.quality,
    presence: UNKNOWN,
    suggestion: null,
    nearby: null,
    confirmed: null,
    speed: initialSpeed,
  };
}

function restartNavigation(state: AppState, world: World): AppState {
  return state.navigation.status === "cancelled" || state.navigation.status === "arrived" ? state : begin(state, world);
}

function confirmBuilding(state: AppState, buildingId: string, world: World): AppState {
  const building = buildingOf(world.dataset, buildingId);
  if (!building) return state;
  const { levels, defaultLevel } = building.properties;
  return {
    ...state,
    suggestion: null,
    nearby: null,
    // The floor stays open: looking at one is not being on it.
    confirmed: { buildingId, level: null, roomId: null, needsReconfirm: false, away: null },
    view: { buildingId, level: defaultLevel ?? levels[0].ordinal },
  };
}

function hasLevel(world: World, buildingId: string, level: number): boolean {
  return buildingOf(world.dataset, buildingId)?.properties.levels.some((entry) => entry.ordinal === level) ?? false;
}
