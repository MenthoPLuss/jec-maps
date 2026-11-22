"use client";

import type { MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import { useEffect, useEffectEvent } from "react";

import type { LngLat } from "@/lib/geo/types";
import { LongPress } from "@/lib/map/longPress";
import type { Destination } from "@/lib/state/types";

import type { MapHandle } from "./MapSurface";

export type Pick = Extract<Destination, { kind: "place" | "building" }>;

interface MapGesturesProps {
  handle: MapHandle;
  /**
   * - `browse`: look at things, but nothing becomes a destination
   * - `navigate`: click (mouse) or long press (finger) drops the pin
   * - `teleport`: the fake GPS jumps there, and nothing else happens
   */
  mode: "browse" | "navigate" | "teleport";
  onPin: (position: LngLat) => void;
  onPick: (pick: Pick | null) => void;
  onTeleport: (position: LngLat) => void;
}

const PICKABLE = ["places-dot", "places-label", "buildings-label", "buildings-fill"];

/** One action per gesture, never two. */
export default function MapGestures({ handle, mode, onPin, onPick, onTeleport }: MapGesturesProps) {
  const click = useEffectEvent((event: MapMouseEvent, isTouch: boolean) => {
    const position: LngLat = [event.lngLat.lng, event.lngLat.lat];
    if (mode === "teleport") return onTeleport(position);

    const pick = pickAt(handle, event);
    if (pick) return onPick(pick);
    onPick(null);
    // A finger taps all the time, so it has to press and hold to drop a pin.
    if (mode === "navigate" && !isTouch) onPin(position);
  });

  const longPress = useEffectEvent((position: LngLat) => {
    if (mode === "navigate") onPin(position);
  });

  useEffect(() => {
    const { map } = handle;
    const press = new LongPress(({ x, y }) => {
      const { lng, lat } = map.unproject([x, y]);
      longPress([lng, lat]);
    });
    const points = (event: MapTouchEvent) => event.points.map(({ x, y }) => ({ x, y }));
    let longPressed = false;

    const subscriptions = [
      map.on("touchstart", (event) => {
        longPressed = false;
        press.touchStart(points(event));
      }),
      map.on("touchmove", (event) => press.touchMove(points(event))),
      map.on("touchend", () => {
        press.touchEnd();
      }),
      map.on("touchcancel", () => press.cancel()),
      map.on("dragstart", () => press.cancel()),
      map.on("zoomstart", () => press.cancel()),
      map.on("contextmenu", (event) => {
        // Android reports a long press as a right click too: one of them is enough.
        event.preventDefault();
        longPressed = press.isEcho();
      }),
      map.on("click", (event) => {
        if (longPressed) return;
        click(event, press.isEcho());
      }),
      map.on("mousemove", (event) => {
        map.getCanvas().style.cursor = pickAt(handle, event) ? "pointer" : "";
      }),
    ];

    return () => {
      press.cancel();
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [handle]);

  return null;
}

function pickAt({ map }: MapHandle, { point }: MapMouseEvent): Pick | null {
  const layers = PICKABLE.filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;
  const [hit] = map.queryRenderedFeatures(point, { layers });
  const id: unknown = hit?.properties.id;
  if (typeof id !== "string") return null;
  return { kind: hit.source === "places" ? "place" : "building", id };
}
