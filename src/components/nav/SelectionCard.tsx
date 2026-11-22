"use client";

import Button from "@/components/ui/Button";
import { useController } from "@/hooks/useController";
import { destinationInfo } from "@/lib/state/destination";
import type { Destination } from "@/lib/state/types";

interface SelectionCardProps {
  selection: Destination;
  canGo: boolean;
  onClose: () => void;
}

/** Something that was tapped. Looking at it changes nothing. */
export default function SelectionCard({ selection, canGo, onClose }: SelectionCardProps) {
  const { dataset, dispatch } = useController();
  const info = destinationInfo(dataset, selection);
  if (!info) return null;

  return (
    <section aria-label="Selected" data-testid="selection" className="space-y-3 p-4">
      <header>
        <h2 className="text-base font-bold">{info.name}</h2>
        {info.detail && <p className="text-sm text-ink-muted">{info.detail}</p>}
      </header>
      <div className="flex flex-wrap gap-2">
        {canGo && (
          <Button
            onClick={() => {
              dispatch({ type: "destination/set", destination: selection });
              onClose();
            }}
          >
            Go here
          </Button>
        )}
        {info.buildingId && (
          <Button
            look="secondary"
            onClick={() => {
              dispatch({ type: "view/opened", buildingId: info.buildingId as string });
              onClose();
            }}
          >
            Look inside
          </Button>
        )}
        <Button look="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
    </section>
  );
}
