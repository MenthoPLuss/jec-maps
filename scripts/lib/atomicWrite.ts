/** Replaces a set of files all at once: either every file changes or none does. */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Writes every file next to its target first, and only then swaps them in. If a
 * swap fails, the files already swapped get their old content back.
 */
export function writeFilesAtomically(folder: string, files: Record<string, string>): void {
  const staged: { target: string; temporary: string; previous: Buffer | null }[] = [];

  try {
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(folder, ...name.split("/"));
      const temporary = `${target}.tmp-${process.pid}`;
      mkdirSync(path.dirname(target), { recursive: true });
      staged.push({ target, temporary, previous: existsSync(target) ? readFileSync(target) : null });
      writeFileSync(temporary, content, "utf8");
    }
  } catch (error) {
    for (const { temporary } of staged) rmSync(temporary, { force: true });
    throw error;
  }

  const swapped: typeof staged = [];
  try {
    for (const entry of staged) {
      renameSync(entry.temporary, entry.target);
      swapped.push(entry);
    }
  } catch (error) {
    for (const { target, previous } of swapped) {
      if (previous === null) rmSync(target, { force: true });
      else writeFileSync(target, previous);
    }
    for (const { temporary } of staged) rmSync(temporary, { force: true });
    throw error;
  }
}
