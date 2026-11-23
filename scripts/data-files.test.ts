import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFilesAtomically } from "./lib/atomicWrite";
import { checkDatasetFolder } from "./lib/datasetFolder";
import { demoDatasetFiles } from "./lib/demoCampus";

const root = path.resolve(import.meta.dirname, "..");
const demoFolder = path.join(root, "src", "data", "demo");
const tsx = path.join(path.dirname(createRequire(import.meta.url).resolve("tsx/package.json")), "dist", "cli.mjs");

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), "jec-maps-data-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("the committed demo dataset", () => {
  it("is exactly what the generator makes", () => {
    for (const [name, content] of Object.entries(demoDatasetFiles())) {
      expect(readFileSync(path.join(demoFolder, ...name.split("/")), "utf8")).toBe(content);
    }
  });

  it("is marked as made up everywhere", () => {
    for (const [name, content] of Object.entries(demoDatasetFiles())) {
      if (name === "dataset-manifest.json") continue;
      const parsed = JSON.parse(content);
      for (const entry of Array.isArray(parsed) ? parsed : parsed.features) {
        expect((entry.properties ?? entry).placeholder).toBe(true);
      }
    }
  });

  it("passes every check", () => {
    const { dataset, issues } = checkDatasetFolder(demoFolder);
    expect(issues).toEqual([]);
    expect(dataset).not.toBeNull();
  });
});

describe("checkDatasetFolder", () => {
  it("explains broken JSON with the file name", () => {
    cpSync(demoFolder, workspace, { recursive: true });
    writeFileSync(path.join(workspace, "rooms.json"), "[{ oops");

    const { dataset, issues } = checkDatasetFolder(workspace);

    expect(dataset).toBeNull();
    expect(issues).toEqual([expect.objectContaining({ file: "rooms.json", message: expect.stringContaining("not valid JSON") })]);
  });

  it("accepts a file saved by Windows Notepad with a byte-order mark", () => {
    cpSync(demoFolder, workspace, { recursive: true });
    const rooms = path.join(workspace, "rooms.json");
    writeFileSync(rooms, `﻿${readFileSync(rooms, "utf8")}`);

    expect(checkDatasetFolder(workspace).issues).toEqual([]);
  });
});

describe("publish-data", () => {
  const publish = () =>
    execFileSync(process.execPath, [tsx, path.join(root, "scripts", "publish-data.ts")], {
      cwd: workspace,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, JEC_DATASET: "demo" },
    });

  beforeEach(() => {
    cpSync(demoFolder, path.join(workspace, "src", "data", "demo"), { recursive: true });
    mkdirSync(path.join(workspace, "public"));
  });

  it("writes the files for the app and leaves no temporary ones behind", () => {
    expect(publish()).toContain('demo dataset "demo-1"');

    const output = path.join(workspace, "public");
    expect(readdirSync(output)).toEqual(["data"]);
    expect(readdirSync(path.join(output, "data")).sort()).toEqual(["core.json", "indoor"]);
    expect(JSON.parse(readFileSync(path.join(output, "data", "core.json"), "utf8")).mode).toBe("demo");
  });

  it("clears what an interrupted publish left behind, because everything in public is served", () => {
    mkdirSync(path.join(workspace, "public", ".data-new-abc"));
    writeFileSync(path.join(workspace, "public", ".data-new-abc", "core.json"), "{}");

    publish();
    publish();

    expect(readdirSync(path.join(workspace, "public"))).toEqual(["data"]);
  });

  it("gives the same bytes every time", () => {
    publish();
    const first = readFileSync(path.join(workspace, "public", "data", "core.json"), "utf8");
    publish();
    expect(readFileSync(path.join(workspace, "public", "data", "core.json"), "utf8")).toBe(first);
  });

  it("stops on broken data, names the problem and keeps the last good files", () => {
    publish();
    const good = readFileSync(path.join(workspace, "public", "data", "core.json"), "utf8");

    const places = path.join(workspace, "src", "data", "demo", "places.geojson");
    writeFileSync(places, readFileSync(places, "utf8").replace('"category":"atm"', '"category":"shop"'));

    let message = "";
    try {
      publish();
    } catch (error) {
      message = (error as { stderr: string }).stderr;
    }

    expect(message).toContain("places.geojson");
    expect(message).toContain("demo-atm");
    expect(message).toContain("category");
    expect(readFileSync(path.join(workspace, "public", "data", "core.json"), "utf8")).toBe(good);
  });
});

describe("writeFilesAtomically", () => {
  it("changes nothing when one of the files can't be written", () => {
    writeFileSync(path.join(workspace, "a.json"), "old a");
    // A folder stands where b.json should go, so swapping it in must fail.
    mkdirSync(path.join(workspace, "b.json", "child"), { recursive: true });

    expect(() => writeFilesAtomically(workspace, { "a.json": "new a", "b.json": "new b" })).toThrow();

    expect(readFileSync(path.join(workspace, "a.json"), "utf8")).toBe("old a");
    expect(readdirSync(workspace).sort()).toEqual(["a.json", "b.json"]);
  });

  it("creates folders as needed", () => {
    writeFilesAtomically(workspace, { "deep/down/c.json": "c" });
    expect(existsSync(path.join(workspace, "deep", "down", "c.json"))).toBe(true);
  });
});
