import { describe, expect, it } from "vitest";

import { PLACE_COLUMNS, ROOM_COLUMNS, csvRow, type PlaceColumn, type RoomColumn } from "../../src/lib/data/csv";
import { importPlaces, importRooms } from "./csvImport";

const places = (...rows: Partial<Record<PlaceColumn, string>>[]) =>
  [PLACE_COLUMNS.join(","), ...rows.map((row) => csvRow(PLACE_COLUMNS, row))].join("\n");
const rooms = (...rows: Partial<Record<RoomColumn, string>>[]) =>
  [ROOM_COLUMNS.join(","), ...rows.map((row) => csvRow(ROOM_COLUMNS, row))].join("\n");

const gate = { name: "Main Gate", category: "gate", lat: "26.7441556", lng: "94.2506399" };
const lab = { building_id: "ee-dept", level: "1", room_number: "007", name: "Machines Lab", type: "lab" };

describe("importPlaces", () => {
  it("turns lat, lng into [lng, lat]", () => {
    const { records, issues } = importPlaces(places(gate));

    expect(issues).toEqual([]);
    expect(records[0].geometry.coordinates).toEqual([94.2506399, 26.7441556]);
  });

  it("makes an id from the name, and is neither reviewed nor a placeholder by default", () => {
    expect(importPlaces(places(gate)).records[0].properties).toEqual({
      id: "main-gate",
      name: "Main Gate",
      aliases: [],
      category: "gate",
      source: "spreadsheet",
      placeholder: false,
      reviewStatus: "unreviewed",
    });
  });

  it("catches swapped columns: 94 is no latitude", () => {
    const { records, issues } = importPlaces(places({ ...gate, lat: gate.lng, lng: gate.lat }));

    expect(records).toEqual([]);
    expect(issues[0]).toMatchObject({ record: "line 2", field: "geometry.coordinates.1" });
    expect(issues[0].message).toContain("swapped");
  });

  it.each(["", "26,7441", "26.7N", "abc", "1e3", "NaN"])("does not guess the number %j", (lat) => {
    const { records, issues } = importPlaces(places({ ...gate, lat }));

    expect(records).toEqual([]);
    expect(issues).toEqual([expect.objectContaining({ record: "line 2", field: "lat" })]);
  });

  it("reads several aliases and the accuracy", () => {
    const { records } = importPlaces(
      places({ ...gate, aliases: "front gate | gate 1", accuracy_m: "4", accuracy_note: "3 phone fixes" }),
    );

    expect(records[0].properties.aliases).toEqual(["front gate", "gate 1"]);
    expect(records[0].properties.accuracy).toEqual({ status: "estimated", metres: 4, note: "3 phone fixes" });
  });

  it("refuses a measured accuracy without evidence", () => {
    const { issues } = importPlaces(places({ ...gate, accuracy_m: "4" }));

    expect(issues[0].field).toContain("accuracy.metres");
  });

  it("keeps the good lines and reports the bad ones", () => {
    const { records, issues } = importPlaces(
      places(gate, { ...gate, name: "Shop", category: "shop" }, { ...gate, name: "ATM", category: "ATM" }),
    );

    expect(records.map((record) => record.properties.id)).toEqual(["main-gate", "atm"]);
    expect(issues).toEqual([expect.objectContaining({ record: "line 3", field: "properties.category" })]);
  });

  it("reports an id that is used twice", () => {
    const { records, issues } = importPlaces(places(gate, gate));

    expect(records).toHaveLength(1);
    expect(issues[0].message).toContain("line 2");
  });

  it("explains missing columns", () => {
    const { issues } = importPlaces("name,lat\nMain Gate,26.7");

    expect(issues[0]).toMatchObject({ record: "header" });
    expect(issues[0].message).toContain("lng");
  });

  it("reports a line with too few cells instead of shifting it", () => {
    const { records, issues } = importPlaces(`${PLACE_COLUMNS.join(",")}\nx,Main Gate`);

    expect(records).toEqual([]);
    expect(issues[0].record).toBe("line 2");
  });

  it("copes with what Excel writes: a byte-order mark, CRLF, blank lines, capital headers", () => {
    const csv = `﻿${places(gate).replace("id,name", "ID,Name").replaceAll("\n", "\r\n")}\r\n\r\n`;
    const { records, issues } = importPlaces(csv);

    expect(issues).toEqual([]);
    expect(records).toHaveLength(1);
  });

  it("gives the same result every time", () => {
    const csv = places(gate, { ...gate, name: "ATM", category: "atm" });

    expect(importPlaces(csv)).toEqual(importPlaces(csv));
  });
});

describe("importRooms", () => {
  it("keeps room numbers as text, with leading zeros", () => {
    const { records, issues } = importRooms(rooms(lab));

    expect(issues).toEqual([]);
    expect(records[0]).toMatchObject({ id: "ee-dept-007", buildingId: "ee-dept", level: 1, roomNumber: "007" });
  });

  it("accepts basements and letters", () => {
    const { records } = importRooms(rooms({ ...lab, level: "-1", room_number: "B-12A" }));

    expect(records[0]).toMatchObject({ id: "ee-dept-b-12a", level: -1, roomNumber: "B-12A" });
  });

  it("does not accept half a floor", () => {
    expect(importRooms(rooms({ ...lab, level: "1.5" })).issues[0].field).toBe("level");
  });

  it("uses the name when there is no plate", () => {
    const { records } = importRooms(rooms({ ...lab, room_number: "", name: "Toilet East", type: "toilet" }));

    expect(records[0]).toMatchObject({ id: "ee-dept-toilet-east", roomNumber: "" });
  });
});
