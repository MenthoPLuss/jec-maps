import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const BINARY = /\.(ico|jpe?g|png|webp|woff2)$/i;

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((file) => file && existsSync(path.join(root, file)));

describe("repository hygiene", () => {
  it("keeps every text file valid UTF-8 without stray NUL bytes", () => {
    const broken = tracked.filter((file) => {
      if (BINARY.test(file)) return false;
      const bytes = readFileSync(path.join(root, file));
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return true;
      }
      return bytes.includes(0);
    });

    expect(broken).toEqual([]);
  });

  it("does not track generated files, secrets or raw media", () => {
    const forbidden = tracked.filter(
      (file) =>
        file.startsWith("public/maplibre/") ||
        file.startsWith("test-results/") ||
        file.startsWith("playwright-report/") ||
        (/(^|\/)\.env/.test(file) && !file.endsWith(".env.example")) ||
        (file.startsWith("raw-data/") &&
          !["raw-data/README.md", "raw-data/places.template.csv", "raw-data/rooms.template.csv"].includes(file)),
    );

    expect(forbidden).toEqual([]);
  });
});
