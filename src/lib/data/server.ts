/** The published campus data while pages are built. Only for server components. */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PublishedDataset } from "./published";

let cached: Promise<PublishedDataset> | null = null;

/** Written by scripts/publish-data.ts before every dev start and build. */
export function readPublished(): Promise<PublishedDataset> {
  cached ??= readFile(path.join(process.cwd(), "public", "data", "core.json"), "utf8").then(
    (text) => JSON.parse(text) as PublishedDataset,
  );
  return cached;
}
