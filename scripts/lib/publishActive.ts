/**
 * Checks the active dataset and writes what the app downloads to public/data.
 *
 * The active dataset is src/data/live when it exists, otherwise src/data/demo.
 * JEC_DATASET=demo forces the demo, which is what the browser tests use.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { MANIFEST_FILE } from "../../src/lib/data/constants";
import type { Issue } from "../../src/lib/data/parse";
import { publishDataset } from "../../src/lib/data/publish";
import { renameWithRetry, writeFilesAtomically } from "./atomicWrite";
import { checkDatasetFolder, hasErrors } from "./datasetFolder";

export type PublishResult =
  | { ok: true; name: string; datasetVersion: string; warnings: number }
  | { ok: false; name: string; errors: Issue[] };

export function activeDataset(root: string, wanted = process.env.JEC_DATASET): "demo" | "live" {
  if (wanted !== undefined && wanted !== "" && wanted !== "demo" && wanted !== "live") {
    throw new Error(`JEC_DATASET must be demo or live, not "${wanted}"`);
  }
  if (wanted) return wanted;
  return existsSync(path.join(root, "src", "data", "live", MANIFEST_FILE)) ? "live" : "demo";
}

/** Replaces public/data completely, or leaves it alone when the data is broken. */
export function publishActive(root: string): PublishResult {
  const name = activeDataset(root);
  const { dataset, issues } = checkDatasetFolder(path.join(root, "src", "data", name));
  if (!dataset || hasErrors(issues)) {
    return { ok: false, name, errors: issues.filter((issue) => issue.severity === "error") };
  }

  const { core, indoor } = publishDataset(dataset);
  const files: Record<string, string> = { "core.json": JSON.stringify(core) };
  for (const plans of indoor) files[`indoor/${plans.buildingId}.json`] = JSON.stringify(plans);

  const publicFolder = path.join(root, "public");
  const output = path.join(publicFolder, "data");
  mkdirSync(publicFolder, { recursive: true });
  removeLeftovers(publicFolder);

  // Build the new folder completely, then swap it in. The old one stays until the
  // new one is in place, and comes back if the swap fails.
  const staging = mkdtempSync(path.join(publicFolder, ".data-new-"));
  const previous = path.join(publicFolder, `.data-old-${process.pid}`);
  try {
    writeFilesAtomically(staging, files);
    const hadData = existsSync(output);
    if (hadData) renameWithRetry(output, previous);
    try {
      renameWithRetry(staging, output);
    } catch (error) {
      if (hadData) renameWithRetry(previous, output);
      throw error;
    }
  } finally {
    removeQuietly(staging);
    // Never the only copy: without data in place, the old folder stays for a person to rescue.
    if (existsSync(output)) removeQuietly(previous);
  }

  return { ok: true, name, datasetVersion: core.datasetVersion, warnings: issues.length };
}

/** Folders of a publish that was interrupted. Everything in public/ is served. */
function removeLeftovers(publicFolder: string): void {
  for (const entry of readdirSync(publicFolder)) {
    if (entry.startsWith(".data-")) removeQuietly(path.join(publicFolder, entry));
  }
}

function removeQuietly(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(`Could not remove ${folder}: ${error instanceof Error ? error.message : error}`);
  }
}
