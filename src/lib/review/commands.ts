/** The commands that the review page writes for the terminal. */

/** The files that `npm run data:osm` writes. Everything else comes from raw-data. */
const OSM_FILES = new Set(["boundaries.candidates.geojson", "buildings.candidates.geojson", "paths.candidates.geojson"]);

/** Where a candidate file of this name belongs, from the project folder. */
export function candidatePath(fileName: string): string {
  return `${OSM_FILES.has(fileName) ? "data-candidates/osm" : "raw-data/candidates"}/${fileName}`;
}

/** Null when the file name can go into a command, otherwise what to do. */
export function fileNameProblem(fileName: string): string | null {
  return /^[\w.-]+$/.test(fileName)
    ? null
    : `Rename ${fileName} so that it has only letters, digits, dots and dashes, and open it again.`;
}

/** Null when the name can go into a command as it is, otherwise what is wrong. */
export function reviewerProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Type your name: it is saved with every record you approve.";
  if (trimmed.length > 60) return "That name is too long.";
  // Nothing that a terminal could read as part of a command: no quotes, $ or `.
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u.test(trimmed)) {
    return "Use only letters, digits, spaces, dots, dashes and apostrophes.";
  }
  return null;
}

export type PathAccess = "public" | "restricted" | "private";

export interface ApproveRequest {
  fileName: string;
  ids: string[];
  reviewer: string;
  /** Paths only: who may walk there. */
  access?: PathAccess;
}

/** Windows can't take very long commands, so long lists become several commands. */
const MAX_COMMAND_LENGTH = 2_000;

/**
 * Commands that work the same in PowerShell, the Windows command prompt and bash.
 * Approving the same record twice changes nothing, so the parts can run in any order.
 */
export function approveCommands({ fileName, ids, reviewer, access }: ApproveRequest): string[] {
  if (ids.length === 0 || fileNameProblem(fileName) || reviewerProblem(reviewer)) return [];

  const start = `npm run data:approve -- --file ${candidatePath(fileName)} --ids `;
  const end = `${access ? ` --access ${access}` : ""} --reviewer "${reviewer.trim()}"`;
  const room = MAX_COMMAND_LENGTH - start.length - end.length;

  const parts: string[][] = [[]];
  let used = 0;
  for (const id of ids) {
    const current = parts[parts.length - 1];
    if (current.length > 0 && used + 1 + id.length > room) {
      parts.push([id]);
      used = id.length;
    } else {
      used += (current.length > 0 ? 1 : 0) + id.length;
      current.push(id);
    }
  }
  return parts.map((part) => `${start}${part.join(",")}${end}`);
}
