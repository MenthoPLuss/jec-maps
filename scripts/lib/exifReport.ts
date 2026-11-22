/**
 * Looks for GPS positions inside entrance photos.
 *
 * The result is a report of suggestions. A phone's photo position can be tens of
 * metres off, so a person decides which of them become entrances.
 */
import { createHash } from "node:crypto";
import path from "node:path";

import exifr from "exifr";

import type { Issue } from "../../src/lib/data/parse";
import { isLngLat, type LngLat } from "../../src/lib/geo/types";

const READABLE = /\.(jpe?g|heic|heif|tiff?)$/i;
const IGNORED = /^(\.|thumbs\.db$|desktop\.ini$)/i;

export interface PhotoFile {
  /** The folder name, which should be the id of the building. */
  buildingId: string;
  name: string;
  bytes: Buffer;
}

export interface EntranceSuggestion {
  buildingId: string;
  photo: string;
  /** [longitude, latitude] */
  coordinates: LngLat;
  /** What the phone believed, when it said so. Not a measurement. */
  claimedAccuracyM?: number;
  /** Where the camera pointed: 0 is north. */
  cameraDirectionDeg?: number;
  reviewStatus: "unreviewed";
}

export async function readPhotos(photos: PhotoFile[]): Promise<{ suggestions: EntranceSuggestion[]; issues: Issue[] }> {
  const suggestions: EntranceSuggestion[] = [];
  const issues: Issue[] = [];
  const seen = new Map<string, string>();

  const sorted = [...photos].sort((a, b) => compare(`${a.buildingId}/${a.name}`, `${b.buildingId}/${b.name}`));
  for (const { buildingId, name, bytes } of sorted) {
    if (IGNORED.test(name)) continue;
    const file = path.posix.join(buildingId, "outside", name);
    const warn = (message: string) => issues.push({ severity: "warning", file, record: "photo", field: "", message });

    if (!READABLE.test(name)) {
      warn("is not a photo type that can hold a position. Use the original JPG or HEIC");
      continue;
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const twin = seen.get(hash);
    if (twin) {
      warn(`is the same photo as ${twin}, so it was left out`);
      continue;
    }
    seen.set(hash, file);

    let tags: Record<string, unknown> | undefined;
    try {
      tags = await exifr.parse(bytes, { gps: true });
    } catch (error) {
      warn(`can't be read (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const coordinates = [tags?.longitude, tags?.latitude];
    // Some apps remove the position but leave 0, 0 behind.
    if (!isLngLat(coordinates) || (coordinates[0] === 0 && coordinates[1] === 0)) {
      warn("has no GPS position. Send the original file (not through WhatsApp) with location switched on in the camera");
      continue;
    }

    const accuracy = tags?.GPSHPositioningError;
    const direction = tags?.GPSImgDirection;
    suggestions.push({
      buildingId,
      photo: name,
      coordinates: [round(coordinates[0]), round(coordinates[1])],
      ...(isPositive(accuracy) && { claimedAccuracyM: Math.round(accuracy) }),
      ...(isPositive(direction) && { cameraDirectionDeg: Math.round(direction) }),
      reviewStatus: "unreviewed",
    });
  }

  return { suggestions, issues };
}

const isPositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const round = (value: number) => Number(value.toFixed(7));
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
