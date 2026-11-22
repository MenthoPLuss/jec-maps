"use client";

import { Marker } from "maplibre-gl";
import { useEffect } from "react";

import type { LngLat } from "@/lib/geo/types";

import type { MapHandle } from "./MapSurface";

/** Marks the chosen place and moves the map to it. */
export default function SelectionMarker({ handle, position }: { handle: MapHandle; position: LngLat }) {
  useEffect(() => {
    const marker = new Marker({ color: "#1d4ed8" }).setLngLat(position).addTo(handle.map);
    handle.map.flyTo({ center: position, zoom: 18 });

    return () => {
      marker.remove();
    };
  }, [handle, position]);

  return null;
}
