import { describe, expect, it } from "vitest";

import { isKebabId, toKebabId } from "./ids";

describe("toKebabId", () => {
  it.each([
    ["Main Gate", "main-gate"],
    ["EE Dept.", "ee-dept"],
    ["Computer Science & Engineering", "computer-science-and-engineering"],
    ["E&E", "e-and-e"],
    ["  Hostel   No. 4  ", "hostel-no-4"],
    ["Café", "cafe"],
  ])("turns %j into %j", (name, id) => {
    expect(toKebabId(name)).toBe(id);
  });

  it("returns an empty string when there is nothing usable", () => {
    expect(toKebabId("  --- ")).toBe("");
  });

  it("always produces a valid id or an empty string", () => {
    for (const name of ["Room 204 (Annexe)", "A/B block", "ÉLECTRICAL", "9th hostel"]) {
      expect(isKebabId(toKebabId(name))).toBe(true);
    }
  });
});

describe("isKebabId", () => {
  it.each(["main-gate", "ee-dept-204", "hostel", "9"])("accepts %j", (id) => {
    expect(isKebabId(id)).toBe(true);
  });

  it.each(["", "Main-Gate", "main gate", "-gate", "gate-", "main--gate", "café"])(
    "rejects %j",
    (id) => {
      expect(isKebabId(id)).toBe(false);
    },
  );
});
