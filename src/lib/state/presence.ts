import { containsPoint, distanceToEdgeM, type AreaGeometry } from "../geo/area";
import type { Fix } from "../location/types";
import { addEvidence, isEnough } from "./evidence";
import { POLICY } from "./policy";
import type { Presence } from "./types";

/**
 * Is the user on campus? Only for fresh fixes: the caller drops stale ones.
 *
 * Getting in and getting out both take several reliable fixes, and getting out takes
 * a clear distance, so nothing flickers at the boundary.
 */
export function updatePresence(presence: Presence, fix: Fix, boundary: AreaGeometry): Presence {
  const { unlock, exit } = POLICY.presence;
  if (fix.accuracyM > POLICY.fix.ignoreWorseThanM) {
    return presence.status === "unknown" ? { ...presence, reason: "too-rough" } : presence;
  }

  const inside = containsPoint(boundary, fix.position);
  const edgeM = distanceToEdgeM(boundary, fix.position);

  if (presence.status === "inside") {
    const reliable = fix.accuracyM <= exit.maxAccuracyM;
    const clearlyOutside = !inside && edgeM - fix.accuracyM > exit.bufferM;
    // A rough fix neither counts for leaving nor against it.
    const outside = !reliable ? presence.outside : clearlyOutside ? addEvidence(presence.outside, fix.timestamp) : null;

    if (isEnough(outside, exit)) return { status: "outside", distanceM: edgeM, inside: null };
    return { status: "inside", approximate: !inside || edgeM < fix.accuracyM, outside };
  }

  const reliable = fix.accuracyM <= unlock.maxAccuracyM;
  const evidence = !reliable ? presence.inside : inside ? addEvidence(presence.inside, fix.timestamp) : null;
  if (isEnough(evidence, unlock)) {
    return { status: "inside", approximate: edgeM < fix.accuracyM, outside: null };
  }
  if (inside) return { ...presence, inside: evidence };
  return { status: "outside", distanceM: edgeM, inside: evidence };
}
