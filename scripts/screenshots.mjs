// npm run screenshots
// Takes new pictures for docs/screenshots. The made-up campus, never a real position.
import { spawnSync } from "node:child_process";
import path from "node:path";

const { status } = spawnSync(
  process.execPath,
  [path.join("node_modules", "@playwright", "test", "cli.js"), "test", "--project=demo", "screenshots", "--trace", "off"],
  { stdio: "inherit", env: { ...process.env, SCREENSHOTS: "1" } },
);
process.exit(status ?? 1);
