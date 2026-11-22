/**
 * Turns the two spreadsheets into records of the dataset.
 *
 * This is one of the few places where "lat, lng" becomes [lng, lat]. A broken line
 * is reported with its number and left out; it is never guessed.
 */
import Papa from "papaparse";

import { PLACE_COLUMNS, ROOM_COLUMNS } from "../../src/lib/data/csv";
import { toKebabId } from "../../src/lib/data/ids";
import type { Issue } from "../../src/lib/data/parse";
import { placeSchema, roomSchema, type PlaceFeature, type Room } from "../../src/lib/data/schemas";

export interface CsvResult<T> {
  records: T[];
  issues: Issue[];
}

type Row = Record<string, string>;

export function importPlaces(csv: string, file = "places.csv"): CsvResult<PlaceFeature> {
  return importRows(csv, file, PLACE_COLUMNS, placeSchema, (row, problem) => ({
    type: "Feature",
    properties: {
      id: row.id || toKebabId(row.name),
      name: row.name,
      aliases: list(row.aliases),
      category: row.category.toLowerCase(),
      ...(row.building_id && { buildingId: row.building_id }),
      ...(row.entrance_ids && { entranceIds: list(row.entrance_ids) }),
      ...meta(row, problem),
    },
    geometry: {
      type: "Point",
      // The spreadsheet says lat, lng. Everything else in this project says [lng, lat].
      coordinates: [number(row, "lng", problem), number(row, "lat", problem)],
    },
  }));
}

export function importRooms(csv: string, file = "rooms.csv"): CsvResult<Room> {
  return importRows(csv, file, ROOM_COLUMNS, roomSchema, (row, problem) => ({
    id: row.id || toKebabId(`${row.building_id} ${row.room_number || row.name}`),
    buildingId: row.building_id,
    level: number(row, "level", problem),
    // Text on purpose: "007" must not become 7.
    roomNumber: row.room_number,
    name: row.name,
    ...(row.aliases && { aliases: list(row.aliases) }),
    type: row.type.toLowerCase(),
    ...(row.department && { department: row.department }),
    ...(row.near && { near: row.near }),
    ...(row.door_id && { doorId: row.door_id }),
    ...meta(row, problem),
  }));
}

type Problem = (field: string, message: string) => void;

interface Schema<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

function importRows<T>(
  csv: string,
  file: string,
  columns: readonly string[],
  schema: Schema<T>,
  convert: (row: Row, problem: Problem) => unknown,
): CsvResult<T> {
  const issues: Issue[] = [];
  const records: T[] = [];
  const add = (record: string, field: string, message: string) =>
    issues.push({ severity: "error", file, record, field, message });

  const parsed = Papa.parse<Row>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
    transform: (value) => value.trim(),
  });

  const header = parsed.meta.fields ?? [];
  const missing = columns.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    add("header", "", `these columns are missing: ${missing.join(", ")}. Start from the template.`);
    return { records, issues };
  }
  for (const { row, message } of parsed.errors) {
    if (row !== undefined) add(`line ${row + 2}`, "", message);
  }
  const unreadable = new Set(parsed.errors.map((error) => error.row));

  const seen = new Map<string, number>();
  parsed.data.forEach((row, index) => {
    if (unreadable.has(index)) return;
    const line = index + 2; // the header is line 1
    let broken = false;
    const value = convert(row, (field, message) => {
      broken = true;
      add(`line ${line}`, field, message);
    });
    if (broken) return;

    const result = schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) add(`line ${line}`, issue.path.join("."), issue.message);
      return;
    }

    const id = idOf(result.data);
    const earlier = seen.get(id);
    if (earlier !== undefined) {
      add(`line ${line}`, "id", `${id} is already used on line ${earlier}`);
      return;
    }
    seen.set(id, line);
    records.push(result.data);
  });

  return { records, issues };
}

function idOf(record: unknown): string {
  const value = record as { id?: string; properties?: { id: string } };
  return value.properties?.id ?? value.id ?? "";
}

function meta(row: Row, problem: Problem): object {
  const status = row.accuracy_status || (row.accuracy_note || row.accuracy_m ? "estimated" : "");
  return {
    source: row.source || "spreadsheet",
    placeholder: false,
    reviewStatus: row.review_status || "unreviewed",
    ...(status && {
      accuracy: {
        status,
        ...(row.accuracy_m && { metres: number(row, "accuracy_m", problem) }),
        ...(row.accuracy_note && { note: row.accuracy_note }),
      },
    }),
  };
}

/** A strict number: "26,74", "26.74N" and "" are problems, not 26. */
function number(row: Row, column: string, problem: Problem): number {
  const text = row[column];
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    problem(column, text === "" ? "is empty" : `"${text}" is not a plain number such as 26.7458`);
    return 0;
  }
  return Number(text);
}

/** Several values in one cell, separated by |. */
function list(cell: string): string[] {
  return cell
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}
