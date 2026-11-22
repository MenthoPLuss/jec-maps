// Starts Vitest from the real path of the project.
//
// On Windows a terminal can start in "c:\..." instead of "C:\...". Node treats the
// two as different folders, loads Vitest twice, and every test file then fails with
// "Cannot read properties of undefined (reading 'config')". Harmless elsewhere.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

const root = realpathSync.native(process.cwd());
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");

const { status } = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

process.exit(status ?? 1);
