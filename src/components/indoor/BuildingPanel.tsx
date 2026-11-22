"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import type { Room } from "@/lib/data/schemas";
import { buildingOf, levelName, roomName } from "@/lib/state/destination";
import type { Destination } from "@/lib/state/types";

import ConfirmedCard from "./ConfirmedCard";
import { roomTypeName } from "./RoomFacts";

interface BuildingPanelProps {
  onCampus: boolean;
  onPick: (destination: Destination) => void;
}

/** The rooms of the building that is being looked at, floor by floor. */
export default function BuildingPanel({ onCampus, onPick }: BuildingPanelProps) {
  const { dataset, dispatch } = useController();
  const view = useAppState((state) => state.view);
  const isInside = useAppState(({ confirmed, view: shown }) => confirmed !== null && confirmed.buildingId === shown?.buildingId);
  const [filter, setFilter] = useState("");
  const building = view && buildingOf(dataset, view.buildingId);
  if (!view || !building) return null;

  const hasPlan = dataset.indoorLevels[view.buildingId]?.includes(view.level) ?? false;
  const wanted = filter.trim().toLowerCase();
  const rooms = dataset.rooms.filter(
    (room) =>
      room.buildingId === view.buildingId &&
      (wanted === "" || `${roomName(room)} ${roomTypeName(room.type)} ${room.department ?? ""}`.toLowerCase().includes(wanted)),
  );
  const levels = [...building.properties.levels].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <section aria-label="Building" data-testid="building-panel" className="space-y-3 p-4">
      {isInside ? (
        <ConfirmedCard />
      ) : (
        onCampus && (
          <Button onClick={() => dispatch({ type: "building/confirmed", buildingId: view.buildingId })}>
            I&apos;m inside this building
          </Button>
        )
      )}

      <p className="text-xs text-ink-muted">
        {hasPlan
          ? "The floor plan is a sketch, not a survey. Not for emergencies."
          : "There is no floor plan of this floor yet. Here are the rooms that are known."}
      </p>

      <input
        type="search"
        aria-label="Filter the rooms"
        placeholder="Filter the rooms"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 placeholder:text-ink-muted"
      />

      {levels.map(({ ordinal }) => {
        const here = rooms.filter((room) => room.level === ordinal);
        if (here.length === 0) return null;
        return (
          // A new key opens the floor that was switched to.
          <details key={`${ordinal}-${view.level}-${wanted !== ""}`} open={ordinal === view.level || wanted !== ""} className="rounded-xl bg-surface-2">
            <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-semibold">
              {levelName(dataset, view.buildingId, ordinal)} ({here.length})
            </summary>
            <ul className="px-1 pb-1">
              {here.map((room) => (
                <li key={room.id}>
                  <RoomButton room={room} onPick={onPick} />
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {rooms.length === 0 && <p className="text-sm text-ink-muted">{wanted ? "Nothing found" : "No rooms are known yet."}</p>}
    </section>
  );
}

function RoomButton({ room, onPick }: { room: Room; onPick: (destination: Destination) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick({ kind: "room", id: room.id })}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface"
    >
      <span className="font-medium">{roomName(room)}</span>
      <span className="shrink-0 text-xs text-ink-muted">{roomTypeName(room.type)}</span>
    </button>
  );
}
