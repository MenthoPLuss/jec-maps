/** Fuzzy search over buildings, places and rooms. */
import Fuse from "fuse.js";

import type { PublishedDataset } from "../data/published";
import { buildingOf, levelName, roomName } from "../state/destination";
import type { Destination } from "../state/types";

export interface SearchItem {
  key: string;
  destination: Destination;
  name: string;
  detail: string;
  roomNumber: string;
  aliases: string[];
  kind: string;
  building: string;
}

const LIMIT = 12;

export class CampusSearch {
  readonly items: SearchItem[];
  private readonly fuse: Fuse<SearchItem>;

  constructor(dataset: PublishedDataset) {
    this.items = searchItems(dataset);
    this.fuse = new Fuse(this.items, {
      keys: [
        { name: "name", weight: 4 },
        { name: "roomNumber", weight: 4 },
        { name: "aliases", weight: 2 },
        { name: "kind", weight: 1 },
        { name: "building", weight: 1 },
      ],
      threshold: 0.34,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  find(query: string): SearchItem[] {
    const text = query.trim();
    if (text === "") return [];

    // A room number that matches exactly is what someone typing a number wants.
    const wanted = plain(text);
    const exact = this.items.filter((item) => item.roomNumber !== "" && plain(item.roomNumber) === wanted);
    const fuzzy = text.length < 2 ? this.startingWith(text) : this.fuse.search(text).map((result) => result.item);
    return [...new Set([...exact, ...fuzzy])].slice(0, LIMIT);
  }

  private startingWith(text: string): SearchItem[] {
    const start = text.toLowerCase();
    return this.items.filter((item) => item.name.toLowerCase().startsWith(start));
  }
}

export function searchItems(dataset: PublishedDataset): SearchItem[] {
  return [
    ...dataset.buildings.map(({ properties }) => ({
      key: `building-${properties.id}`,
      destination: { kind: "building", id: properties.id } as const,
      name: properties.name,
      detail: ["Building", ...properties.departments].join(" · "),
      roomNumber: "",
      aliases: [properties.shortName, ...properties.departments],
      kind: "building",
      building: "",
    })),
    ...dataset.places.map(({ properties }) => {
      const building = buildingOf(dataset, properties.buildingId)?.properties.name ?? "";
      return {
        key: `place-${properties.id}`,
        destination: { kind: "place", id: properties.id } as const,
        name: properties.name,
        detail: [capital(properties.category), building].filter(Boolean).join(" · "),
        roomNumber: "",
        aliases: properties.aliases,
        kind: properties.category,
        building,
      };
    }),
    ...dataset.rooms.map((room) => {
      const building = buildingOf(dataset, room.buildingId)?.properties.name ?? "";
      return {
        key: `room-${room.id}`,
        destination: { kind: "room", id: room.id } as const,
        name: roomName(room),
        detail: [levelName(dataset, room.buildingId, room.level), building].filter(Boolean).join(" · "),
        roomNumber: room.roomNumber,
        aliases: [...(room.aliases ?? []), ...(room.department ? [room.department] : [])],
        kind: room.type,
        building,
      };
    }),
  ];
}

/** "B-12A", "b 12a" and "b12a" are the same room number. */
const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
