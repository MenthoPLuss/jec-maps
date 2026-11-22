/** Turns raw JSON into a typed dataset, and says exactly what is wrong when it can't. */
import type { z } from "zod";

import { MANIFEST_FILE } from "./constants";
import {
  boundarySchema,
  buildingSchema,
  entranceSchema,
  levelFeatureSchemas,
  manifestSchema,
  pathSchema,
  placeSchema,
  roomSchema,
  type BoundaryFeature,
  type BuildingFeature,
  type EntranceFeature,
  type LevelFeature,
  type Manifest,
  type PathFeature,
  type PlaceFeature,
  type Room,
} from "./schemas";

export interface Issue {
  severity: "error" | "warning";
  file: string;
  /** The id of the record, or its position when it has none. */
  record: string;
  /** The field, such as "properties.level". Empty when the whole record is meant. */
  field: string;
  message: string;
}

export interface LevelPlan {
  buildingId: string;
  level: number;
  file: string;
  features: LevelFeature[];
}

export interface Dataset {
  manifest: Manifest;
  /** Null when there is no boundary yet. */
  boundary: BoundaryFeature | null;
  buildings: BuildingFeature[];
  entrances: EntranceFeature[];
  places: PlaceFeature[];
  paths: PathFeature[];
  rooms: Room[];
  levels: LevelPlan[];
}

/** The parsed JSON of each file, by its path. A missing file is simply absent. */
export type RawFiles = Record<string, unknown>;

export interface ParseResult {
  /** Null when anything is wrong: half a dataset is never used. */
  dataset: Dataset | null;
  issues: Issue[];
}

export function parseManifest(raw: unknown): { manifest: Manifest | null; issues: Issue[] } {
  if (raw === undefined) {
    return { manifest: null, issues: [missingFile(MANIFEST_FILE)] };
  }
  const result = manifestSchema.safeParse(raw);
  if (result.success) return { manifest: result.data, issues: [] };
  return { manifest: null, issues: toIssues(result.error, MANIFEST_FILE, "manifest") };
}

export function parseDataset(files: RawFiles): ParseResult {
  const { manifest, issues } = parseManifest(files[MANIFEST_FILE]);
  if (!manifest) return { dataset: null, issues };

  const names = manifest.files;
  const collection = <S extends z.ZodType>(file: string, schema: S) =>
    parseCollection(files, file, () => schema, issues) as z.infer<S>[];

  const boundaries = collection(names.boundary, boundarySchema);
  if (boundaries.length > 1) {
    issues.push({
      severity: "error",
      file: names.boundary,
      record: boundaries.map((boundary) => boundary.properties.id).join(", "),
      field: "features",
      message: `there can be only one campus boundary, but this file has ${boundaries.length}`,
    });
  }

  const dataset: Dataset = {
    manifest,
    boundary: boundaries[0] ?? null,
    buildings: collection(names.buildings, buildingSchema),
    entrances: collection(names.entrances, entranceSchema),
    places: collection(names.places, placeSchema),
    paths: collection(names.paths, pathSchema),
    rooms: parseRooms(files, names.rooms, issues),
    levels: names.levels.map(({ buildingId, level, path }) => ({
      buildingId,
      level,
      file: path,
      features: parseCollection(files, path, levelSchemaFor, issues) as LevelFeature[],
    })),
  };

  return { dataset: issues.some((issue) => issue.severity === "error") ? null : dataset, issues };
}

/** Parses a FeatureCollection one feature at a time, so one mistake doesn't hide the others. */
export function parseCollection(
  files: RawFiles,
  file: string,
  schemaFor: (feature: unknown) => z.ZodType | string,
  issues: Issue[],
): unknown[] {
  const raw = files[file];
  if (raw === undefined) {
    issues.push(missingFile(file));
    return [];
  }
  if (!isObject(raw) || raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) {
    issues.push({
      severity: "error",
      file,
      record: "file",
      field: "type",
      message: "must be a GeoJSON FeatureCollection with a list of features",
    });
    return [];
  }

  return raw.features.flatMap((feature: unknown, index) => {
    const record = recordName(feature, index);
    const schema = schemaFor(feature);
    if (typeof schema === "string") {
      issues.push({ severity: "error", file, record, field: "properties.featureType", message: schema });
      return [];
    }
    const result = schema.safeParse(feature);
    if (result.success) return [result.data];
    issues.push(...toIssues(result.error, file, record));
    return [];
  });
}

function parseRooms(files: RawFiles, file: string, issues: Issue[]): Room[] {
  const raw = files[file];
  if (raw === undefined) {
    issues.push(missingFile(file));
    return [];
  }
  if (!Array.isArray(raw)) {
    issues.push({ severity: "error", file, record: "file", field: "", message: "must be a list of rooms" });
    return [];
  }
  return raw.flatMap((room: unknown, index) => {
    const result = roomSchema.safeParse(room);
    if (result.success) return [result.data];
    issues.push(...toIssues(result.error, file, recordName({ properties: room }, index)));
    return [];
  });
}

function levelSchemaFor(feature: unknown): z.ZodType | string {
  const type = isObject(feature) && isObject(feature.properties) ? feature.properties.featureType : undefined;
  if (typeof type === "string" && Object.hasOwn(levelFeatureSchemas, type)) {
    return levelFeatureSchemas[type as keyof typeof levelFeatureSchemas];
  }
  return `must be one of ${Object.keys(levelFeatureSchemas).join(", ")}`;
}

function recordName(feature: unknown, index: number): string {
  const properties = isObject(feature) && isObject(feature.properties) ? feature.properties : {};
  for (const key of ["id", "roomId"]) {
    const value = properties[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return `record ${index + 1}`;
}

function toIssues(error: z.ZodError, file: string, record: string): Issue[] {
  return error.issues.map((issue) => ({
    severity: "error",
    file,
    record,
    field: issue.path.join("."),
    message: issue.message,
  }));
}

function missingFile(file: string): Issue {
  return { severity: "error", file, record: "file", field: "", message: "the file is missing" };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
