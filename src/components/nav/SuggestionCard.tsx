"use client";

import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import { buildingOf } from "@/lib/state/destination";

/** A question. Only the answer changes anything. */
export default function SuggestionCard() {
  const { dataset, dispatch } = useController();
  const suggestion = useAppState((state) => state.suggestion);
  if (!suggestion) return null;

  const buildings = suggestion.buildingIds.flatMap((id) => {
    const building = buildingOf(dataset, id);
    return building ? [building.properties] : [];
  });
  const [only] = buildings;

  return (
    <section data-testid="suggestion" className="space-y-3 p-4" role="status">
      <h2 className="font-bold">
        {buildings.length === 1 ? `Are you inside ${only.name}?` : "Are you inside one of these buildings?"}
      </h2>
      <p className="text-sm text-ink-muted">
        {suggestion.reason === "signal-lost"
          ? "The GPS went quiet near a door. Only you know whether you went in."
          : "GPS can't tell whether you are inside or next to it."}
      </p>
      <div className="flex flex-wrap gap-2">
        {buildings.map(({ id, name }) => (
          <Button key={id} onClick={() => dispatch({ type: "building/confirmed", buildingId: id })}>
            {buildings.length === 1 ? "Yes, I'm inside" : name}
          </Button>
        ))}
        <Button look="secondary" onClick={() => dispatch({ type: "building/dismissed" })}>
          {buildings.length === 1 ? "No" : "None of them"}
        </Button>
      </div>
    </section>
  );
}
