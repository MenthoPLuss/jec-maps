"use client";

import { Marker } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";

import { useController } from "@/hooks/useController";
import { prefersReducedMotion } from "@/hooks/useReducedMotion";
import { distanceM } from "@/lib/geo/distance";
import type { LngLat } from "@/lib/geo/types";
import type { Fix } from "@/lib/location/types";
import { accuracyCircle } from "@/lib/map/layers";
import { EMPTY } from "@/lib/map/registry";
import { POLICY } from "@/lib/state/policy";

import type { MapHandle } from "./MapSurface";

interface UserPositionProps {
  handle: MapHandle;
  /** Keep the map on the user. */
  following: boolean;
  /** Called when the user moves the map themselves. */
  onMoved: () => void;
}

/**
 * The blue dot and the circle of uncertainty. Drawn outside React: a new position
 * never redraws the app. The movement between two fixes is only for the eye.
 */
export default function UserPosition({ handle, following, onMoved }: UserPositionProps) {
  const controller = useController();
  const isFollowing = useEffectEvent(() => following);
  const moved = useEffectEvent(onMoved);

  useEffect(() => {
    const { map, registry } = handle;
    const element = document.createElement("div");
    element.className = "user-dot";
    element.dataset.testid = "user-dot";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "Your approximate position");
    const marker = new Marker({ element, rotationAlignment: "map", pitchAlignment: "map" });

    let shown: LngLat | null = null;
    let lastFix: Fix | null = null;
    let frame = 0;

    const draw = (position: LngLat, accuracyM: number) => {
      shown = position;
      marker.setLngLat(position);
      registry.setData("user", accuracyCircle(position, accuracyM));
    };

    const moveTo = (fix: Fix) => {
      cancelAnimationFrame(frame);
      const from = shown;
      const tooFar = from === null || distanceM(from, fix.position) > POLICY.animation.maxJumpM;
      if (tooFar || prefersReducedMotion()) {
        draw(fix.position, fix.accuracyM);
      } else {
        const begin = performance.now();
        const step = (time: number) => {
          const t = Math.min(1, (time - begin) / POLICY.animation.durationMs);
          draw(
            [from[0] + (fix.position[0] - from[0]) * t, from[1] + (fix.position[1] - from[1]) * t],
            fix.accuracyM,
          );
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      }

      if (!isFollowing()) return;
      if (tooFar || prefersReducedMotion()) map.jumpTo({ center: fix.position });
      else map.easeTo({ center: fix.position, duration: POLICY.animation.durationMs, easing: (t) => t });
    };

    const update = () => {
      const { confirmed, fix, presence, quality } = controller.getState();
      // Only on campus: the locked screen shows no position.
      if (!fix || presence.status !== "inside") {
        cancelAnimationFrame(frame);
        marker.remove();
        registry.setData("user", EMPTY);
        shown = null;
        lastFix = null;
        return;
      }

      if (fix !== lastFix) {
        if (lastFix === null) marker.setLngLat(fix.position).addTo(map);
        lastFix = fix;
        moveTo(fix);

        // The direction of movement: meaningless while standing.
        const heading = fix.speedMps !== null && fix.speedMps >= POLICY.speed.plausible.minMps ? fix.headingDeg : null;
        if (heading === null) delete element.dataset.heading;
        else element.dataset.heading = String(Math.round(heading));
        marker.setRotation(heading ?? 0);
        element.dataset.lng = String(fix.position[0]);
        element.dataset.lat = String(fix.position[1]);
      }
      element.dataset.quality = quality.level;
      element.dataset.indoors = String(confirmed !== null);
      element.setAttribute(
        "aria-label",
        confirmed ? "Roughly where you are: somewhere in this building" : "Your approximate position",
      );
    };

    const unsubscribe = controller.subscribe(update);
    // The user's own drag, as opposed to the map following along.
    const drag = map.on("dragstart", (event) => {
      if (event.originalEvent) moved();
    });
    update();

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      drag.unsubscribe();
      marker.remove();
      if (handle.isAlive()) registry.setData("user", EMPTY);
    };
  }, [controller, handle]);

  // Pressing "centre on me" moves the map at once, not only with the next fix.
  useEffect(() => {
    if (!following) return;
    const { fix, presence } = controller.getState();
    if (!fix || presence.status !== "inside") return;
    const camera = { center: fix.position, zoom: Math.max(handle.map.getZoom(), 17) };
    if (prefersReducedMotion()) handle.map.jumpTo(camera);
    else handle.map.easeTo({ ...camera, duration: 600 });
  }, [controller, following, handle]);

  return null;
}
