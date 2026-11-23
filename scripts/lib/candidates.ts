/** Candidate files: proposals for a person to review. The app never reads them. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseCandidates, type CandidateFile, type CandidateKind } from "../../src/lib/review/candidates";
import { writeFilesAtomically } from "./atomicWrite";
import { formatCollection, formatJson } from "./format";

export type { CandidateFile, CandidateKind };

export interface Changes {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface WriteReport {
  name: string;
  changes: Changes;
  written: boolean;
}

/**
 * Replaces the candidate files of a folder, all or none. A file whose records did
 * not change is left alone, even if it was retrieved at another time.
 */
export function writeCandidates(folder: string, files: Record<string, CandidateFile>, dryRun: boolean): WriteReport[] {
  const reports: WriteReport[] = [];
  const toWrite: Record<string, string> = {};

  for (const [name, file] of Object.entries(files)) {
    const before = readCandidates(path.join(folder, name))?.records ?? null;
    const changes = changesBetween(before ?? [], file.records);
    const needed = before === null || changes.added.length + changes.removed.length + changes.changed.length > 0;
    if (needed) toWrite[name] = formatCandidates(file);
    reports.push({ name, changes, written: needed && !dryRun });
  }

  if (!dryRun && Object.keys(toWrite).length > 0) writeFilesAtomically(folder, toWrite);
  return reports;
}

function formatCandidates({ kind, provenance, records }: CandidateFile): string {
  const head = { candidates: true, kind, ...provenance };
  const features = records.every((record) => "geometry" in record);
  return features ? formatCollection(records, head) : formatJson({ ...head, records });
}

/** Null when there is no such file. Throws when the file is not a candidate file. */
export function readCandidates(file: string): CandidateFile | null {
  if (!existsSync(file)) return null;
  return parseCandidates(readFileSync(file, "utf8"), file);
}

export function changesBetween(before: object[], after: object[]): Changes {
  const old = new Map(before.map((record) => [nameOf(record), JSON.stringify(record)]));
  const current = new Map(after.map((record) => [nameOf(record), JSON.stringify(record)]));

  return {
    added: [...current.keys()].filter((id) => !old.has(id)),
    removed: [...old.keys()].filter((id) => !current.has(id)),
    changed: [...current.keys()].filter((id) => old.has(id) && old.get(id) !== current.get(id)),
  };
}

export function formatChanges({ name, changes, written }: WriteReport): string {
  const { added, removed, changed } = changes;
  const total = added.length + removed.length + changed.length;
  const parts = [`${added.length} new`, `${changed.length} changed`, `${removed.length} gone`].join(", ");
  return `  ${name}: ${total === 0 ? "no changes" : parts}${total > 0 && !written ? " (not written)" : ""}`;
}

function nameOf(record: object): string {
  const value = record as { id?: string; properties?: { id?: string }; buildingId?: string; photo?: string };
  return value.properties?.id ?? value.id ?? `${value.buildingId ?? ""}/${value.photo ?? ""}`;
}
