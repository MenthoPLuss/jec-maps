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
      renameWithRetry(entry.temporary, entry.target);
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

/** What Windows says while another program, often a virus scanner, has a file open. */
const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);
const RETRY_DELAYS_MS = [50, 100, 200, 400, 800];

/** `renameSync`, tried again for a moment while Windows keeps the file busy. */
export function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || !code || !BUSY.has(code) || attempt >= RETRY_DELAYS_MS.length) throw error;
      // A synchronous pause: the scripts that call this are synchronous throughout.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAYS_MS[attempt]);
    }
  }
}
