// Builds the app three times and starts three servers for the browser tests.
//   3100  normal: no demo tools, local map, as visitors get it
//   3101  demo:   with the fake GPS
//   3102  online: asks before it loads a street map
// All of them use the made-up campus, never real data.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const next = path.join(path.dirname(createRequire(import.meta.url).resolve("next/package.json")), "dist", "bin", "next");

const VARIANTS = [
  { port: 3100, dir: ".next", demo: "0", map: "local" },
  { port: 3101, dir: ".next-demo", demo: "1", map: "local" },
  { port: 3102, dir: ".next-online", demo: "0", map: "online" },
];

const environment = ({ dir, demo, map }) => ({
  ...process.env,
  JEC_DATASET: "demo",
  NEXT_DIST_DIR: dir,
  NEXT_PUBLIC_ENABLE_DEMO: demo,
  NEXT_PUBLIC_MOCK_LOCATION: "0",
  NEXT_PUBLIC_BASEMAP_MODE: map,
  // Reserved name that can't exist: the tests answer for it themselves.
  NEXT_PUBLIC_TILE_URL: "https://tiles.example.test/style.json",
  NEXT_PUBLIC_TILE_ATTRIBUTION: "",
});

function run(args, env) {
  const { status } = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (status !== 0) process.exit(status ?? 1);
}

run(["scripts/copy-maplibre-worker.mjs"], process.env);
run(["--import", "tsx", "scripts/publish-data.ts"], { ...process.env, JEC_DATASET: "demo" });
for (const variant of VARIANTS) run([next, "build"], environment(variant));

const servers = VARIANTS.map((variant) =>
  spawn(process.execPath, [next, "start", "-p", String(variant.port)], { stdio: "inherit", env: environment(variant) }),
);
const stop = () => {
  for (const server of servers) server.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
