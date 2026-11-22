"use client";

import { useAppState, useController } from "@/hooks/useController";
import { buildingOf } from "@/lib/state/destination";

/**
 * Chooses the floor to look at. The floor that the user said they are on is marked
 * separately: looking is not being there.
 */
export default function FloorSwitcher() {
  const { dataset, dispatch } = useController();
  const view = useAppState((state) => state.view);
  const confirmedLevel = useAppState(({ confirmed, view: shown }) =>
    confirmed && confirmed.buildingId === shown?.buildingId ? confirmed.level : null,
  );
  const building = view && buildingOf(dataset, view.buildingId);
  if (!view || !building || building.properties.levels.length < 2) return null;

  const levels = [...building.properties.levels].sort((a, b) => b.ordinal - a.ordinal);

  return (
    <div
      role="group"
      aria-label="Floor to look at"
      data-testid="floor-switcher"
      className="pointer-events-auto flex flex-col overflow-hidden rounded-xl bg-surface shadow-lg"
    >
      {levels.map(({ name, ordinal }) => {
        const isShown = ordinal === view.level;
        const isConfirmed = ordinal === confirmedLevel;
        return (
          <button
            key={ordinal}
            type="button"
            aria-label={isConfirmed ? `${name}, where you said you are` : name}
            aria-pressed={isShown}
            onClick={() => dispatch({ type: "view/level", level: ordinal })}
            className={`relative size-12 text-sm font-bold ${isShown ? "bg-accent text-accent-ink" : "text-ink"}`}
          >
            {ordinal === 0 ? "G" : ordinal}
            {isConfirmed && (
              <span aria-hidden className="absolute inset-x-0 bottom-0.5 text-[9px] leading-none font-semibold">
                you
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
