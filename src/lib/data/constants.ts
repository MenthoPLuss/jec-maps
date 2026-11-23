/** Values shared by the data checks and the app. Kept free of Zod on purpose. */

export const SCHEMA_VERSION = 1;

export const MANIFEST_FILE = "dataset-manifest.json";

export const PLACE_CATEGORIES = [
  "gate",
  "department",
  "library",
  "canteen",
  "hostel",
  "admin",
  "hall",
  "ground",
  "parking",
  "medical",
  "atm",
  "other",
] as const;

export const ROOM_TYPES = [
  "classroom",
  "lab",
  "office",
  "hod",
  "staffroom",
  "toilet",
  "stairs",
  "lift",
  "hall",
  "store",
  "other",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export type RoomType = (typeof ROOM_TYPES)[number];

/** An entrance should be this close to its building's outline and to its path junction. */
export const ENTRANCE_TOLERANCE_M = 10;
