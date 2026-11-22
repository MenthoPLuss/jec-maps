// npm run data:approve -- --file <candidates> --ids a,b --reviewer "Your name" [--access public] [--dry-run]
// Moves candidates that a person has checked into src/data/live.
// Approved records are never changed: differences are reported, and you decide.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { checkDataset } from "../src/lib/data/checks";
import { MANIFEST_FILE } from "../src/lib/data/constants";
import { coverageOf } from "../src/lib/data/coverage";
import { parseDataset, type RawFiles } from "../src/lib/data/parse";
import { writeFilesAtomically } from "./lib/atomicWrite";
import { readCandidates, type CandidateKind } from "./lib/candidates";
import { formatIssue, hasErrors } from "./lib/datasetFolder";
import { formatCollection, formatJson } from "./lib/format";
import { mergeApproved } from "./lib/merge";

type Json = Record<string, unknown>;

const FILE_OF: Partial<Record<CandidateKind, string>> = {
  boundary: "campus-boundary.geojson",
  buildings: "buildings.geojson",
  paths: "campus-paths.geojson",
  places: "places.geojson",
  rooms: "rooms.json",
};

const NEW_MANIFEST = {
  schemaVersion: 1,
  datasetVersion: "live-1",
  mode: "live",
  title: "JEC campus",
  provenance: "OpenStreetMap and student field work. See docs/data-collection.md.",
  reviewStatus: "unreviewed",
  attribution: ["© OpenStreetMap contributors (ODbL)"],
  files: {
    boundary: "campus-boundary.geojson",
    buildings: "buildings.geojson",
    entrances: "entrances.geojson",
    places: "places.geojson",
    paths: "campus-paths.geojson",
    rooms: "rooms.json",
    levels: [],
  },
};

function main(): void {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      ids: { type: "string" },
      all: { type: "boolean", default: false },
      reviewer: { type: "string" },
      access: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (!values.file) fail('Which candidates? Use --file, such as --file data-candidates/osm/buildings.candidates.geojson');
  if (!values.reviewer?.trim()) fail('Who checked them? Use --reviewer "Your name"');
  if (!values.ids && !values.all) fail("Which records? Use --ids a,b,c or --all");
  if (values.access && !/^(public|restricted|private)$/.test(values.access)) {
    fail("--access must be public, restricted or private");
  }

  const candidates = readCandidates(values.file);
  if (!candidates) fail(`There is no file ${values.file}`);
  const target = FILE_OF[candidates.kind];
  if (!target) fail("Entrance suggestions can't be approved as they are: add the entrance to entrances.geojson yourself.");

  const wanted = values.ids?.split(",").map((id) => id.trim()).filter(Boolean);
  const chosen = candidates.records.filter((record) => values.all || wanted?.includes(idOf(record)));
  const unknown = wanted?.filter((id) => !candidates.records.some((record) => idOf(record) === id)) ?? [];
  if (unknown.length > 0) fail(`The file has no ${unknown.join(", ")}`);
  if (candidates.kind === "boundary" && chosen.length !== 1) {
    fail("A campus has one outline. Choose it with --ids.");
  }

  const reviewed = chosen.map((record) => review(record, values.reviewer as string, values.access));
  const folder = path.join(process.cwd(), "src", "data", "live");
  const live = readLive(folder);
  const before = listOf(live[target]);
  if (candidates.kind === "boundary" && before.length > 0 && idOf(before[0]) !== idOf(reviewed[0])) {
    fail(`There already is an approved outline (${idOf(before[0])}). Edit ${target} by hand to replace it.`);
  }
  const { merged, added, unchanged, conflicts } = mergeApproved(before, reviewed);

  console.log(`${added.length} new, ${unchanged.length} already approved, ${conflicts.length} different from what is approved`);
  for (const { id, fields } of conflicts) console.log(`  kept as approved: ${id} (differs in ${fields.join(", ")})`);
  if (added.length === 0) return;

  // Check the whole dataset as it would be, before anything is written.
  const next = { ...live, [target]: candidates.kind === "rooms" ? merged : { type: "FeatureCollection", features: merged } };
  const { dataset, issues } = parseDataset(next);
  if (dataset) issues.push(...checkDataset(dataset));
  for (const issue of issues) console.log(`  ${formatIssue(issue)}`);
  if (!dataset || hasErrors(issues)) fail("\nNothing was written: the result would be broken.");

  if (values["dry-run"]) {
    console.log("Dry run, nothing was written.");
    return;
  }
  mkdirSync(folder, { recursive: true });
  writeFilesAtomically(
    folder,
    Object.fromEntries(
      Object.entries(next).map(([name, content]) => [
        name,
        isCollection(content) ? formatCollection(content.features) : formatJson(content),
      ]),
    ),
  );
  console.log(`Approved: ${added.join(", ")}`);
  const { live: guidance } = coverageOf(dataset);
  console.log(guidance.available ? "Real guidance is now available." : `Real guidance is not available yet. ${guidance.reasons.join(" ")}`);
}

/** The live dataset as raw JSON, or an empty one to start with. */
function readLive(folder: string): RawFiles {
  const empty = { type: "FeatureCollection", features: [] };
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(folder, ...name.split("/")), "utf8"));

  if (!existsSync(path.join(folder, MANIFEST_FILE))) {
    const { rooms, levels, ...collections } = NEW_MANIFEST.files;
    void levels;
    return {
      [MANIFEST_FILE]: NEW_MANIFEST,
      [rooms]: [],
      ...Object.fromEntries(Object.values(collections).map((name) => [name, empty])),
    };
  }

  const manifest = read(MANIFEST_FILE) as typeof NEW_MANIFEST;
  const { levels, ...single } = manifest.files;
  const names = [...Object.values(single), ...(levels as { path: string }[]).map((level) => level.path)];
  return { [MANIFEST_FILE]: manifest, ...Object.fromEntries(names.map((name) => [name, read(name)])) };
}

function review(record: object, reviewer: string, access: string | undefined): object {
  const stamp = { reviewStatus: "reviewed", reviewedBy: reviewer.trim(), reviewedOn: new Date().toISOString().slice(0, 10) };
  const value = record as { properties?: Json };
  if (!value.properties) return { ...record, ...stamp };
  return { ...record, properties: { ...value.properties, ...(access && { access }), ...stamp } };
}

function listOf(content: unknown): object[] {
  if (Array.isArray(content)) return content as object[];
  return isCollection(content) ? (content.features as object[]) : [];
}

function isCollection(content: unknown): content is { features: unknown[] } {
  return typeof content === "object" && content !== null && Array.isArray((content as { features?: unknown }).features);
}

function idOf(record: object): string {
  const value = record as { id?: string; properties?: { id?: string } };
  return value.properties?.id ?? value.id ?? "";
}

function fail(message: string): never {
  throw new Error(message);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
