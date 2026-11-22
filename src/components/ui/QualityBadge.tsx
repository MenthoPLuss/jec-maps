"use client";

import { useAppState } from "@/hooks/useController";
import type { Quality } from "@/lib/state/types";

const TEXTS: Record<Quality["level"], string> = {
  none: "No GPS yet",
  good: "GPS good",
  fair: "GPS fair",
  rough: "GPS rough",
  poor: "GPS too rough",
  stale: "GPS lost: old position",
};

/** How far the position can be trusted right now. Never only a colour. */
export default function QualityBadge() {
  const level = useAppState((state) => state.quality.level);
  const accuracy = useAppState((state) => (state.quality.accuracyM === null ? null : Math.round(state.quality.accuracyM)));
  const isFine = level === "good" || level === "fair";
  const showAccuracy = accuracy !== null && level !== "stale";

  return (
    <span
      data-testid="quality"
      data-level={level}
      className={`rounded-full border px-3 py-1 text-xs font-semibold shadow ${
        isFine ? "border-line bg-surface text-good" : "border-warn bg-warn-surface text-warn"
      }`}
    >
      {TEXTS[level]}
      {showAccuracy && ` ±${accuracy} m`}
    </span>
  );
}
