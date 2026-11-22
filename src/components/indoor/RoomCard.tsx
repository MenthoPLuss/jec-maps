"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import { useFocusOnOpen } from "@/hooks/useFocusOnOpen";
import type { Room } from "@/lib/data/schemas";
import { roomName } from "@/lib/state/destination";

import RoomFacts from "./RoomFacts";

interface RoomCardProps {
  room: Room;
  /** On campus: the user may say that they are here. */
  onCampus: boolean;
  canGo: boolean;
  onClose: () => void;
}

/** A room. Looking at it changes nothing; only the buttons do. */
export default function RoomCard({ room, onCampus, canGo, onClose }: RoomCardProps) {
  const { dataset, dispatch } = useController();
  const isHere = useAppState((state) => state.confirmed?.roomId === room.id);
  const [message, setMessage] = useState("");
  const heading = useFocusOnOpen<HTMLHeadingElement>(room.id);

  const share = async () => {
    // Says where the room is, never where anyone is.
    const url = `${window.location.origin}/room/${room.buildingId}/${room.id}`;
    try {
      if (navigator.share) await navigator.share({ title: roomName(room), url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("Link copied.");
      }
    } catch (error) {
      // Closing the share dialog is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(url);
    }
  };

  return (
    <section aria-label="Room" data-testid="room-card" className="space-y-3 p-4">
      <h2 ref={heading} tabIndex={-1} className="text-base font-bold">
        {roomName(room)}
      </h2>
      <RoomFacts dataset={dataset} room={room} />
      {isHere && <p className="text-sm font-semibold text-accent">You said you are here.</p>}
      <div className="flex flex-wrap gap-2">
        {canGo && !isHere && (
          <Button
            onClick={() => {
              dispatch({ type: "destination/set", destination: { kind: "room", id: room.id } });
              onClose();
            }}
          >
            Go here
          </Button>
        )}
        {onCampus && !isHere && (
          <Button look="secondary" onClick={() => dispatch({ type: "room/confirmed", roomId: room.id })}>
            I&apos;m in this room
          </Button>
        )}
        <Button
          look="secondary"
          onClick={() => dispatch({ type: "view/opened", buildingId: room.buildingId, level: room.level })}
        >
          Show the floor
        </Button>
        <Button look="secondary" onClick={share}>
          Share link
        </Button>
        <Button look="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <p role="status" className="text-sm break-all text-ink-muted">
        {message}
      </p>
    </section>
  );
}
