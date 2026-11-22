import { describe, expect, it } from "vitest";

import { published } from "../data/testing";
import { CampusSearch } from "./search";

const search = new CampusSearch(published().core);
const names = (query: string) => search.find(query).map((item) => item.name);

describe("CampusSearch", () => {
  it.each([
    ["by name", "library", "Demo Library"],
    ["with a typo", "libary", "Demo Library"],
    ["by alias", "food", "Demo Canteen"],
    ["by category", "hostel", "Demo Hostel"],
    ["by room number", "A-102", "A-102 Demo Drawing Hall"],
    ["by room number without the dash", "a102", "A-102 Demo Drawing Hall"],
    ["by room number in another case", "102a", "102A Demo Physics Lab"],
    ["by what a room is", "computer lab", "A-105 Demo Computer Lab"],
    ["by department", "department of samples", "Demo Block B"],
  ])("finds things %s", (_name, query, expected) => {
    expect(names(query)).toContain(expected);
  });

  it("puts an exact room number first, and keeps leading zeros apart", () => {
    expect(names("101")[0]).toBe("101 Demo Lecture Hall");
    expect(names("001")[0]).toBe("001 Demo Reception");
  });

  it("says where a room is", () => {
    expect(search.find("A-102")[0].detail).toBe("Floor 1 · Demo Block A");
  });

  it("finds nothing for nothing or nonsense", () => {
    expect(search.find("")).toEqual([]);
    expect(search.find("   ")).toEqual([]);
    expect(search.find("qqqqzzzz")).toEqual([]);
  });

  it("shows a handful, not everything", () => {
    expect(search.find("demo").length).toBeLessThanOrEqual(12);
  });

  it("gives every result its own key", () => {
    expect(new Set(search.items.map((item) => item.key)).size).toBe(search.items.length);
  });
});
