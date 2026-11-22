"use client";

import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import { buildingOf, levelName, roomName } from "@/lib/state/destination";

/** What the user said about where they are. Always in their words, never as a measurement. */
export default function ConfirmedCard() {
  const { dataset, dispatch } = useController();
  const confirmed = useAppState((state) => state.confirmed);
  const view = useAppState((state) => state.view);
  const building = confirmed && buildingOf(dataset, confirmed.buildingId);
  if (!confirmed || !building) return null;

  const room = dataset.rooms.find(({ id }) => id === confirmed.roomId);
  const where = [
    room && roomName(room),
    confirmed.level !== null && levelName(dataset, confirmed.buildingId, confirmed.level),
    building.properties.name,
  ]
    .filter(Boolean)
    .join(", ");
  const isShown = view?.buildingId === confirmed.buildingId;

  return (
    <section aria-label="Where you said you are" data-testid="confirmed" className="space-y-2 rounded-xl border border-line p-3">
      {confirmed.needsReconfirm ? (
        <>
          <p className="text-sm">
            <strong>Are you still here?</strong> {where}. That was a while ago.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => dispatch({ type: "position/reconfirmed" })}>Yes</Button>
            <Button look="secondary" onClick={() => dispatch({ type: "outside/confirmed" })}>
              No, I&apos;m outside
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            You said you are in: <strong>{where}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            {isShown && view.level !== confirmed.level && (
              <Button look="secondary" onClick={() => dispatch({ type: "level/confirmed", level: view.level })}>
                I&apos;m on: {levelName(dataset, confirmed.buildingId, view.level)}
              </Button>
            )}
            {!isShown && (
              <Button
                look="secondary"
                onClick={() =>
                  dispatch({ type: "view/opened", buildingId: confirmed.buildingId, level: confirmed.level ?? undefined })
                }
              >
                Show the building
              </Button>
            )}
            <Button look="secondary" onClick={() => dispatch({ type: "outside/confirmed" })}>
              I&apos;m outside
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
