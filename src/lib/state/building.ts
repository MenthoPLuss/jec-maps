/** Questions about buildings. Nothing in here ever decides that someone went inside. */
import type { PublishedDataset } from "../data/published";
import { distanceToAreaM } from "../geo/area";
import { distanceM } from "../geo/distance";
import type { Fix } from "../location/types";
import { addEvidence, isEnough } from "./evidence";
import { POLICY } from "./policy";
import type { AppState, Confirmed, Suggestion } from "./types";

type Buildings = Pick<PublishedDataset, "buildings" | "entrances">;
type BuildingState = Pick<AppState, "suggestion" | "nearby" | "dismissed" | "confirmed">;

/** Call with fresh fixes only. */
export function updateBuildings(state: BuildingState, fix: Fix, now: number, campus: Buildings): BuildingState {
  if (state.confirmed) {
    return { ...state, suggestion: null, nearby: null, confirmed: clearWhenOutside(state.confirmed, fix, campus) };
  }

  const { suggest } = POLICY.building;
  const suggestion = withdrawWhenAway(state.suggestion, fix, campus);
  if (fix.accuracyM > suggest.maxAccuracyM) return { ...state, suggestion };

  const ids = buildingsAround(fix, campus).filter((id) => !isDismissed(state, id, now));
  if (ids.length === 0) return { ...state, suggestion, nearby: null };

  // The same buildings again: evidence grows. Other buildings: it starts over.
  const common = state.nearby?.buildingIds.filter((id) => ids.includes(id)) ?? [];
  const nearby = {
    buildingIds: ids,
    evidence: addEvidence(common.length > 0 && state.nearby ? state.nearby.evidence : null, fix.timestamp),
  };
  if (!isEnough(nearby.evidence, suggest)) return { ...state, suggestion, nearby };
  if (suggestion && sameIds(suggestion.buildingIds, ids)) return { ...state, suggestion, nearby };
  return { ...state, nearby, suggestion: { buildingIds: ids, reason: "near", away: null } };
}

/**
 * GPS that goes quiet right at a door may mean that someone went in. It may also mean
 * a wall, so this only asks. Call it from a clock while the page is visible.
 */
export function suggestWhenLost(state: BuildingState, fix: Fix | null, now: number, campus: Buildings): BuildingState {
  const { lost } = POLICY.building;
  if (!fix || state.confirmed || state.suggestion) return state;
  if (now - fix.timestamp < lost.afterMs || fix.accuracyM > lost.maxAccuracyM) return state;

  const ids = unique(
    campus.entrances
      .filter((entrance) => distanceM(entrance.geometry.coordinates, fix.position) <= lost.entranceM)
      .map((entrance) => entrance.properties.buildingId),
  ).filter((id) => !isDismissed(state, id, now));

  return ids.length === 0 ? state : { ...state, suggestion: { buildingIds: ids, reason: "signal-lost", away: null } };
}

export function dismiss(state: BuildingState, now: number): BuildingState {
  const until = now + POLICY.building.dismissForMs;
  const ids = state.suggestion?.buildingIds ?? [];
  return {
    ...state,
    suggestion: null,
    nearby: null,
    dismissed: { ...state.dismissed, ...Object.fromEntries(ids.map((id) => [id, until])) },
  };
}

/** Several reliable fixes clearly outside end "I'm in this building". Poor ones never do. */
function clearWhenOutside(confirmed: Confirmed, fix: Fix, campus: Buildings): Confirmed | null {
  const { clear } = POLICY.building;
  if (fix.accuracyM > clear.maxAccuracyM) return confirmed;

  const building = campus.buildings.find((candidate) => candidate.properties.id === confirmed.buildingId);
  if (!building) return null;
  const isAway = distanceToAreaM(building.geometry, fix.position) - fix.accuracyM > clear.awayM;
  const away = isAway ? addEvidence(confirmed.away, fix.timestamp) : null;
  return isEnough(away, clear) ? null : { ...confirmed, away };
}

function withdrawWhenAway(suggestion: Suggestion | null, fix: Fix, campus: Buildings): Suggestion | null {
  const { withdraw } = POLICY.building;
  if (!suggestion || fix.accuracyM > withdraw.maxAccuracyM) return suggestion;

  const isAway = suggestion.buildingIds.every((id) => {
    const building = campus.buildings.find((candidate) => candidate.properties.id === id);
    return !building || distanceToAreaM(building.geometry, fix.position) > withdraw.awayM;
  });
  const away = isAway ? addEvidence(suggestion.away, fix.timestamp) : null;
  return isEnough(away, withdraw) ? null : { ...suggestion, away };
}

function buildingsAround(fix: Fix, campus: Buildings): string[] {
  const { footprintM, entranceM } = POLICY.building.suggest;
  return unique([
    ...campus.buildings
      .filter((building) => distanceToAreaM(building.geometry, fix.position) <= footprintM)
      .map((building) => building.properties.id),
    ...campus.entrances
      .filter((entrance) => distanceM(entrance.geometry.coordinates, fix.position) <= entranceM)
      .map((entrance) => entrance.properties.buildingId),
  ]);
}

const isDismissed = (state: BuildingState, id: string, now: number) => (state.dismissed[id] ?? 0) > now;
const unique = (ids: string[]) => [...new Set(ids)].sort();
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
