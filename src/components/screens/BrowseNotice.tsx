"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import type { ProviderProblem } from "@/lib/location/types";

const PROBLEMS: Record<ProviderProblem, string> = {
  denied: "Location is blocked for this site.",
  insecure: "Location needs an https address.",
  unsupported: "This browser has no location.",
  unavailable: "The position can't be found right now.",
  timeout: "The GPS is still searching.",
};

/**
 * Shown when the data may not guide a real person. The map can be looked at, and the
 * signal can be checked. There is no dot, no distance and no route.
 */
export default function BrowseNotice({ reasons }: { reasons: string[] }) {
  const { disableLocation, enableLocation } = useController();
  const [checking, setChecking] = useState(false);
  const provider = useAppState((state) => state.provider);
  const quality = useAppState((state) => state.quality);

  const toggle = () => {
    if (checking) disableLocation();
    else enableLocation();
    setChecking(!checking);
  };

  return (
    <section data-testid="browse-notice" className="space-y-2 p-4 text-sm text-ink-muted">
      <h2 className="text-base font-bold text-ink">Navigation is not available yet</h2>
      <p>{reasons.join(" ")} You can look around, but the app will not use this map to guide you.</p>
      {checking && (
        <p role="status" data-testid="gps-check" className="rounded-xl bg-surface-2 p-3 text-ink">
          {provider.status === "failed" ? (
            PROBLEMS[provider.problem]
          ) : quality.level === "none" ? (
            "Waiting for the GPS…"
          ) : (
            <>
              Your GPS works. It says it is accurate to about ±{Math.round(quality.accuracyM ?? 0)} m
              {quality.level === "stale" && ", but the last position is old"}.
            </>
          )}
        </p>
      )}
      <Button look="secondary" onClick={toggle}>
        {checking ? "Stop the check" : "Check my GPS signal"}
      </Button>
    </section>
  );
}
