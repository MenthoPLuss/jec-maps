/**
 * Candidate files, as the review page shows them. A person opens them from their
 * own computer and they stay in the browser: nothing is uploaded.
 *
 * The scripts read candidate files with the same `parseCandidates`.
 */
import { polylineLengthM } from "../geo/polyline";
import { isLngLat, type LngLat } from "../geo/types";
import type { PublishedDataset } from "../data/published";

export const CANDIDATE_KINDS = [
  "boundary",
  "buildings",
  "paths",
  "places",
  "rooms",
  "entrances",
  "entrance-suggestions",
] as const;

export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export interface CandidateFile {
  kind: CandidateKind;
  /** Where the data comes from, for the reviewer and for the credit line. */
  provenance: Record<string, unknown>;
  records: object[];
}

/** Throws a message for people when the text is not a candidate file. */
export function parseCandidates(text: string, name: string): CandidateFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error(`${name} is not a candidate file: it is not valid JSON`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${name} is not a candidate file`);
  }

  const { kind, features, records, candidates, type, ...rest } = raw as Record<string, unknown>;
  void type;
  const list = features ?? records;
  if (candidates !== true || !CANDIDATE_KINDS.includes(kind as CandidateKind) || !Array.isArray(list)) {
    throw new Error(`${name} is not a candidate file`);
  }
  return { kind: kind as CandidateKind, provenance: rest, records: list };
}

// --- What the page lists ------------------------------------------------------

export interface ReviewItem {
  id: string;
  /** What a person calls it. */
  title: string;
  /** Kind, length, level: whatever helps to recognise it. */
  detail: string;
  /** Null for records without a position, such as rooms. */
  geometry: GeoJSON.Geometry | null;
  /** Why it can't be approved as it is. Null when it can. */
  notApprovable: string | null;
  /** The OpenStreetMap object, such as way/123. */
  osmId?: string;
  /** Paths only: the junctions at both ends. */
  nodes?: [from: string, to: string];
}

/** Kinds that `npm run data:approve` takes. */
export function isApprovable(kind: CandidateKind): boolean {
  return kind !== "entrance-suggestions";
}

export function itemsOf({ kind, records }: CandidateFile): ReviewItem[] {
  return records.map((record) => itemOf(kind, record));
}

function itemOf(kind: CandidateKind, record: object): ReviewItem {
  const value = record as { properties?: Record<string, unknown>; geometry?: unknown };
  const facts: Record<string, unknown> = value.properties ?? (record as Record<string, unknown>);
  const text = (key: string) => (typeof facts[key] === "string" ? (facts[key] as string) : "");
  const geometry = isGeometry(value.geometry) ? value.geometry : null;
  const osmId = text("osmId") || undefined;
  const base = { id: text("id"), geometry, notApprovable: null, osmId };
  const missingId = base.id ? null : "has no id";

  switch (kind) {
    case "boundary":
      return { ...base, title: text("name") || base.id, detail: "campus outline", notApprovable: missingId };

    case "buildings": {
      const levels = Array.isArray(facts.levels) ? facts.levels.length : 0;
      const unnamed = text("name") === "Unnamed building" ? ", no name on the map yet" : "";
      return {
        ...base,
        title: text("name") || base.id,
        detail: `building, ${levels} ${levels === 1 ? "level" : "levels"}${unnamed}`,
        notApprovable: missingId,
      };
    }

    case "paths": {
      const from = text("fromNode");
      const to = text("toNode");
      const length =
        geometry?.type === "LineString" && geometry.coordinates.every(isLngLat)
          ? ` ${Math.round(polylineLengthM(geometry.coordinates as LngLat[]))} m`
          : "";
      // A recorded walk has no junctions: it is a drawing to compare with.
      if (!from || !to) {
        return {
          ...base,
          title: "Recorded walk",
          detail: `${base.id},${length}`,
          notApprovable: "A recorded walk is only a guide: draw the path in OpenStreetMap and approve that",
        };
      }
      const what = text("kind") || "path";
      return {
        ...base,
        title: text("name") || `${what[0].toUpperCase()}${what.slice(1)}`,
        detail: `${what},${length}`,
        notApprovable: missingId,
        nodes: [from, to],
      };
    }

    case "places":
      return { ...base, title: text("name") || base.id, detail: text("category") || "place", notApprovable: missingId };

    case "rooms": {
      const title = [text("roomNumber"), text("name")].filter(Boolean).join(" ");
      return {
        ...base,
        geometry: null,
        title: title || base.id,
        detail: `${text("buildingId")}, level ${String(facts.level ?? "?")}, ${text("type") || "room"}`,
        notApprovable: missingId,
      };
    }

    case "entrances":
      return {
        ...base,
        title: text("name") || base.id,
        detail: `${text("buildingId")}, level ${String(facts.level ?? "?")}, ${text("access") || "access unknown"}`,
        notApprovable: missingId,
      };

    case "entrance-suggestions": {
      const coordinates = facts.coordinates;
      const accuracy = typeof facts.claimedAccuracyM === "number" ? `, the phone said ±${facts.claimedAccuracyM} m` : "";
      return {
        ...base,
        id: `${text("buildingId")}/${text("photo")}`,
        title: text("photo") || "Photo",
        detail: `${text("buildingId")}${accuracy}`,
        geometry: isLngLat(coordinates) ? { type: "Point", coordinates } : null,
        notApprovable: "A photo position is only a hint: place the entrance yourself",
      };
    }
  }
}

function isGeometry(value: unknown): value is GeoJSON.Geometry {
  if (typeof value !== "object" || value === null) return false;
  const { type, coordinates } = value as { type?: unknown; coordinates?: unknown };
  return ["Point", "LineString", "Polygon", "MultiPolygon"].includes(type as string) && Array.isArray(coordinates);
}

/** Every position of a geometry, to frame it on the map. */
export function positionsOf(geometry: GeoJSON.Geometry): LngLat[] {
  const out: LngLat[] = [];
  const walk = (value: unknown): void => {
    if (isLngLat(value)) out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
  };
  if ("coordinates" in geometry) walk(geometry.coordinates);
  return out;
}

// --- What is approved already ---------------------------------------------------

/**
 * True for a candidate that `data:approve` would find among the approved records,
 * the same way it matches them: by id, or by OpenStreetMap object except for paths.
 */
export function approvedMatcher(dataset: PublishedDataset | null, kind: CandidateKind): (item: ReviewItem) => boolean {
  if (!dataset || dataset.mode !== "live") return () => false;

  const facts: { id: string; osmId?: string }[] = (() => {
    switch (kind) {
      case "boundary":
        return dataset.boundary ? [dataset.boundary.properties] : [];
      case "buildings":
        return dataset.buildings.map((record) => record.properties);
      case "paths":
        return dataset.paths.map((record) => ({ id: record.properties.id }));
      case "places":
        return dataset.places.map((record) => record.properties);
      case "rooms":
        return dataset.rooms;
      case "entrances":
        return dataset.entrances.map((record) => record.properties);
      case "entrance-suggestions":
        return [];
    }
  })();

  const ids = new Set(facts.map((record) => record.id));
  const osmIds = new Set(facts.flatMap((record) => (record.osmId ? [record.osmId] : [])));
  return (item) => ids.has(item.id) || (item.osmId !== undefined && osmIds.has(item.osmId));
}
