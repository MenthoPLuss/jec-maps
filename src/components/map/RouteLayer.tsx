"use client";

import { useEffect } from "react";

import { useController } from "@/hooks/useController";
import { routeLines, straightLine } from "@/lib/map/layers";
import { EMPTY, type FeatureCollection } from "@/lib/map/registry";
import type { Route } from "@/lib/routing/route";
import { destinationInfo } from "@/lib/state/destination";

import type { MapHandle } from "./MapSurface";

/** Draws the route, or a dotted straight line when there is none. */
export default function RouteLayer({ handle }: { handle: MapHandle }) {
  const controller = useController();

  useEffect(() => {
    const { registry } = handle;
    let drawn: Route | null = null;
    let last: FeatureCollection = EMPTY;

    const show = (data: FeatureCollection) => {
      if (data === EMPTY && last === EMPTY) return;
      last = data;
      registry.setData("route", data);
    };

    const update = () => {
      const { destination, fix, navigation } = controller.getState();

      if (navigation.status === "active") {
        // Progress doesn't change the line: only a new route does.
        if (navigation.route !== drawn) show(routeLines(navigation.route));
        drawn = navigation.route;
        return;
      }
      // Keep showing the old route for the moment it takes to find the new one.
      if (navigation.status === "computing" && navigation.previous) return;
      drawn = null;

      const info = destination && destinationInfo(controller.dataset, destination);
      show(navigation.status === "no-route" && fix && info ? straightLine(fix.position, info.position) : EMPTY);
    };

    const unsubscribe = controller.subscribe(update);
    update();

    return () => {
      unsubscribe();
      if (handle.isAlive()) registry.setData("route", EMPTY);
    };
  }, [controller, handle]);

  return null;
}
