import { useEffect, useSyncExternalStore } from "react";

import type { IndoorPlans } from "@/lib/data/published";

import { useController } from "./useController";

/** The floor plans of a building. Null while they download, and when there are none. */
export function usePlans(buildingId: string | null): IndoorPlans | null {
  const controller = useController();

  useEffect(() => {
    if (buildingId) void controller.ensurePlans(buildingId);
  }, [buildingId, controller]);

  const snapshot = () => controller.getPlans(buildingId);
  return useSyncExternalStore(controller.subscribe, snapshot, snapshot);
}
