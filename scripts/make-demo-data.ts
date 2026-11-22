// npm run data:demo
// Writes the made-up demo campus to src/data/demo. Same input, same output.
import path from "node:path";

import { writeFilesAtomically } from "./lib/atomicWrite";
import { demoDatasetFiles } from "./lib/demoCampus";

const folder = path.join(process.cwd(), "src", "data", "demo");
const files = demoDatasetFiles();

writeFilesAtomically(folder, files);
console.log(`Wrote ${Object.keys(files).length} demo files to ${path.relative(process.cwd(), folder)}`);
