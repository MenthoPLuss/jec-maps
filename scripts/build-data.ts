// npm run data:build [-- --dry-run]
// Reads what you put in raw-data and writes review candidates to raw-data/candidates.
// It never touches approved data. raw-data stays on this computer.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import type { Issue } from "../src/lib/data/parse";
import { formatChanges, writeCandidates, type CandidateFile } from "./lib/candidates";
import { importPlaces, importRooms } from "./lib/csvImport";
import { formatIssue, hasErrors } from "./lib/datasetFolder";
import { readPhotos, type PhotoFile } from "./lib/exifReport";
import { importGpx } from "./lib/gpxImport";

const raw = path.join(process.cwd(), "raw-data");

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const issues: Issue[] = [];
  const files: Record<string, CandidateFile> = {};
  const provenance = { origin: "raw-data on this computer" };

  for (const [csv, output, kind, read] of [
    ["places.csv", "places.candidates.geojson", "places", importPlaces],
    ["rooms.csv", "rooms.candidates.json", "rooms", importRooms],
  ] as const) {
    const file = path.join(raw, csv);
    if (!existsSync(file)) continue;
    const result = read(readFileSync(file, "utf8"));
    issues.push(...result.issues);
    files[output] = { kind, provenance, records: result.records };
  }

  const tracks = path.join(raw, "tracks");
  const gpxFiles = listFiles(tracks).filter((name) => /\.gpx$/i.test(name));
  if (gpxFiles.length > 0) {
    const results = gpxFiles.map((name) => importGpx(readFileSync(path.join(tracks, name), "utf8"), name));
    issues.push(...results.flatMap((result) => result.issues));
    files["campus-paths.candidates.geojson"] = {
      kind: "paths",
      provenance,
      records: results.flatMap((result) => result.candidates),
    };
  }

  const photos: PhotoFile[] = listFolders(raw).flatMap((buildingId) => {
    const outside = path.join(raw, buildingId, "outside");
    return listFiles(outside).map((name) => ({ buildingId, name, bytes: readFileSync(path.join(outside, name)) }));
  });
  if (photos.length > 0) {
    const result = await readPhotos(photos);
    issues.push(...result.issues);
    files["entrances.report.json"] = { kind: "entrance-suggestions", provenance, records: result.suggestions };
  }

  for (const issue of issues) console.log(formatIssue(issue));
  if (Object.keys(files).length === 0) {
    throw new Error("There is nothing to import. Put your files in raw-data first: see raw-data/README.md.");
  }
  if (hasErrors(issues)) {
    throw new Error("\nNothing was written. Fix the errors above, then try again.");
  }

  const reports = writeCandidates(path.join(raw, "candidates"), files, values["dry-run"]);
  console.log(values["dry-run"] ? "Dry run, nothing was written:" : "Candidates in raw-data/candidates:");
  for (const report of reports) console.log(formatChanges(report));
  console.log("Next: check them, then approve places and rooms with npm run data:approve.");
  console.log("Recorded walks and entrance photos are suggestions: draw paths and entrances yourself (docs/data-collection.md).");
}

function listFiles(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function listFolders(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "candidates" && entry.name !== "tracks")
    .map((entry) => entry.name)
    .sort();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
