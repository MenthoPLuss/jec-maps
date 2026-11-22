import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLACE_COLUMNS, ROOM_COLUMNS, csvRow } from "../src/lib/data/csv";
import { checkDatasetFolder } from "./lib/datasetFolder";

const root = path.resolve(import.meta.dirname, "..");
const tsx = path.join(path.dirname(createRequire(import.meta.url).resolve("tsx/package.json")), "dist", "cli.mjs");

let workspace: string;
const file = (...parts: string[]) => path.join(workspace, ...parts);
const read = (...parts: string[]) => readFileSync(file(...parts), "utf8");

function run(script: string, ...args: string[]): { code: number | null; output: string } {
  const result = spawnSync(process.execPath, [tsx, path.join(root, "scripts", script), ...args], {
    cwd: workspace,
    encoding: "utf8",
  });
  return { code: result.status, output: result.stdout + result.stderr };
}

beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), "jec-maps-import-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const square = (lng: number, lat: number) =>
  [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]].map(([x, y]) => ({ lat: lat + y * 0.0003, lon: lng + x * 0.0003 }));

const osmAnswer = {
  osm3s: { timestamp_osm_base: "2026-11-20T00:00:00Z" },
  elements: [
    { type: "way", id: 1, tags: { amenity: "college", name: "JEC" }, geometry: square(94.2505, 26.7457) },
    { type: "way", id: 2, tags: { building: "yes", name: "JEC Library" }, geometry: square(94.2506, 26.7458) },
    {
      type: "way",
      id: 3,
      tags: { highway: "footway", foot: "yes" },
      nodes: [11, 12],
      geometry: [{ lat: 26.7458, lon: 94.2505 }, { lat: 26.7459, lon: 94.2512 }],
    },
  ],
};

describe("data:osm", () => {
  const saved = () => {
    writeFileSync(file("answer.json"), JSON.stringify(osmAnswer));
    return ["--input", "answer.json"];
  };

  it("writes unreviewed candidates with the credit line", () => {
    const { code, output } = run("osm-import.ts", ...saved());

    expect(output).toContain("buildings.candidates.geojson: 1 new");
    expect(code).toBe(0);
    const buildings = JSON.parse(read("data-candidates", "osm", "buildings.candidates.geojson"));
    expect(buildings).toMatchObject({ candidates: true, kind: "buildings", attribution: "© OpenStreetMap contributors (ODbL)" });
    expect(buildings.features[0].properties).toMatchObject({ osmId: "way/2", reviewStatus: "unreviewed" });
    expect(existsSync(file("src"))).toBe(false); // approved data is never touched
  });

  it("changes nothing the second time", () => {
    run("osm-import.ts", ...saved());
    const before = read("data-candidates", "osm", "buildings.candidates.geojson");

    expect(run("osm-import.ts", ...saved()).output).toContain("buildings.candidates.geojson: no changes");
    expect(read("data-candidates", "osm", "buildings.candidates.geojson")).toBe(before);
  });

  it("writes nothing in a dry run", () => {
    expect(run("osm-import.ts", ...saved(), "--dry-run").output).toContain("1 new, 0 changed, 0 gone (not written)");
    expect(existsSync(file("data-candidates"))).toBe(false);
  });

  it("fails clearly when the server can't be reached, and keeps earlier candidates", () => {
    run("osm-import.ts", ...saved());
    const before = read("data-candidates", "osm", "paths.candidates.geojson");
    const { code, output } = run("osm-import.ts", "--endpoint", "http://127.0.0.1:9", "--attempts", "1");

    expect(code).toBe(1);
    expect(output).toContain("can't be reached. Nothing was changed");
    expect(output).not.toContain("    at "); // no stack trace for a student
    expect(read("data-candidates", "osm", "paths.candidates.geojson")).toBe(before);
  });

  it("fails when there is nothing on the map", () => {
    writeFileSync(file("answer.json"), '{"elements":[]}');
    const { code, output } = run("osm-import.ts", "--input", "answer.json");

    expect(code).toBe(1);
    expect(output).toContain("nothing here");
  });
});

describe("data:build", () => {
  const place = { name: "Main Gate", category: "gate", lat: "26.7441556", lng: "94.2506399" };
  const writePlaces = (...rows: object[]) => {
    mkdirSync(file("raw-data"), { recursive: true });
    writeFileSync(
      file("raw-data", "places.csv"),
      [PLACE_COLUMNS.join(","), ...rows.map((row) => csvRow(PLACE_COLUMNS, row))].join("\r\n"),
    );
  };

  it("writes candidates from spreadsheets and walks", () => {
    writePlaces(place);
    mkdirSync(file("raw-data", "tracks"));
    writeFileSync(
      file("raw-data", "tracks", "walk.gpx"),
      '<gpx><trk><trkseg><trkpt lat="26.7451" lon="94.2501"/><trkpt lat="26.7461" lon="94.2501"/></trkseg></trk></gpx>',
    );
    const { code, output } = run("build-data.ts");

    expect(output).toContain("places.candidates.geojson: 1 new");
    expect(code).toBe(0);
    expect(readdirSync(file("raw-data", "candidates")).sort()).toEqual([
      "campus-paths.candidates.geojson",
      "places.candidates.geojson",
    ]);
  });

  it("writes nothing at all when one line is broken, and names it", () => {
    writePlaces(place);
    run("build-data.ts");
    const before = read("raw-data", "candidates", "places.candidates.geojson");
    writePlaces({ ...place, name: "New Gate" }, { ...place, name: "Bad", lat: "oops" });
    const { code, output } = run("build-data.ts");

    expect(code).toBe(1);
    expect(output).toContain("line 3 › lat");
    expect(read("raw-data", "candidates", "places.candidates.geojson")).toBe(before);
  });

  it("says so when there is nothing to import", () => {
    expect(run("build-data.ts")).toMatchObject({ code: 1, output: expect.stringContaining("nothing to import") });
  });
});

