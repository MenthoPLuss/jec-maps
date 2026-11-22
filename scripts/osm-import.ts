// npm run data:osm [-- --dry-run] [--radius 700] [--input answer.json] [--save answer.json]
// Downloads OpenStreetMap data around the campus and writes review candidates to
// data-candidates/osm. It never touches approved data, and never runs during a build.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { JEC_CENTRE } from "../src/lib/geo/types";
import { formatChanges, writeCandidates } from "./lib/candidates";
import { formatIssue } from "./lib/datasetFolder";
import { osmToCandidates } from "./lib/osmImport";
import { DEFAULT_ENDPOINT, askOverpass, overpassQuery } from "./lib/overpass";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      radius: { type: "string", default: "700" },
      input: { type: "string" },
      save: { type: "string" },
      attempts: { type: "string", default: "3" },
      endpoint: { type: "string", default: process.env.OVERPASS_URL || DEFAULT_ENDPOINT },
    },
  });

  let answer: unknown;
  if (values.input) {
    answer = JSON.parse(readFileSync(values.input, "utf8"));
  } else {
    console.log("Asking OpenStreetMap (Overpass). This can take a minute…");
    answer = await askOverpass(overpassQuery(JEC_CENTRE, Number(values.radius)), {
      endpoint: values.endpoint,
      attempts: Number(values.attempts),
      log: console.log,
    });
  }
  if (values.save) writeFileSync(values.save, JSON.stringify(answer));

  const { boundaries, buildings, paths, issues } = osmToCandidates(answer);
  if (boundaries.length + buildings.length + paths.length === 0) {
    throw new Error("OpenStreetMap has nothing here. Nothing was changed. Try a larger --radius.");
  }
  for (const issue of issues) console.log(`  ${formatIssue(issue)}`);

  const provenance = {
    attribution: "© OpenStreetMap contributors (ODbL)",
    origin: values.input ? "a saved Overpass answer" : values.endpoint,
    osmDataFrom: osmTimestamp(answer),
    retrievedAt: new Date().toISOString(),
  };
  const reports = writeCandidates(
    path.join(process.cwd(), "data-candidates", "osm"),
    {
      "boundaries.candidates.geojson": { kind: "boundary", provenance, records: boundaries },
      "buildings.candidates.geojson": { kind: "buildings", provenance, records: buildings },
      "paths.candidates.geojson": { kind: "paths", provenance, records: paths },
    },
    values["dry-run"],
  );

  console.log(values["dry-run"] ? "Dry run, nothing was written:" : "Candidates in data-candidates/osm:");
  for (const report of reports) console.log(formatChanges(report));
  if (boundaries.length === 0) console.log("No campus outline was found. Trace it: see docs/data-collection.md.");
  if (boundaries.length > 1) {
    console.log(`Several campus outlines were found. Choose one when you approve: ${boundaries.map((b) => b.properties.id).join(", ")}`);
  }
  console.log("Next: look at the candidates, then approve the good ones with npm run data:approve.");
}

function osmTimestamp(answer: unknown): string {
  const base = (answer as { osm3s?: { timestamp_osm_base?: unknown } }).osm3s?.timestamp_osm_base;
  return typeof base === "string" ? base : "unknown";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
