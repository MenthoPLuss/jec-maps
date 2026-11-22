import { distanceM } from "../geo/distance";
import type { Fix } from "../location/types";
import { POLICY } from "./policy";
import type { SpeedState } from "./types";

export const initialSpeed: SpeedState = { mps: POLICY.speed.defaultMps, previous: null, lastMovedAt: null };

/** Learns how fast someone walks. Standing, jitter and teleports teach it nothing. */
export function updateSpeed(speed: SpeedState, fix: Fix): SpeedState {
  const { alpha, maxAccuracyM, maxMps, minMps, plausible } = POLICY.speed;
  if (fix.accuracyM > maxAccuracyM) return speed;

  const measured = fix.speedMps ?? measuredFrom(speed.previous, fix);
  const next: SpeedState = { ...speed, previous: fix, lastMovedAt: speed.lastMovedAt ?? fix.timestamp };
  if (measured === null || measured < plausible.minMps || measured > plausible.maxMps) return next;

  const blended = speed.mps + alpha * (measured - speed.mps);
  return { ...next, mps: Math.min(maxMps, Math.max(minMps, blended)), lastMovedAt: fix.timestamp };
}

/** From two fixes, when the phone doesn't say. Null when they are too close or too far apart. */
function measuredFrom(previous: Fix | null, fix: Fix): number | null {
  if (!previous) return null;
  const seconds = (fix.timestamp - previous.timestamp) / 1000;
  if (seconds < 0.8 || seconds > 10) return null;

  const metres = distanceM(previous.position, fix.position);
  // Smaller than the uncertainty: that may be jitter instead of a step.
  if (metres < Math.max(1, fix.accuracyM * 0.15)) return 0;
  return metres / seconds;
}

/** True when someone with a route has been standing still for a while. */
export function isPaused(speed: SpeedState, now: number): boolean {
  return speed.lastMovedAt !== null && now - speed.lastMovedAt > POLICY.speed.pausedAfterMs;
}

export function walkingSeconds(metres: number, speed: SpeedState): number {
  return metres / speed.mps;
}
