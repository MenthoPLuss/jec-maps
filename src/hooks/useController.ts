import { createContext, use, useSyncExternalStore } from "react";

import type { CampusController } from "@/lib/controller";
import type { AppState } from "@/lib/state/types";

export const ControllerContext = createContext<CampusController | null>(null);

export function useController(): CampusController {
  const controller = use(ControllerContext);
  if (!controller) throw new Error("This component needs a ControllerContext");
  return controller;
}

/**
 * One part of the state. `select` must return something that exists in the state (or
 * a number, text or boolean), never a new object: otherwise React redraws forever.
 */
export function useAppState<T>(select: (state: AppState) => T): T {
  const controller = useController();
  const snapshot = () => select(controller.getState());
  return useSyncExternalStore(controller.subscribe, snapshot, snapshot);
}
