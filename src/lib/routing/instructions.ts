/**
 * Turns a route into steps in words.
 *
 * Only from geometry and from what a person wrote down. "The 2nd door on the left" is
 * said when someone counted the doors, never because it looks that way on a sketch.
 */
import type { IndoorPlans, PublishedDataset } from "../data/published";
import type { DoorFeature, Room } from "../data/schemas";
import { formatDistance, ordinal } from "../format";
import { bearingDeg, distanceM, turnDeg } from "../geo/distance";
import type { LngLat } from "../geo/types";
import { buildingOf, levelName, roomName } from "../state/destination";
import type { IndoorPath, IndoorPiece, Route } from "./route";

export interface Step {
  text: string;
  /** Where it happens. Null outside. */
  buildingId: string | null;
  level: number | null;
}

/** Less than this is the same direction. */
const TURN_DEG = 35;

export function stepsOf(route: Route, dataset: PublishedDataset, room: Room | null, plans: IndoorPlans | null): Step[] {
  const steps: Step[] = [];
  const outside = (text: string) => steps.push({ text, buildingId: null, level: null });

  if (route.exit) {
    steps.push(...indoorSteps(route.exit, dataset));
    outside("Go outside");
  }
  if (route.line.length > 1) {
    const entrance = dataset.entrances.find(({ properties }) => properties.id === (route.entranceId ?? entranceAt(route, dataset)));
    const building = entrance && buildingOf(dataset, entrance.properties.buildingId);
    const goal = entrance && building ? `to ${entrance.properties.name} of ${building.properties.shortName}` : "to the destination";
    const via = route.legs.some((leg) => leg.steps) ? ", using the steps" : "";
    outside(`Walk ${formatDistance(route.totalM)} ${goal}${via}`);
  }
  if (route.enter) {
    steps.push(...indoorSteps(route.enter, dataset));
    if (room) steps.push(lastStep(route.enter, room, dataset, plans));
  } else if (room) {
    const inside = route.indoorNote === "only-steps" ? "The only known way to the room has stairs." : "The way inside is not drawn yet.";
    const hint = room.near ? ` Hint: ${room.near}.` : "";
    steps.push({
      text: `${roomName(room)} is on: ${levelName(dataset, room.buildingId, room.level)}. ${inside}${hint}`,
      buildingId: room.buildingId,
      level: room.level,
    });
  }
  return steps;
}

function indoorSteps({ buildingId, pieces }: IndoorPath, dataset: PublishedDataset): Step[] {
  let heading: number | null = null;

  return pieces.flatMap((piece): Step[] => {
    const at = { buildingId, level: piece.level };
    if (piece.kind !== "walk") {
      heading = null; // nobody knows which way you face after stairs
      const how = piece.kind === "stairs" ? "Take the stairs" : "Take the lift";
      const way = piece.toLevel > piece.level ? "up" : "down";
      return [{ ...at, text: `${how} ${way} to ${levelName(dataset, buildingId, piece.toLevel)}` }];
    }

    return straightRuns(piece.coordinates).map(({ bearing, lengthM }) => {
      const turn = heading === null ? 0 : turnDeg(heading, bearing);
      heading = bearing;
      const distance = formatDistance(lengthM);
      const text =
        Math.abs(turn) < TURN_DEG
          ? `Walk ${distance}`
          : Math.abs(turn) > 150
            ? `Turn around and walk ${distance}`
            : `Turn ${turn < 0 ? "left" : "right"} and walk ${distance}`;
      return { ...at, text };
    });
  });
}

function lastStep(path: IndoorPath, room: Room, dataset: PublishedDataset, plans: IndoorPlans | null): Step {
  const at = { buildingId: path.buildingId, level: room.level };
  const name = roomName(room);
  const walk = path.pieces.at(-1);
  const door = doorOf(plans, room.id);
  const side = walk?.kind === "walk" && door ? sideOf(walk, door.geometry.coordinates) : null;

  const counted =
    walk?.kind === "walk"
      ? door?.properties.order?.find((order) => walk.nodes.includes(order.fromNode) && (side === null || order.side === side))
      : undefined;
  if (counted) return { ...at, text: `${name} is the ${ordinal(counted.index)} door on the ${counted.side}` };
  if (side) return { ...at, text: `${name} is on the ${side}${room.near ? ` (${room.near})` : ""}` };
  return { ...at, text: `${name} is here${room.near ? `: ${room.near}` : ""}` };
}

/** On which side the door is, coming along the corridor. Null when it is straight ahead. */
function sideOf(walk: Extract<IndoorPiece, { kind: "walk" }>, door: LngLat): "left" | "right" | null {
  // The last stretch leads into the door, so the one before it is the corridor.
  const line = walk.coordinates;
  const doorIndex = line.length - 1;
  for (let i = doorIndex - 1; i > 0; i--) {
    if (distanceM(line[i - 1], line[i]) < 0.5) continue;
    const turn = turnDeg(bearingDeg(line[i - 1], line[i]), bearingDeg(line[i], door));
    if (Math.abs(turn) < TURN_DEG || Math.abs(turn) > 145) return null;
    return turn < 0 ? "left" : "right";
  }
  return null;
}

/** A line cut where it bends. The last metres into a door don't count as a run. */
function straightRuns(line: LngLat[]): { bearing: number; lengthM: number }[] {
  const runs: { bearing: number; lengthM: number }[] = [];
  for (let i = 1; i < line.length; i++) {
    const lengthM = distanceM(line[i - 1], line[i]);
    if (lengthM < 0.5) continue;
    const bearing = bearingDeg(line[i - 1], line[i]);
    const last = runs.at(-1);
    if (last && Math.abs(turnDeg(last.bearing, bearing)) < TURN_DEG) last.lengthM += lengthM;
    else runs.push({ bearing, lengthM });
  }
  return runs.filter((run, i) => run.lengthM >= 3 || (i === 0 && runs.length === 1));
}

function doorOf(plans: IndoorPlans | null, roomId: string): DoorFeature | undefined {
  return plans?.levels
    .flatMap(({ features }) => features)
    .find((feature): feature is DoorFeature => feature.properties.featureType === "door" && feature.properties.roomId === roomId);
}

/** The door that an outdoor line ends at, when it goes on inside. */
function entranceAt({ enter, line }: Route, dataset: PublishedDataset): string | undefined {
  const end = line.at(-1);
  if (!enter || !end) return undefined;
  return dataset.entrances
    .filter(({ properties }) => properties.buildingId === enter.buildingId)
    .sort((a, b) => distanceM(a.geometry.coordinates, end) - distanceM(b.geometry.coordinates, end))[0]?.properties.id;
}
