"use client";

import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import { buildingOf, levelName } from "@/lib/state/destination";

/** Which building and floor are being looked at. Leaving it moves nobody. */
export default function BuildingBar({ onExit }: { onExit: () => void }) {
  const { dataset } = useController();
  const view = useAppState((state) => state.view);
  const building = view && buildingOf(dataset, view.buildingId);
  if (!view || !building) return null;

  return (
    <div
      data-testid="building-bar"
      className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-2 rounded-xl bg-surface py-1 pr-1 pl-4 text-ink shadow-lg"
    >
      <p className="min-w-0 text-sm">
        <strong className="block truncate">{building.properties.name}</strong>
        <span className="text-ink-muted">Viewing: {levelName(dataset, view.buildingId, view.level)}</span>
      </p>
      <Button look="secondary" onClick={onExit} className="shrink-0">
        Exit building view
      </Button>
    </div>
  );
}
