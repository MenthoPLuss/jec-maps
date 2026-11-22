/** The columns of the spreadsheets, shared by the importer, the templates and the place editor. */

export const PLACE_COLUMNS = [
  "id",
  "name",
  "aliases",
  "category",
  "lat",
  "lng",
  "building_id",
  "entrance_ids",
  "source",
  "review_status",
  "accuracy_status",
  "accuracy_m",
  "accuracy_note",
] as const;

export const ROOM_COLUMNS = [
  "id",
  "building_id",
  "level",
  "room_number",
  "name",
  "aliases",
  "type",
  "department",
  "near",
  "door_id",
  "source",
  "review_status",
  "accuracy_status",
  "accuracy_m",
  "accuracy_note",
] as const;

export type PlaceColumn = (typeof PLACE_COLUMNS)[number];
export type RoomColumn = (typeof ROOM_COLUMNS)[number];

/** One line of a spreadsheet. Columns that aren't given stay empty. */
export function csvRow<Column extends string>(
  columns: readonly Column[],
  values: Partial<Record<Column, string | number>>,
): string {
  return columns.map((column) => csvCell(values[column] ?? "")).join(",");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
