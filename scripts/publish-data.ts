// Runs before every dev start and build, and after every approval.
// Checks the active dataset and writes what the app downloads to public/data.
// The build stops when the data is broken.
//
// The active dataset is src/data/live when it exists, otherwise src/data/demo.
// JEC_DATASET=demo forces the demo, which is what the browser tests use.
import { formatIssue } from "./lib/datasetFolder";
import { publishActive } from "./lib/publishActive";

const result = publishActive(process.cwd());

if (!result.ok) {
  for (const issue of result.errors) console.error(formatIssue(issue));
  console.error(`\nThe ${result.name} dataset has ${result.errors.length} error(s). Fix them, then try again.`);
  process.exit(1);
}

console.log(
  `Campus data published: ${result.name} dataset "${result.datasetVersion}"` +
    (result.warnings > 0 ? `, ${result.warnings} warning(s). Run npm run data:validate to see them.` : "."),
);
