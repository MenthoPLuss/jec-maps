import { useSyncExternalStore } from "react";

import type { ThemeName } from "@/lib/map/theme";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The colour scheme chosen in the visitor's system settings. */
export function useColourScheme(): ThemeName {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "dark" : "light"),
    () => "light",
  );
}
