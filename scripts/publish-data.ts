// Runs before every dev start and build.
// Checks the active dataset and writes what the app downloads to public/data.
// The build stops when the data is broken.
//
// The active dataset is src/data/live when it exists, otherwise src/data/demo.
// JEC_DATASET=demo forces the demo, which is what the browser tests use.
import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

import { MANIFEST_FILE } from "../src/lib/data/constants";
import { publishDataset } from "../src/lib/data/publish";
import { writeFilesAtomically } from "./lib/atomicWrite";
import { checkDatasetFolder, formatIssue, hasErrors } from "./lib/datasetFolder";

const root = process.cwd();
const datasets = path.join(root, "src", "data");
const publicFolder = path.join(root, "public");
const output = path.join(publicFolder, "data");

function activeDataset(): string {
  const wanted = process.env.JEC_DATASET;
  if (wanted !== undefined && wanted !== "" && wanted !== "demo" && wanted !== "live") {
    throw new Error(`JEC_DATASET must be demo or live, not "${wanted}"`);
  }
  if (wanted) return wanted;
  return existsSync(path.join(datasets, "live", MANIFEST_FILE)) ? "live" : "demo";
}

const name = activeDataset();
const { dataset, issues } = checkDatasetFolder(path.join(datasets, name));
const errors = issues.filter((issue) => issue.severity === "error");
for (const issue of errors) console.error(formatIssue(issue));

if (!dataset || hasErrors(issues)) {
  console.error(`\nThe ${name} dataset has ${errors.length} error(s). Fix them, then try again.`);
  process.exit(1);
}

const { core, indoor } = publishDataset(dataset);
const files: Record<string, string> = { "core.json": JSON.stringify(core) };
for (const plans of indoor) files[`indoor/${plans.buildingId}.json`] = JSON.stringify(plans);

// Build the new folder completely before it replaces the old one.
const staging = mkdtempSync(path.join(publicFolder, ".data-"));
writeFilesAtomically(staging, files);
rmSync(output, { recursive: true, force: true });
renameSync(staging, output);

const warnings = issues.length - errors.length;
console.log(
  `Campus data published: ${name} dataset "${core.datasetVersion}"` +
    (warnings > 0 ? `, ${warnings} warning(s). Run npm run data:validate to see them.` : "."),
);
