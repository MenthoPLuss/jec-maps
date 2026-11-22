"use client";

import { Marker } from "maplibre-gl";
import { useEffect } from "react";

import { useAppState, useController } from "@/hooks/useController";
import { destinationInfo } from "@/lib/state/destination";

import type { MapHandle } from "./MapSurface";

/** The one destination. A dropped pin can be dragged, everything else stays put. */
export default function DestinationPin({ handle }: { handle: MapHandle }) {
  const controller = useController();
  const destination = useAppState((state) => state.destination);

  useEffect(() => {
    const info = destination && destinationInfo(controller.dataset, destination);
    if (!destination || !info) return;

    const draggable = destination.kind === "pin";
    const marker = new Marker({ color: "#b91c1c", draggable }).setLngLat(info.position).addTo(handle.map);
    const element = marker.getElement();
    element.dataset.testid = "destination-pin";
    element.setAttribute("aria-label", `Destination: ${info.name}`);

    const drop = marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      controller.dispatch({ type: "destination/set", destination: { kind: "pin", position: [lng, lat] } });
    });

    return () => {
      drop.unsubscribe();
      marker.remove();
    };
  }, [controller, destination, handle]);

  return null;
}
