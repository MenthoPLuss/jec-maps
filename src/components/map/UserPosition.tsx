"use client";

import { Marker } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";

import { useController } from "@/hooks/useController";
import { prefersReducedMotion } from "@/hooks/useReducedMotion";
import type { CampusController } from "@/lib/controller";
import { centroidOf } from "@/lib/geo/area";
import { distanceM } from "@/lib/geo/distance";
import type { LngLat } from "@/lib/geo/types";
import type { Fix } from "@/lib/location/types";
import { accuracyCircle } from "@/lib/map/layers";
import { EMPTY } from "@/lib/map/registry";
import { buildingOf } from "@/lib/state/destination";
import { POLICY } from "@/lib/state/policy";
import type { Confirmed } from "@/lib/state/types";

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
 *
 * Once the user has said which building or room they are in, the dot stays there as a
 * soft halo. GPS does not move it: indoors it would only pretend to know.
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
    const marker = new Marker({ element, rotationAlignment: "map", pitchAlignment: "map" });

    let onMap = false;
    let shown: LngLat | null = null;
    let lastFix: Fix | null = null;
    let lastAnchor: LngLat | null = null;
    let frame = 0;

    const place = (position: LngLat) => {
      shown = position;
      marker.setLngLat(position);
      if (!onMap) marker.addTo(map);
      onMap = true;
    };
    const draw = (position: LngLat, accuracyM: number) => {
      place(position);
      registry.setData("user", accuracyCircle(position, accuracyM));
    };
    const hide = () => {
      cancelAnimationFrame(frame);
      marker.remove();
      registry.setData("user", EMPTY);
      onMap = false;
      shown = null;
      lastFix = null;
      lastAnchor = null;
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
      if (presence.status !== "inside" || (!fix && !confirmed)) {
        if (onMap) hide();
        return;
      }

      element.dataset.quality = quality.level;
      element.dataset.indoors = String(confirmed !== null);
      element.setAttribute("aria-label", labelOf(confirmed));

      if (confirmed) {
        const anchor = anchorOf(controller, confirmed);
        if (!anchor || (lastAnchor && distanceM(anchor, lastAnchor) < 0.1)) return;
        cancelAnimationFrame(frame);
        lastAnchor = anchor;
        lastFix = null;
        delete element.dataset.heading;
        marker.setRotation(0);
        place(anchor);
        registry.setData("user", EMPTY);
        return;
      }

      lastAnchor = null;
      if (!fix || fix === lastFix) return;
      lastFix = fix;
      moveTo(fix);
      // The direction of movement: meaningless while standing.
      const heading = fix.speedMps !== null && fix.speedMps >= POLICY.speed.plausible.minMps ? fix.headingDeg : null;
      if (heading === null) delete element.dataset.heading;
      else element.dataset.heading = String(Math.round(heading));
      marker.setRotation(heading ?? 0);
      element.dataset.lng = String(fix.position[0]);
      element.dataset.lat = String(fix.position[1]);
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
    const { confirmed, fix, presence } = controller.getState();
    const position = confirmed ? anchorOf(controller, confirmed) : fix?.position;
    if (!position || presence.status !== "inside") return;
    const camera = { center: position, zoom: Math.max(handle.map.getZoom(), 17) };
    if (prefersReducedMotion()) handle.map.jumpTo(camera);
    else handle.map.easeTo({ ...camera, duration: 600 });
  }, [controller, following, handle]);

  return null;
}

/** The middle of the room or the building that the user said they are in. */
function anchorOf(controller: CampusController, { buildingId, roomId }: Confirmed): LngLat | null {
  for (const { features } of controller.getPlans(buildingId)?.levels ?? []) {
    for (const { geometry, properties } of features) {
      if (properties.featureType === "room" && properties.roomId === roomId && "coordinates" in geometry) {
        return centroidOf(geometry as Parameters<typeof centroidOf>[0]);
      }
    }
  }
  const building = buildingOf(controller.dataset, buildingId);
  return building ? centroidOf(building.geometry) : null;
}

function labelOf(confirmed: Confirmed | null): string {
  if (!confirmed) return "Your approximate position";
  return confirmed.roomId ? "The room you said you are in" : "Roughly where you are: somewhere in this building";
}
