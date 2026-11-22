/** What a destination means: its name, where it is, and which doors lead to it. */
import type { PublishedDataset } from "../data/published";
import { isTrusted } from "../data/coverage";
import type { Room } from "../data/schemas";
import { centroidOf } from "../geo/area";
import { isLngLat, type LngLat } from "../geo/types";
import type { EntranceOption, RouteTarget } from "../routing/route";
import type { Destination } from "./types";

export interface DestinationInfo {
  name: string;
  /** A second line, such as "Floor 1, Block A". */
  detail: string;
  position: LngLat;
  buildingId: string | null;
  room: Room | null;
}

/** Null when the dataset has no such thing, for example after an update. */
export function destinationInfo(dataset: PublishedDataset, destination: Destination): DestinationInfo | null {
  switch (destination.kind) {
    case "pin":
      return { name: "Dropped pin", detail: "", position: destination.position, buildingId: null, room: null };

    case "place": {
      const place = dataset.places.find((candidate) => candidate.properties.id === destination.id);
      if (!place) return null;
      const building = buildingOf(dataset, place.properties.buildingId);
      return {
        name: place.properties.name,
        detail: building ? `In ${building.properties.name}` : "",
        position: place.geometry.coordinates,
        buildingId: building?.properties.id ?? null,
        room: null,
      };
    }

    case "building": {
      const building = buildingOf(dataset, destination.id);
      if (!building) return null;
      return {
        name: building.properties.name,
        detail: building.properties.departments.join(", "),
        position: centroidOf(building.geometry),
        buildingId: building.properties.id,
        room: null,
      };
    }

    case "room": {
      const room = dataset.rooms.find((candidate) => candidate.id === destination.id);
      const building = room && buildingOf(dataset, room.buildingId);
      if (!room || !building) return null;
      return {
        name: roomName(room),
        detail: `${levelName(dataset, room.buildingId, room.level)}, ${building.properties.name}`,
        position: centroidOf(building.geometry),
        buildingId: building.properties.id,
        room,
      };
    }
  }
}

/** Buildings and rooms are reached through their doors, everything else directly. */
export function routeTarget(dataset: PublishedDataset, destination: Destination): RouteTarget | null {
  const info = destinationInfo(dataset, destination);
  if (!info) return null;
  if (info.buildingId === null) return { kind: "point", position: info.position };

  const place = destination.kind === "place" ? dataset.places.find(({ properties }) => properties.id === destination.id) : undefined;
  return {
    kind: "entrances",
    position: info.position,
    options: entranceOptions(dataset, info.buildingId, place?.properties.entranceIds),
  };
}

/** Public doors. Doors whose access nobody knows only when there is no public one. */
function entranceOptions(dataset: PublishedDataset, buildingId: string, only?: string[]): EntranceOption[] {
  const doors = dataset.entrances.filter(
    ({ properties }) =>
      properties.buildingId === buildingId &&
      (!only || only.length === 0 || only.includes(properties.id)) &&
      (dataset.mode === "demo" || isTrusted(properties)),
  );
  const open = doors.filter(({ properties }) => properties.access === "public");
  const usable = open.length > 0 ? open : doors.filter(({ properties }) => properties.access === "unknown");

  return usable.map(({ properties, geometry }) => ({
    entranceId: properties.id,
    nodeId: properties.outdoorNodeId,
    position: geometry.coordinates,
    accessUnknown: properties.access === "unknown",
  }));
}

export function buildingOf(dataset: PublishedDataset, id: string | undefined): PublishedDataset["buildings"][number] | undefined {
  return dataset.buildings.find((building) => building.properties.id === id);
}

export function levelName(dataset: PublishedDataset, buildingId: string, level: number): string {
  const named = buildingOf(dataset, buildingId)?.properties.levels.find((entry) => entry.ordinal === level);
  return named?.name ?? `Level ${level}`;
}

export function roomName(room: Pick<Room, "name" | "roomNumber">): string {
  return room.roomNumber ? `${room.roomNumber} ${room.name}` : room.name;
}

/** For values that come back from storage or a link. */
export function isDestination(value: unknown): value is Destination {
  if (typeof value !== "object" || value === null) return false;
  const { kind, id, position } = value as Record<string, unknown>;
  if (kind === "pin") return isLngLat(position);
  return (kind === "place" || kind === "building" || kind === "room") && typeof id === "string" && id !== "";
}
