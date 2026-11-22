"use client";

import { useEffect, useEffectEvent } from "react";

import { useAppState, useController } from "@/hooks/useController";
import { usePlans } from "@/hooks/usePlans";
import { prefersReducedMotion } from "@/hooks/useReducedMotion";
import { boundsOf, ringsOf } from "@/lib/geo/area";
import { indoorPlan, indoorRoute } from "@/lib/map/layers";
import { EMPTY } from "@/lib/map/registry";
import { buildingOf, levelName } from "@/lib/state/destination";

import type { MapHandle } from "./MapSurface";

interface IndoorLayersProps {
  handle: MapHandle;
  chosenRoomId: string | null;
  /** How much of the screen the sheet covers. */
  sheetHeight: number;
}

/** The floor that is being looked at, with the part of the route that is on it. */
export default function IndoorLayers({ handle, chosenRoomId, sheetHeight }: IndoorLayersProps) {
  const { dataset } = useController();
  const view = useAppState((state) => state.view);
  const confirmedRoomId = useAppState((state) => state.confirmed?.roomId ?? null);
  const route = useAppState(({ navigation }) => (navigation.status === "active" ? navigation.route : null));
  const buildingId = view?.buildingId ?? null;
  const level = view?.level ?? null;
  const plans = usePlans(buildingId);
  const coveredBySheet = useEffectEvent(() => sheetHeight);

  useEffect(() => {
    const { registry } = handle;
    if (buildingId === null || level === null) return;

    const { lines, points, rooms } = indoorPlan(plans, level, dataset.rooms, chosenRoomId, confirmedRoomId);
    registry.setData("indoorRooms", rooms);
    registry.setData("indoorLines", lines);
    registry.setData("indoorPoints", points);

    const paths = [route?.exit ?? null, route?.enter ?? null].filter((path) => path?.buildingId === buildingId);
    registry.setData("indoorRoute", indoorRoute(paths, level, (other) => levelName(dataset, buildingId, other)));

    return () => {
      if (!handle.isAlive()) return;
      for (const id of ["indoorRooms", "indoorLines", "indoorPoints", "indoorRoute"] as const) registry.setData(id, EMPTY);
    };
  }, [buildingId, chosenRoomId, confirmedRoomId, dataset, handle, level, plans, route]);

  // Going in: the building fills the screen. Changing floors moves nothing.
  useEffect(() => {
    const building = buildingId ? buildingOf(dataset, buildingId) : undefined;
    if (!building) return;
    handle.map.fitBounds(boundsOf(ringsOf(building.geometry).flat()), {
      padding: { top: 190, bottom: coveredBySheet() + 50, left: 24, right: 72 },
      maxZoom: 20,
      duration: prefersReducedMotion() ? 0 : 300,
    });
  }, [buildingId, dataset, handle]);

  return null;
}
