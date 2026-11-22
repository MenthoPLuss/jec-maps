"use client";

import type { LngLat } from "@/lib/geo/types";

import DestinationPin from "./DestinationPin";
import MapGestures, { type Pick } from "./MapGestures";
import type { MapHandle } from "./MapSurface";
import RouteLayer from "./RouteLayer";
import UserPosition from "./UserPosition";

interface MapOverlaysProps {
  handle: MapHandle;
  gestures: "browse" | "navigate" | "teleport" | "none";
  following: boolean;
  onMoved: () => void;
  onPin: (position: LngLat) => void;
  onPick: (pick: Pick | null) => void;
  onTeleport: (position: LngLat) => void;
}

/** Everything that moves on the map. */
export default function MapOverlays({ handle, gestures, following, onMoved, onPin, onPick, onTeleport }: MapOverlaysProps) {
  return (
    <>
      <RouteLayer handle={handle} />
      <UserPosition handle={handle} following={following} onMoved={onMoved} />
      <DestinationPin handle={handle} />
      {gestures !== "none" && (
        <MapGestures handle={handle} mode={gestures} onPin={onPin} onPick={onPick} onTeleport={onTeleport} />
      )}
    </>
  );
}