describe("data:approve", () => {
  const osm = (name: string) => ["--file", path.join("data-candidates", "osm", `${name}.candidates.geojson`)];
  const as = ["--reviewer", "Test Student"];

  beforeEach(() => {
    writeFileSync(file("answer.json"), JSON.stringify(osmAnswer));
    run("osm-import.ts", "--input", "answer.json");
  });

  it("starts a live dataset, and explains what is still missing", () => {
    const { code, output } = run("approve-data.ts", ...osm("buildings"), "--ids", "jec-library", ...as);

    expect(code).toBe(0);
    expect(output).toContain("Approved: jec-library");
    expect(output).toContain("Real guidance is not available yet");
    const { dataset, issues } = checkDatasetFolder(file("src", "data", "live"));
    expect(issues).toEqual([]);
    expect(dataset?.buildings[0].properties).toMatchObject({ reviewStatus: "reviewed", reviewedBy: "Test Student" });
  });

  it("makes real guidance available once the outline and paths are reviewed", () => {
    run("approve-data.ts", ...osm("boundaries"), "--ids", "jec", ...as);
    const { output } = run("approve-data.ts", ...osm("paths"), "--all", ...as);

    expect(output).toContain("Real guidance is now available");
  });

  it("never overwrites what is approved", () => {
    run("approve-data.ts", ...osm("buildings"), "--all", ...as);
    const live = file("src", "data", "live", "buildings.geojson");
    writeFileSync(live, readFileSync(live, "utf8").replace('"name":"JEC Library"', '"name":"Central Library"'));
    const { code, output } = run("approve-data.ts", ...osm("buildings"), "--all", ...as);

    expect(code).toBe(0);
    expect(output).toContain("kept as approved: jec-library (differs in name)");
    expect(readFileSync(live, "utf8")).toContain("Central Library");
  });

  it("writes nothing when the result would be broken", () => {
    run("approve-data.ts", ...osm("buildings"), "--all", ...as);
    mkdirSync(file("raw-data"), { recursive: true });
    writeFileSync(
      file("raw-data", "rooms.csv"),
      [ROOM_COLUMNS.join(","), csvRow(ROOM_COLUMNS, { building_id: "no-such-building", level: 0, room_number: "1", name: "Lab", type: "lab" })].join("\n"),
    );
    run("build-data.ts");
    const { code, output } = run("approve-data.ts", "--file", path.join("raw-data", "candidates", "rooms.candidates.json"), "--all", ...as);

    expect(code).toBe(1);
    expect(output).toContain("there is no building no-such-building");
    expect(JSON.parse(read("src", "data", "live", "rooms.json"))).toEqual([]);
  });

  it.each([
    [["--ids", "jec-library"], "--reviewer"],
    [["--reviewer", "Me"], "--ids"],
    [["--ids", "nope", "--reviewer", "Me"], "has no nope"],
    [["--all", "--reviewer", "Me", "--access", "maybe"], "--access"],
  ])("asks for what is missing: %j", (args, message) => {
    const { code, output } = run("approve-data.ts", ...osm("buildings"), ...args);

    expect(code).toBe(1);
    expect(output).toContain(message);
    expect(existsSync(file("src"))).toBe(false);
  });

  it("wants an explicit choice between several campus outlines", () => {
    const second = { ...osmAnswer.elements[0], id: 9, tags: { amenity: "college", name: "Other College" } };
    writeFileSync(file("answer.json"), JSON.stringify({ ...osmAnswer, elements: [...osmAnswer.elements, second] }));
    expect(run("osm-import.ts", "--input", "answer.json").output).toContain("Several campus outlines");

    expect(run("approve-data.ts", ...osm("boundaries"), "--all", ...as)).toMatchObject({ code: 1 });
    expect(run("approve-data.ts", ...osm("boundaries"), "--ids", "jec", ...as)).toMatchObject({ code: 0 });
    // A second outline can't slip in later either.
    expect(run("approve-data.ts", ...osm("boundaries"), "--ids", "other-college", ...as)).toMatchObject({ code: 1 });
  });
});

describe("the templates", () => {
  it.each([
    ["places.template.csv", PLACE_COLUMNS],
    ["rooms.template.csv", ROOM_COLUMNS],
  ])("%s has every column", (name, columns) => {
    expect(readFileSync(path.join(root, "raw-data", name), "utf8").split(/\r?\n/)[0]).toBe(columns.join(","));
  });

  it("can be imported as they are", () => {
    cpSync(path.join(root, "raw-data", "places.template.csv"), file("raw-data", "places.csv"));
    cpSync(path.join(root, "raw-data", "rooms.template.csv"), file("raw-data", "rooms.csv"));

    expect(run("build-data.ts").code).toBe(0);
  });
});
