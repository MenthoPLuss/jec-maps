"use client";

import { useEffect, useState } from "react";

import { useController } from "@/hooks/useController";
import { formatDistance, formatDuration } from "@/lib/format";
import { destinationInfo } from "@/lib/state/destination";
import { POLICY } from "@/lib/state/policy";
import { walkingSeconds } from "@/lib/state/speed";
import type { AppState } from "@/lib/state/types";

/**
 * Speaks to screen readers. Distances at most every ten seconds; arrivals, new routes
 * and problems at once, and once only. It also makes the phone vibrate on arrival.
 */
export default function Announcer() {
  const controller = useController();
  const [message, setMessage] = useState("");

  useEffect(() => {
    let lastDistanceAt = 0;
    let before: AppState = controller.getState();

    const update = () => {
      const state = controller.getState();
      const previous = before;
      before = state;

      const event = eventText(previous, state, controller.dataset);
      if (event) {
        lastDistanceAt = Date.now();
        setMessage(event);
        if (state.navigation.status === "arrived" && previous.navigation.status !== "arrived") navigator.vibrate?.(200);
        return;
      }

      if (state.navigation.status !== "active" || state.quality.level === "stale") return;
      if (Date.now() - lastDistanceAt < POLICY.announceEveryMs) return;
      lastDistanceAt = Date.now();
      const { remainingM } = state.navigation.progress;
      setMessage(`${formatDistance(remainingM)}, ${formatDuration(walkingSeconds(remainingM, state.speed))}`);
    };

    return controller.subscribe(update);
  }, [controller]);

  return (
    <p role="status" aria-live="polite" data-testid="announcer" className="sr-only">
      {message}
    </p>
  );
}

function eventText(before: AppState, after: AppState, dataset: Parameters<typeof destinationInfo>[0]): string | null {
  const { navigation } = after;
  const name = after.destination ? destinationInfo(dataset, after.destination)?.name : undefined;

  if (navigation.status === "arrived" && before.navigation.status !== "arrived") return `You've arrived: ${name}`;
  if (navigation.status === "no-route" && before.navigation.status !== "no-route") return "Route unavailable";
  if (navigation.status === "active") {
    const old = before.navigation.status === "active" ? before.navigation : null;
    if (navigation.proximity === "entrance" && old?.proximity !== "entrance") return "You're at the entrance";
    if (old?.route !== navigation.route) {
      const { totalM } = navigation.route;
      return `Route to ${name}: ${formatDistance(totalM)}, ${formatDuration(walkingSeconds(totalM, after.speed))}`;
    }
  }
  if (after.presence.status === "inside" && before.presence.status !== "inside") return "You're on campus. The map is unlocked.";
  if (after.presence.status === "outside" && before.presence.status === "inside") return "You left the campus. The map is locked.";
  if (after.quality.level === "stale" && before.quality.level !== "stale") return "The GPS signal is lost";
  if (after.suggestion && !before.suggestion) return "A question about your building is on screen";
  return null;
}
