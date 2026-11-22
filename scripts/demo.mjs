// npm run demo
// The development server with the fake GPS switched on, without editing .env.local.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const next = path.join(path.dirname(createRequire(import.meta.url).resolve("next/package.json")), "dist", "bin", "next");
const env = { ...process.env, JEC_DATASET: "demo", NEXT_PUBLIC_ENABLE_DEMO: "1" };
const run = (...args) => spawnSync(process.execPath, args, { stdio: "inherit", env }).status ?? 1;

const prepared = run("scripts/copy-maplibre-worker.mjs") || run("--import", "tsx", "scripts/publish-data.ts");
if (prepared !== 0) process.exit(prepared);

console.log("\nOpen http://localhost:3000/?mock=1 and press MOCK GPS at the top.\n");
process.exit(run(next, "dev", ...process.argv.slice(2)));
