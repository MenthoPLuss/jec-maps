import { describe, expect, it } from "vitest";

import { PLACE_COLUMNS, csvRow } from "./csv";

describe("csvRow", () => {
  it("fills the columns in order and leaves the rest empty", () => {
    expect(csvRow(["a", "b", "c"], { c: 3, a: "x" })).toBe("x,,3");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvRow(["a", "b"], { a: "Block A, east", b: 'the "old" hall\nfloor 1' })).toBe(
      '"Block A, east","the ""old"" hall\nfloor 1"',
    );
  });

  it("keeps lat before lng, the way spreadsheets and Google Maps show them", () => {
    expect(PLACE_COLUMNS.indexOf("lat")).toBe(PLACE_COLUMNS.indexOf("lng") - 1);
    expect(csvRow(PLACE_COLUMNS, { lat: 26.7458283, lng: 94.2506399 })).toContain("26.7458283,94.2506399");
  });
});
