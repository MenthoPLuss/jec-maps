import { describe, expect, it } from "vitest";

import { isEditorRequested, isMockRequested, isReviewToolAvailable, isSafeTileUrl, readConfig } from "./config";

const params = (query: string) => new URLSearchParams(query);

describe("readConfig", () => {
  it("is private and real by default", () => {
    expect(readConfig({})).toMatchObject({ basemapMode: "local", demoEnabled: false, mockByDefault: false });
  });

  it("treats empty values like missing ones", () => {
    expect(readConfig({ basemapMode: "", tileUrl: " ", tileAttribution: "", enableDemo: "", mockLocation: "" })).toEqual(
      readConfig({}),
    );
  });

  it("uses the online map only when asked to", () => {
    expect(readConfig({ basemapMode: "online" }).basemapMode).toBe("online");
    expect(readConfig({ basemapMode: "yes" }).basemapMode).toBe("local");
  });

  it("falls back to the local map when the address is unsafe", () => {
    for (const tileUrl of ["http://tiles.example.com/{z}/{x}/{y}.png", "javascript:alert(1)", "not an address"]) {
      expect(readConfig({ basemapMode: "online", tileUrl }).basemapMode).toBe("local");
    }
  });

  it("ignores the mock setting without the demo setting", () => {
    expect(readConfig({ mockLocation: "1" }).mockByDefault).toBe(false);
    expect(readConfig({ mockLocation: "1", enableDemo: "1" }).mockByDefault).toBe(true);
  });
});

describe("demo tools", () => {
  const production = readConfig({});
  const demo = readConfig({ enableDemo: "1" });

  it("?mock=1 does nothing in a normal build", () => {
    expect(isMockRequested(production, params("mock=1"))).toBe(false);
    expect(isEditorRequested(production, params("edit=1"))).toBe(false);
  });

  it("keeps the review page out of a normal build", () => {
    expect(isReviewToolAvailable(production, "production")).toBe(false);
    expect(isReviewToolAvailable(production, undefined)).toBe(false);
    expect(isReviewToolAvailable(production, "development")).toBe(true);
    expect(isReviewToolAvailable(demo, "production")).toBe(true);
  });

  it("?mock=1 works in a demo build", () => {
    expect(isMockRequested(demo, params("mock=1"))).toBe(true);
    expect(isMockRequested(demo, params(""))).toBe(false);
    expect(isEditorRequested(demo, params("edit=1"))).toBe(true);
  });

  it("the setting can switch the fake GPS on without ?mock=1", () => {
    expect(isMockRequested(readConfig({ enableDemo: "1", mockLocation: "1" }), params(""))).toBe(true);
  });
});

describe("isSafeTileUrl", () => {
  it.each([
    ["https://tiles.openfreemap.org/styles/liberty", true],
    ["https://tile.example.com/{z}/{x}/{y}.png", true],
    ["http://localhost:8080/{z}/{x}/{y}.png", true],
    ["http://tiles.example.com/style.json", false],
    ["//tiles.example.com/style.json", false],
    ["data:application/json,{}", false],
  ])("%s: %s", (url, expected) => {
    expect(isSafeTileUrl(url)).toBe(expected);
  });
});
