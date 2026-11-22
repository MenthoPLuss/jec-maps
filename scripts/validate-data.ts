// npm run data:validate
// Checks every dataset in src/data and reports problems. Writes nothing.
import { existsSync } from "node:fs";
import path from "node:path";

import { MANIFEST_FILE } from "../src/lib/data/constants";
import { coverageOf } from "../src/lib/data/coverage";
import { checkDatasetFolder, formatIssue, hasErrors } from "./lib/datasetFolder";

const root = path.join(process.cwd(), "src", "data");
let failed = false;

for (const name of ["demo", "live"]) {
  const folder = path.join(root, name);
  if (!existsSync(path.join(folder, MANIFEST_FILE))) {
    console.log(`${name}: no dataset yet`);
    continue;
  }

  const { dataset, issues } = checkDatasetFolder(folder);
  for (const issue of issues) console.log(`  ${formatIssue(issue)}`);

  if (!dataset || hasErrors(issues)) {
    console.log(`${name}: FAILED`);
    failed = true;
    continue;
  }

  const { live, routablePathIds } = coverageOf(dataset);
  console.log(
    `${name}: ok (${dataset.buildings.length} buildings, ${dataset.places.length} places, ` +
      `${dataset.rooms.length} rooms, ${routablePathIds.length} of ${dataset.paths.length} paths usable)`,
  );
  console.log(`  Real guidance: ${live.available ? "available" : `not available. ${live.reasons.join(" ")}`}`);
}

if (failed) process.exitCode = 1;
