import type { PublishedDataset } from "@/lib/data/published";
import type { Room } from "@/lib/data/schemas";
import { buildingOf, levelName } from "@/lib/state/destination";

const TYPES: Record<Room["type"], string> = {
  classroom: "Classroom",
  lab: "Lab",
  office: "Office",
  hod: "Head of department",
  staffroom: "Staff room",
  toilet: "Toilet",
  stairs: "Stairs",
  lift: "Lift",
  hall: "Hall",
  store: "Store",
  other: "Room",
};

export const roomTypeName = (type: Room["type"]) => TYPES[type];

/** What is known about a room. What isn't known is left out, not invented. */
export default function RoomFacts({ dataset, room }: { dataset: Pick<PublishedDataset, "buildings" | "rooms">; room: Room }) {
  const full = dataset as PublishedDataset;
  const facts: [string, string | undefined][] = [
    ["Room number", room.roomNumber || undefined],
    ["Type", TYPES[room.type]],
    ["Floor", levelName(full, room.buildingId, room.level)],
    ["Building", buildingOf(full, room.buildingId)?.properties.name],
    ["Department", room.department],
    ["Hint", room.near],
  ];

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {facts.map(
        ([name, value]) =>
          value && (
            <div key={name} className="contents">
              <dt className="text-ink-muted">{name}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ),
      )}
    </dl>
  );
}
