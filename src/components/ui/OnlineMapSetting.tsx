"use client";

import { useOnlineMap } from "@/hooks/useOnlineMap";
import { config } from "@/lib/config";
import { providerName } from "@/lib/map/basemap";

/** Changes the choice about the street map at any time. */
export default function OnlineMapSetting() {
  const { allowed, decide } = useOnlineMap();

  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line p-3">
      <input
        type="checkbox"
        checked={allowed === true}
        onChange={(event) => decide(event.target.checked)}
        className="size-5"
      />
      Street map from {providerName(config)}
    </label>
  );
}
