/**
 * The shape of every campus data file.
 *
 * Only scripts and tests run these checks, so Zod never reaches the browser. App
 * code imports the types below with `import type`.
 */
import { z } from "zod";

import { PLACE_CATEGORIES, ROOM_TYPES, SCHEMA_VERSION } from "./constants";
import { isKebabId } from "./ids";

// --- Building blocks ---------------------------------------------------------

const id = z.string().refine(isKebabId, "must be lower-case words joined by dashes, such as main-gate");

const level = z.number().int().min(-5).max(40);

const longitude = z.number().min(-180).max(180);
const latitude = z
  .number()
  .min(-90, "latitude must be between -90 and 90. Are longitude and latitude swapped?")
  .max(90, "latitude must be between -90 and 90. Are longitude and latitude swapped?");

/** Always [longitude, latitude]. */
const position = z.tuple([longitude, latitude]);

const ring = z
  .array(position)
  .min(4, "a ring needs at least 4 positions")
  .refine(
    (points) => {
      const first = points[0];
      const last = points.at(-1);
      return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
    },
    "the ring is not closed: its first and last positions must be the same",
  );

const point = z.object({ type: z.literal("Point"), coordinates: position });
const lineString = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(position).min(2, "a line needs at least 2 positions"),
});
const polygon = z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) });
const multiPolygon = z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)).min(1) });
const area = z.discriminatedUnion("type", [polygon, multiPolygon]);

export const reviewStatusSchema = z.enum(["unreviewed", "reviewed", "rejected"]);

const accuracy = z
  .strictObject({
    status: z.enum(["unknown", "estimated", "verified"]),
    /** Only with evidence: say in the note how it was measured. */
    metres: z.number().positive().optional(),
    note: z.string().min(1).optional(),
  })
  .refine((value) => value.metres === undefined || (value.status !== "unknown" && value.note !== undefined), {
    error: "a measured accuracy needs the status estimated or verified, and a note saying how it was measured",
    path: ["metres"],
  })
  .refine((value) => value.status !== "verified" || value.note !== undefined, {
    error: "a verified accuracy needs a note with the evidence",
    path: ["note"],
  });

/** Every record says where it comes from and whether a person has checked it. */
const meta = z.strictObject({
  /** Where it comes from, such as "osm", "field survey" or "demo fixture". */
  source: z.string().min(1),
  /** True for made-up records. */
  placeholder: z.boolean(),
  reviewStatus: reviewStatusSchema,
  accuracy: accuracy.optional(),
});

const reviewRule = <T extends z.ZodType<{ placeholder: boolean; reviewStatus: string }>>(schema: T) =>
  schema.refine((record) => !(record.placeholder && record.reviewStatus === "reviewed"), {
    error: "a placeholder cannot be reviewed: set placeholder to false, or reviewStatus to unreviewed",
    path: ["reviewStatus"],
  });

const feature = <G extends z.ZodType, P extends z.ZodType>(geometry: G, properties: P) =>
  z.object({ type: z.literal("Feature"), geometry, properties });

// --- Campus ------------------------------------------------------------------

export const boundarySchema = feature(area, reviewRule(meta.extend({ id, name: z.string().min(1) })));

export const buildingSchema = feature(
  area,
  reviewRule(
    meta.extend({
      id,
      name: z.string().min(1),
      shortName: z.string().min(1),
      departments: z.array(z.string().min(1)),
      levels: z
        .array(z.strictObject({ ordinal: level, name: z.string().min(1) }))
        .min(1, "a building needs at least one level")
        .refine((levels) => new Set(levels.map((entry) => entry.ordinal)).size === levels.length, {
          error: "two levels have the same ordinal",
        }),
      defaultLevel: level.optional(),
      entranceIds: z.array(id),
      /** The OpenStreetMap object, kept apart from our own id. */
      osmId: z
        .string()
        .regex(/^(node|way|relation)\/\d+$/, "must look like way/123 or relation/456")
        .optional(),
    }),
  ).refine(
    (building) =>
      building.defaultLevel === undefined || building.levels.some((entry) => entry.ordinal === building.defaultLevel),
    { error: "defaultLevel is not one of the levels", path: ["defaultLevel"] },
  ),
);

export const entranceSchema = feature(
  point,
  reviewRule(
    meta.extend({
      id,
      buildingId: id,
      level,
      name: z.string().min(1),
      access: z.enum(["public", "restricted", "closed", "unknown"]),
      accessibility: z
        .strictObject({
          stepFree: z.enum(["yes", "no", "unknown"]),
          reviewStatus: reviewStatusSchema,
          note: z.string().min(1).optional(),
        })
        .optional(),
      /** The junction of the campus paths that this door opens onto. */
      outdoorNodeId: id,
      /** The junction of the corridors behind this door, when there is a floor plan. */
      indoorNodeId: id.optional(),
    }),
  ),
);

export const placeSchema = feature(
  point,
  reviewRule(
    meta.extend({
      id,
      name: z.string().min(1),
      aliases: z.array(z.string().min(1)),
      category: z.enum(PLACE_CATEGORIES),
      buildingId: id.optional(),
      entranceIds: z.array(id).optional(),
    }),
  ),
);

