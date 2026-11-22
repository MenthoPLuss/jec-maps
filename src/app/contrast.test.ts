import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MAP_THEMES } from "@/lib/map/theme";

const css = readFileSync(path.join(import.meta.dirname, "globals.css"), "utf8");
const block = (from: string) => css.slice(css.indexOf(from), css.indexOf("}", css.indexOf(from)));
const colours = (text: string) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));

const light = colours(block(":root {"));
const dark = colours(block("@media (prefers-color-scheme: dark) {\n  :root {"));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe.each([
  ["light", light],
  ["dark", dark],
])("%s colours", (name, theme) => {
  it.each([
    ["ink", "surface"],
    ["ink", "surface-2"],
    ["ink-muted", "surface"],
    ["ink-muted", "surface-2"],
    ["accent", "surface"],
    ["accent-ink", "accent"],
    ["good", "surface"],
    ["warn", "warn-surface"],
    ["danger", "danger-surface"],
  ])("%s on %s is readable (WCAG AA, 4.5)", (text, background) => {
    expect(theme[text], `${name} has no ${text}`).toBeDefined();
    expect(contrast(theme[text], theme[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("map labels stand out from their halo and the ground", () => {
    const map = MAP_THEMES[name as "light" | "dark"];
    expect(contrast(map.label, map.labelHalo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(map.label, map.campus)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(map.route, map.campus)).toBeGreaterThanOrEqual(3);
    expect(contrast(map.routeUnverified, map.campus)).toBeGreaterThanOrEqual(3);
  });
});
