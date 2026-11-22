import { useCallback, useSyncExternalStore } from "react";

import { config } from "@/lib/config";
import { isBoolean, storedValue } from "@/lib/storage";

/** Raise the version when the provider or the explanation changes: visitors are then asked again. */
const consent = storedValue("online-map", 1, isBoolean);
const listeners = new Set<() => void>();
/** Remembered for this visit even when storage is blocked. */
let decision: boolean | null | undefined;

function current(): boolean | null {
  if (decision === undefined) decision = consent.read();
  return decision;
}

/** Whether the visitor allows the online map: true, false, or null when not asked yet. */
export function useOnlineMap(): { allowed: boolean | null; decide: (allow: boolean) => void } {
  const allowed = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    current,
    () => null,
  );

  const decide = useCallback((allow: boolean) => {
    decision = allow;
    consent.write(allow);
    for (const listener of listeners) listener();
  }, []);

  // A build without the online map never asks and never loads it.
  return { allowed: config.basemapMode === "online" ? allowed : false, decide };
}