/** One walkable stretch between two junctions. Paths meet only where they share a junction. */
export const pathSchema = feature(
  lineString,
  reviewRule(
    meta.extend({
      id,
      name: z.string().min(1).optional(),
      /** The junction at the first position. */
      fromNode: id,
      /** The junction at the last position. */
      toNode: id,
      kind: z.enum(["footway", "road", "steps", "ramp", "connector"]),
      access: z.enum(["public", "restricted", "private", "unknown"]),
      /** Which way people may walk, relative to the order of the positions. */
      direction: z.enum(["both", "forward", "backward"]),
      /** 0 is the ground, 1 a bridge, -1 a tunnel. */
      layer: z.number().int().min(-5).max(5),
      /** Why we believe people can walk here. */
      evidence: z.string().min(1).optional(),
    }),
  ).refine((path) => path.fromNode !== path.toNode, {
    error: "a path must join two different junctions: split a loop in two",
    path: ["toNode"],
  }),
);

// --- Inside buildings --------------------------------------------------------

export const roomSchema = reviewRule(
  meta.extend({
    id,
    buildingId: id,
    level,
    /** Text, because numbers like "007" and "B-12A" exist. Empty when there is no plate. */
    roomNumber: z.string().max(20),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).optional(),
    type: z.enum(ROOM_TYPES),
    department: z.string().min(1).optional(),
    /** A hint in words, such as "next to the stairs". */
    near: z.string().min(1).optional(),
    /** The door on the floor plan, when there is one. */
    doorId: id.optional(),
  }),
);

/** Counted while walking away from a junction: "the 3rd door on the right". */
const doorOrder = z.strictObject({
  fromNode: id,
  side: z.enum(["left", "right"]),
  index: z.number().int().min(1),
});

const roomShapeSchema = feature(area, reviewRule(meta.extend({ featureType: z.literal("room"), roomId: id })));

const corridorSchema = feature(
  lineString,
  reviewRule(
    meta.extend({
      featureType: z.literal("corridor"),
      id,
      fromNode: id,
      toNode: id,
      access: z.enum(["public", "restricted", "unknown"]),
    }),
  ).refine((corridor) => corridor.fromNode !== corridor.toNode, {
    error: "a corridor must join two different junctions: split a loop in two",
    path: ["toNode"],
  }),
);

const doorSchema = feature(
  point,
  reviewRule(
    meta.extend({
      featureType: z.literal("door"),
      id,
      roomId: id,
      /** The corridor junction in front of this door. */
      nodeId: id,
      order: z.array(doorOrder).optional(),
    }),
  ),
);

const verticalSchema = feature(
  point,
  reviewRule(
    meta.extend({
      featureType: z.literal("vertical"),
      id,
      /** The same on every floor that the stairs or lift reach. */
      connectorId: id,
      kind: z.enum(["stairs", "lift"]),
      name: z.string().min(1).optional(),
      level,
      /** The corridor junction in front of it, on this floor. */
      nodeId: id,
      /** Where it goes: the floors and the junctions there. */
      connects: z.array(z.strictObject({ level, nodeId: id })).min(1),
    }),
  ),
);

/** One feature of a `level-<n>.geojson` file. */
export const levelFeatureSchemas = {
  room: roomShapeSchema,
  corridor: corridorSchema,
  door: doorSchema,
  vertical: verticalSchema,
} as const;

// --- The manifest ------------------------------------------------------------

const relativePath = z
  .string()
  .regex(/^(?!.*\.\.)[a-z0-9][a-z0-9/._-]*$/, "must be a relative path of lower-case letters, digits, / . _ -");

export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  datasetVersion: z.string().min(1),
  /** Demo data is never used to guide a real person. */
  mode: z.enum(["demo", "live"]),
  title: z.string().min(1),
  provenance: z.string().min(1),
  reviewStatus: reviewStatusSchema,
  attribution: z.array(z.string().min(1)),
  files: z.strictObject({
    boundary: relativePath,
    buildings: relativePath,
    entrances: relativePath,
    places: relativePath,
    paths: relativePath,
    rooms: relativePath,
    levels: z.array(z.strictObject({ buildingId: id, level, path: relativePath })),
  }),
});

// --- Types -------------------------------------------------------------------

export type Manifest = z.infer<typeof manifestSchema>;
export type BoundaryFeature = z.infer<typeof boundarySchema>;
export type BuildingFeature = z.infer<typeof buildingSchema>;
export type EntranceFeature = z.infer<typeof entranceSchema>;
export type PlaceFeature = z.infer<typeof placeSchema>;
export type PathFeature = z.infer<typeof pathSchema>;
export type Room = z.infer<typeof roomSchema>;
export type RoomShapeFeature = z.infer<typeof roomShapeSchema>;
export type CorridorFeature = z.infer<typeof corridorSchema>;
export type DoorFeature = z.infer<typeof doorSchema>;
export type VerticalFeature = z.infer<typeof verticalSchema>;
export type LevelFeature = RoomShapeFeature | CorridorFeature | DoorFeature | VerticalFeature;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
