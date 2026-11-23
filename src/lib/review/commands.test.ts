import { describe, expect, it } from "vitest";

import { approveCommands, candidatePath, fileNameProblem, reviewerProblem } from "./commands";

describe("candidatePath", () => {
  it("knows where the importers put their files", () => {
    expect(candidatePath("paths.candidates.geojson")).toBe("data-candidates/osm/paths.candidates.geojson");
    expect(candidatePath("rooms.candidates.json")).toBe("raw-data/candidates/rooms.candidates.json");
    expect(candidatePath("entrances.candidates.geojson")).toBe("raw-data/candidates/entrances.candidates.geojson");
  });

  it("wants file names that need no quotes", () => {
    expect(fileNameProblem("campus-paths.candidates.geojson")).toBeNull();
    expect(fileNameProblem("entrances.candidates (1).geojson")).toMatch(/Rename/);
  });
});

describe("reviewerProblem", () => {
  it.each(["Anjali Bora", "Ma'am Dutta", "R. K. Das-Gogoi", "অসীম"])("takes %s", (name) => {
    expect(reviewerProblem(name)).toBeNull();
  });

  it.each([
    ["", /Type your name/],
    ["   ", /Type your name/],
    ['Me" --all', /Use only/],
    ["$(rm -rf)", /Use only/],
    ["`whoami`", /Use only/],
    ["x".repeat(61), /too long/],
  ])("refuses %j", (name, message) => {
    expect(reviewerProblem(name)).toMatch(message);
  });
});

describe("approveCommands", () => {
  it("writes the command for the terminal", () => {
    expect(
      approveCommands({ fileName: "paths.candidates.geojson", ids: ["osm-way-1-1", "osm-way-1-2"], reviewer: " Anjali ", access: "public" }),
    ).toEqual([
      'npm run data:approve -- --file data-candidates/osm/paths.candidates.geojson --ids osm-way-1-1,osm-way-1-2 --access public --reviewer "Anjali"',
    ]);
    expect(approveCommands({ fileName: "buildings.candidates.geojson", ids: ["jec-library"], reviewer: "Anjali" })).toEqual([
      'npm run data:approve -- --file data-candidates/osm/buildings.candidates.geojson --ids jec-library --reviewer "Anjali"',
    ]);
  });

  it("writes nothing without a choice, a usable name or a usable file name", () => {
    expect(approveCommands({ fileName: "buildings.candidates.geojson", ids: [], reviewer: "Anjali" })).toEqual([]);
    expect(approveCommands({ fileName: "buildings.candidates.geojson", ids: ["a"], reviewer: '"' })).toEqual([]);
    expect(approveCommands({ fileName: "my file.geojson", ids: ["a"], reviewer: "Anjali" })).toEqual([]);
  });

  it("splits long lists into commands that Windows can still run", () => {
    const ids = Array.from({ length: 300 }, (_, index) => `osm-way-123456789-${index}`);
    const commands = approveCommands({ fileName: "paths.candidates.geojson", ids, reviewer: "Anjali", access: "public" });

    expect(commands.length).toBeGreaterThan(1);
    for (const command of commands) {
      expect(command.length).toBeLessThanOrEqual(2_000);
      expect(command).toMatch(/--access public --reviewer "Anjali"$/);
    }
    expect(commands.flatMap((command) => command.match(/--ids (\S+)/)?.[1].split(",") ?? [])).toEqual(ids);
  });
});
