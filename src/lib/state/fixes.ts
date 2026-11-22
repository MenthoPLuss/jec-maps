import { isLngLat } from "../geo/types";
import type { Fix } from "../location/types";
import { POLICY } from "./policy";
import type { Quality } from "./types";

export type FixVerdict = "ok" | "invalid" | "from-the-future" | "out-of-order";

/** Whether a fix may be used at all. Its age and accuracy are judged later. */
export function judgeFix(previous: Fix | null, fix: Fix, now: number): FixVerdict {
  if (!isLngLat(fix.position) || !Number.isFinite(fix.accuracyM) || fix.accuracyM <= 0) return "invalid";
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= 0) return "invalid";
  if (fix.timestamp > now + POLICY.fix.futureToleranceMs) return "from-the-future";
  // The same time means the same measurement: it adds nothing.
  if (previous && fix.timestamp <= previous.timestamp) return "out-of-order";
  return "ok";
}

export function qualityOf(fix: Fix | null, now: number): Quality {
  if (!fix) return { level: "none", accuracyM: null, ageMs: null };

  const ageMs = Math.max(0, now - fix.timestamp);
  const { accuracyM } = fix;
  const level =
    ageMs > POLICY.fix.staleAfterMs
      ? "stale"
      : accuracyM <= POLICY.fix.goodM
        ? "good"
        : accuracyM <= POLICY.fix.fairM
          ? "fair"
          : accuracyM <= POLICY.fix.ignoreWorseThanM
            ? "rough"
            : "poor";
  return { level, accuracyM, ageMs };
}

/** Good enough to base a decision on. */
export function isUsable(quality: Quality): boolean {
  return quality.level === "good" || quality.level === "fair" || quality.level === "rough";
}
