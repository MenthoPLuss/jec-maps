"use client";

import type { LngLat } from "@/lib/geo/types";

import DestinationPin from "./DestinationPin";
import IndoorLayers from "./IndoorLayers";
import MapGestures, { type Pick } from "./MapGestures";
import type { MapHandle } from "./MapSurface";
import RouteLayer from "./RouteLayer";
import UserPosition from "./UserPosition";

interface MapOverlaysProps {
  handle: MapHandle;
  gestures: "browse" | "navigate" | "teleport" | "none";
  indoors: boolean;
  /** The room that is being looked at or walked to. */
  chosenRoomId: string | null;
  sheetHeight: number;
  following: boolean;
  onMoved: () => void;
  onPin: (position: LngLat) => void;
  onPick: (pick: Pick | null) => void;
  onTeleport: (position: LngLat) => void;
}

/** Everything that moves on the map. */
export default function MapOverlays(props: MapOverlaysProps) {
  const { chosenRoomId, following, gestures, handle, indoors, onMoved, onPick, onPin, onTeleport, sheetHeight } = props;

  return (
    <>
      <IndoorLayers handle={handle} chosenRoomId={chosenRoomId} sheetHeight={sheetHeight} />
      <RouteLayer handle={handle} />
      <UserPosition handle={handle} following={following} onMoved={onMoved} />
      <DestinationPin handle={handle} indoors={indoors} />
      {gestures !== "none" && (
        <MapGestures
          handle={handle}
          mode={gestures}
          indoors={indoors}
          onPin={onPin}
          onPick={onPick}
          onTeleport={onTeleport}
        />
      )}
    </>
  );
}
