/** Reads a dataset folder from disk and checks it completely. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { checkDataset } from "../../src/lib/data/checks";
import { MANIFEST_FILE } from "../../src/lib/data/constants";
import { coverageOf } from "../../src/lib/data/coverage";
import { parseDataset, parseManifest, type Dataset, type Issue, type RawFiles } from "../../src/lib/data/parse";

export interface CheckedDataset {
  /** Null when there is any error. */
  dataset: Dataset | null;
  issues: Issue[];
}

export function checkDatasetFolder(folder: string): CheckedDataset {
  const issues: Issue[] = [];
  const files: RawFiles = {};

  readInto(files, folder, MANIFEST_FILE, issues);
  const { manifest } = parseManifest(files[MANIFEST_FILE]);
  if (manifest) {
    const { levels, ...single } = manifest.files;
    for (const name of [...Object.values(single), ...levels.map((level) => level.path)]) {
      readInto(files, folder, name, issues);
    }
  }
  if (issues.length > 0) return { dataset: null, issues };

  const parsed = parseDataset(files);
  issues.push(...parsed.issues);
  if (!parsed.dataset) return { dataset: null, issues };

  issues.push(...checkDataset(parsed.dataset));
  if (hasErrors(issues)) return { dataset: null, issues };

  issues.push(...coverageOf(parsed.dataset).issues);
  return { dataset: parsed.dataset, issues };
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** "ERROR rooms.json › ee-204 › level: there is no level 3" */
export function formatIssue(issue: Issue): string {
  const where = [issue.file, issue.record, issue.field].filter(Boolean).join(" › ");
  return `${issue.severity === "error" ? "ERROR  " : "warning"} ${where}: ${issue.message}`;
}

/** Puts the parsed JSON of a file into `files`. A missing file is left out: the parser reports it. */
function readInto(files: RawFiles, folder: string, name: string, issues: Issue[]): void {
  const file = path.join(folder, ...name.split("/"));
  if (!existsSync(file)) return;
  try {
    files[name] = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    issues.push({
      severity: "error",
      file: name,
      record: "file",
      field: "",
      message: `is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}
