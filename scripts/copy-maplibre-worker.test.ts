import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = path.resolve(import.meta.dirname, "copy-maplibre-worker.mjs");
const dist = path.join(
  path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")),
  "dist",
);

describe("copy-maplibre-worker", () => {
  let emptyProject: string;

  beforeEach(() => {
    emptyProject = mkdtempSync(path.join(os.tmpdir(), "jec-maps-worker-"));
  });

  afterEach(() => {
    rmSync(emptyProject, { recursive: true, force: true });
  });

  it("creates both worker files from nothing, byte for byte", () => {
    execFileSync(process.execPath, [script], { cwd: emptyProject });

    const copied = path.join(emptyProject, "public", "maplibre");
    const files = readdirSync(copied).sort();

    expect(files).toEqual(["maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"]);
    for (const file of files) {
      expect(readFileSync(path.join(copied, file)).equals(readFileSync(path.join(dist, file)))).toBe(true);
    }
  });

  it("copies every file the worker imports", () => {
    execFileSync(process.execPath, [script], { cwd: emptyProject });

    const copied = path.join(emptyProject, "public", "maplibre");
    const worker = readFileSync(path.join(copied, "maplibre-gl-worker.mjs"), "utf8");
    const imports = [...worker.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((match) => match[1]);

    expect(imports.length).toBeGreaterThan(0);
    expect(readdirSync(copied)).toEqual(expect.arrayContaining(imports));
  });
});
